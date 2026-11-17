<?php
declare(strict_types=1);

namespace Hambak\Services;

require_once __DIR__ . '/SmtpTransport.php';

use Hambak\Core\Database;
use InvalidArgumentException;
use PDO;
use RuntimeException;

/**
 * Centralized Transactional Email Service
 * Manages SMTP configuration, template rendering, and delivery auditing via CommunicationDelivery.
 */
class EmailService
{
    private static ?self $instance = null;
    private Database $db;
    private string $encryptionKey;

    public const CONFIG_ID = 'default';

    /**
     * Canonical template aliases to resolve legacy or alternative event codes.
     */
    public const TEMPLATE_ALIASES = [
        // Auth & Accounts
        'WELCOME'                     => 'WELCOME_VERIFICATION',
        'WELCOME_CUSTOMER'            => 'WELCOME_VERIFICATION',
        'EMAIL_VERIFICATION'          => 'WELCOME_VERIFICATION',
        'RESET_PASSWORD'              => 'PASSWORD_RESET',
        'PASSWORD_OTP'                => 'PASSWORD_RESET_OTP',
        'PASSWORD_CHANGED'            => 'PASSWORD_CHANGE_CONFIRMATION',
        'ACCOUNT_STATUS_CHANGE'       => 'ACCOUNT_STATUS',
        'ACCOUNT_UPDATED'             => 'ACCOUNT_STATUS',
        'LOGIN_ALERT'                 => 'SECURITY_ALERT',
        'LOGIN_NOTIFICATION'          => 'SECURITY_ALERT',

        // Payments & Receipts
        'PAYMENT_RECEIVED'            => 'PAYMENT_CONFIRMATION',
        'PAYMENT_CONFIRMED'           => 'PAYMENT_CONFIRMATION',
        'PAYMENT_SUCCESS'             => 'PAYMENT_CONFIRMATION',
        'PAYMENT_SUCCESSFUL'          => 'PAYMENT_CONFIRMATION',
        'TRANSACTION_SUCCESS'         => 'PAYMENT_CONFIRMATION',
        'TRANSACTION_SUCCESSFUL'      => 'PAYMENT_CONFIRMATION',
        'PAYMENT_FAILED'              => 'PAYMENT_FAILURE',
        'TRANSACTION_FAILED'          => 'PAYMENT_FAILURE',
        'PAYMENT_PENDING'             => 'PAYMENT_PENDING',

        // Wallet
        'WALLET_CREDITED'             => 'WALLET_FUNDING_CONFIRMATION',
        'WALLET_FUNDING'              => 'WALLET_FUNDING_CONFIRMATION',
        'WALLET_CREDIT'               => 'WALLET_FUNDING_CONFIRMATION',
        'WALLET_CREDIT_CONFIRMATION'  => 'WALLET_FUNDING_CONFIRMATION',
        'WALLET_DEBIT'                => 'WALLET_DEBIT_CONFIRMATION',
        'MANUAL_DEPOSIT_APPROVED'     => 'MANUAL_FUNDING_APPROVED',
        'MANUAL_DEPOSIT_REJECTED'     => 'MANUAL_FUNDING_REJECTED',

        // Orders & Services
        'ORDER_CREATED'               => 'ORDER_CONFIRMATION',
        'ORDER_PLACED'                => 'ORDER_CONFIRMATION',
        'SERVICE_REQUEST_RECEIVED'    => 'ORDER_CONFIRMATION',
        'ORDER_STATUS_UPDATE'         => 'ORDER_STATUS_CHANGE',
        'ORDER_PROCESSING'            => 'ORDER_PROCESSING',
        'SERVICE_PROCESSING'          => 'ORDER_PROCESSING',
        'ORDER_COMPLETED'             => 'SERVICE_COMPLETION',
        'SERVICE_COMPLETED'           => 'SERVICE_COMPLETION',
        'ORDER_FAILED'                => 'ORDER_FAILED',
        'SERVICE_FAILED'              => 'ORDER_FAILED',
        'ORDER_CANCELLED'             => 'ORDER_CANCELLED',

        // Telecom & VTU
        'AIRTIME_PURCHASE'            => 'VTU_TRANSACTION_SUCCESS',
        'AIRTIME_PURCHASE_SUCCESS'    => 'VTU_TRANSACTION_SUCCESS',
        'DATA_PURCHASE'               => 'VTU_TRANSACTION_SUCCESS',
        'DATA_PURCHASE_SUCCESS'       => 'VTU_TRANSACTION_SUCCESS',
        'VTU_SUCCESS'                 => 'VTU_TRANSACTION_SUCCESS',
        'VTU_FAILED'                  => 'VTU_TRANSACTION_FAILED',

        // Identity Services (NIN / BVN)
        'NIN_STATUS_UPDATE'           => 'NIN_SERVICE_STATUS',
        'NIN_VERIFICATION'            => 'NIN_VERIFICATION_COMPLETED',
        'NIN_COMPLETED'               => 'NIN_VERIFICATION_COMPLETED',
        'BVN_VERIFICATION'            => 'BVN_VERIFICATION_COMPLETED',
        'BVN_COMPLETED'               => 'BVN_VERIFICATION_COMPLETED',
        'IDENTITY_RESULT'             => 'IDENTITY_VERIFICATION_RESULT',

        // Manual Desk Orders & Deliveries
        'MANUAL_DESK_ORDER'           => 'MANUAL_DESK_ORDER_RECEIVED',
        'MANUAL_DESK_RECEIVED'        => 'MANUAL_DESK_ORDER_RECEIVED',
        'MANUAL_DESK_PROCESSING'      => 'MANUAL_DESK_PROCESSING',
        'MANUAL_DESK_COMPLETED'       => 'MANUAL_DESK_COMPLETED',
        'MANUAL_DESK_DOC_READY'       => 'MANUAL_DESK_RESULT_READY',
        'MANUAL_DESK_READY'           => 'MANUAL_DESK_RESULT_READY',

        // Academy
        'ACADEMY_ADMISSION_UPDATE'    => 'ACADEMY_ADMISSION_STATUS',

        // Support
        'SUPPORT_TICKET_REPLY'        => 'SUPPORT_TICKET_UPDATE',
    ];

    public function __construct()
    {
        $this->db = Database::getInstance();
        $secret = $_ENV['ENCRYPTION_KEY'] 
            ?? $_ENV['JWT_SECRET'] 
            ?? getenv('ENCRYPTION_KEY') 
            ?? getenv('JWT_SECRET');

        $appEnv = $_ENV['APP_ENV'] ?? getenv('APP_ENV') ?? 'development';
        $isProduction = ($appEnv === 'production');

        if (empty($secret)) {
            if ($isProduction) {
                throw new RuntimeException('SECURITY FATAL: ENCRYPTION_KEY or JWT_SECRET must be configured in production environment. Failing closed.');
            }
            // Strictly isolated test-fixture key for offline testing only — cannot be used in production
            $secret = 'test_fixture_only_deterministic_key';
        }

        $this->encryptionKey = hash('sha256', (string)$secret, true);
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Get decrypted internal SMTP configuration.
     */
    public function getConfig(): array
    {
        $conn = $this->db->getConnection();
        $stmt = $conn->query("SELECT * FROM `SmtpConfig` WHERE `id` = 'default' LIMIT 1");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $host = getenv('SMTP_HOST') ?: 'mail.hambaktech.com.ng';
        $port = (int)(getenv('SMTP_PORT') ?: 465);
        $encryption = getenv('SMTP_ENCRYPTION') ?: 'ssl';
        $username = getenv('SMTP_USERNAME') ?: '';
        $password = getenv('SMTP_PASSWORD') ?: '';
        $fromEmail = getenv('EMAIL_FROM') ?: 'no-reply@hambaktech.com.ng';
        $fromName = 'HambakTech';
        $replyTo = null;
        $isActive = true;
        $isVerified = false;
        $lastTestedAt = null;
        $lastTestStatus = null;
        $lastTestError = null;

        if ($row) {
            $host = !empty($row['host']) ? $row['host'] : $host;
            $port = !empty($row['port']) ? (int)$row['port'] : $port;
            $encryption = !empty($row['encryption']) ? $row['encryption'] : $encryption;
            $username = $row['username'] ?? $username;
            $fromEmail = !empty($row['fromEmail']) ? $row['fromEmail'] : $fromEmail;
            $fromName = !empty($row['fromName']) ? $row['fromName'] : $fromName;
            $replyTo = $row['replyToEmail'] ?? null;
            $isActive = (bool)($row['isActive'] ?? 1);
            $isVerified = (bool)($row['isVerified'] ?? 0);
            $lastTestedAt = $row['lastTestedAt'] ?? null;
            $lastTestStatus = $row['lastTestStatus'] ?? null;
            $lastTestError = $row['lastTestError'] ?? null;

            if (!empty($row['passwordEncrypted'])) {
                $decrypted = $this->decrypt($row['passwordEncrypted']);
                if ($decrypted !== false && $decrypted !== '') {
                    $password = $decrypted;
                }
            }
        }

        return [
            'host' => $host,
            'port' => $port,
            'encryption' => $encryption,
            'username' => $username,
            'password' => $password,
            'fromEmail' => $fromEmail,
            'fromName' => $fromName,
            'replyToEmail' => $replyTo,
            'isActive' => $isActive,
            'isVerified' => $isVerified,
            'lastTestedAt' => $lastTestedAt,
            'lastTestStatus' => $lastTestStatus,
            'lastTestError' => $lastTestError,
            'isConfigured' => (!empty($host) && !empty($username) && !empty($password)),
        ];
    }

    /**
     * Get safe public configuration for Admin UI (password is NEVER exposed).
     */
    public function getPublicConfig(): array
    {
        $cfg = $this->getConfig();
        $hasPassword = !empty($cfg['password']);

        return [
            'host' => $cfg['host'],
            'port' => $cfg['port'],
            'encryption' => $cfg['encryption'],
            'username' => $cfg['username'],
            'fromEmail' => $cfg['fromEmail'],
            'fromName' => $cfg['fromName'],
            'replyToEmail' => $cfg['replyToEmail'],
            'isActive' => (bool)$cfg['isActive'],
            'isVerified' => (bool)$cfg['isVerified'],
            'lastTestedAt' => $cfg['lastTestedAt'],
            'lastTestStatus' => $cfg['lastTestStatus'],
            'lastTestError' => $cfg['lastTestError'],
            'isConfigured' => (bool)$cfg['isConfigured'],
            'hasPassword' => $hasPassword,
            'passwordMasked' => $hasPassword ? '••••••••••••' : '',
        ];
    }

    /**
     * Save SMTP settings from Admin dashboard.
     */
    public function saveConfig(array $data, ?string $adminUserId = null): array
    {
        $host = trim($data['host'] ?? '');
        $port = (int)($data['port'] ?? 465);
        $encryption = strtolower(trim($data['encryption'] ?? 'ssl'));
        $username = trim($data['username'] ?? '');
        $newPassword = $data['password'] ?? null;
        $fromEmail = trim($data['fromEmail'] ?? 'no-reply@hambaktech.com.ng');
        $fromName = trim($data['fromName'] ?? 'HambakTech');
        $replyTo = !empty($data['replyToEmail']) ? trim($data['replyToEmail']) : null;
        $isActive = isset($data['isActive']) ? (bool)$data['isActive'] : true;

        if (empty($host)) {
            throw new InvalidArgumentException('SMTP host is required');
        }
        if ($port < 1 || $port > 65535) {
            throw new InvalidArgumentException('Invalid port number');
        }
        if (!in_array($encryption, ['ssl', 'tls', 'none'], true)) {
            throw new InvalidArgumentException('Encryption must be ssl, tls, or none');
        }
        if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid sender (From) email address is required');
        }
        if ($replyTo !== null && !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Invalid Reply-To email address format');
        }

        $conn = $this->db->getConnection();
        $existing = $conn->query("SELECT `passwordEncrypted` FROM `SmtpConfig` WHERE `id` = 'default' LIMIT 1")->fetch(PDO::FETCH_ASSOC);

        $passwordEncrypted = $existing['passwordEncrypted'] ?? null;
        if ($newPassword !== null && $newPassword !== '' && $newPassword !== '••••••••••••') {
            $passwordEncrypted = $this->encrypt($newPassword);
        }

        $stmt = $conn->prepare("
            INSERT INTO `SmtpConfig`
                (`id`, `host`, `port`, `encryption`, `username`, `passwordEncrypted`, `fromEmail`, `fromName`, `replyToEmail`, `isActive`, `updatedAt`)
            VALUES
                ('default', :host, :port, :enc, :user, :pass, :fromEmail, :fromName, :replyTo, :active, NOW(3))
            ON DUPLICATE KEY UPDATE
                `host` = VALUES(`host`),
                `port` = VALUES(`port`),
                `encryption` = VALUES(`encryption`),
                `username` = VALUES(`username`),
                `passwordEncrypted` = VALUES(`passwordEncrypted`),
                `fromEmail` = VALUES(`fromEmail`),
                `fromName` = VALUES(`fromName`),
                `replyToEmail` = VALUES(`replyToEmail`),
                `isActive` = VALUES(`isActive`),
                `updatedAt` = NOW(3)
        ");

        $stmt->execute([
            ':host' => $host,
            ':port' => $port,
            ':enc' => $encryption,
            ':user' => $username,
            ':pass' => $passwordEncrypted,
            ':fromEmail' => $fromEmail,
            ':fromName' => $fromName,
            ':replyTo' => $replyTo,
            ':active' => $isActive ? 1 : 0,
        ]);

        return $this->getPublicConfig();
    }

    /**
     * Reset outbound SMTP configuration to unconfigured defaults.
     */
    public function resetConfig(?string $updatedBy = null): array
    {
        $conn = $this->db->getConnection();
        $stmt = $conn->prepare("
            INSERT INTO `SmtpConfig` (
                `id`, `enabled`, `isActive`, `provider`, `host`, `port`, `username`,
                `passwordEncrypted`, `encryption`, `fromEmail`, `fromName`, `replyToEmail`,
                `isVerified`, `lastTestedAt`, `lastTestStatus`, `lastTestError`, `updatedBy`, `updatedAt`
            ) VALUES (
                'default', 0, 0, 'SMTP', '', 587, '', NULL, 'tls', 'support@hambaktech.com.ng',
                'HAMBAK TECH & SERVICES', NULL, 0, NULL, NULL, NULL, :updatedBy1, NOW(3)
            )
            ON DUPLICATE KEY UPDATE
                `enabled` = 0,
                `isActive` = 0,
                `host` = '',
                `port` = 587,
                `username` = '',
                `passwordEncrypted` = NULL,
                `encryption` = 'tls',
                `fromEmail` = 'support@hambaktech.com.ng',
                `fromName` = 'HAMBAK TECH & SERVICES',
                `replyToEmail` = NULL,
                `isVerified` = 0,
                `lastTestedAt` = NULL,
                `lastTestStatus` = NULL,
                `lastTestError` = NULL,
                `updatedBy` = :updatedBy2,
                `updatedAt` = NOW(3)
        ");
        $stmt->execute([':updatedBy1' => $updatedBy, ':updatedBy2' => $updatedBy]);

        return $this->getPublicConfig();
    }

    /**
     * Test SMTP connection and dispatch verification test message.
     */
    public function testSmtp(string $recipient, ?array $override = null): array
    {
        $cfg = $this->getConfig();
        if ($override) {
            $cfg = array_merge($cfg, $override);
            if (!empty($override['password'])) {
                $cfg['password'] = $override['password'];
            }
        }

        if (empty($cfg['host'])) {
            return [
                'success' => false,
                'latencyMs' => 0,
                'message' => 'SMTP host is not configured.',
                'error' => 'Missing host configuration',
            ];
        }

        $transport = new SmtpTransport(
            $cfg['host'],
            (int)$cfg['port'],
            $cfg['encryption'],
            $cfg['username'],
            $cfg['password'],
            12
        );

        $startTime = microtime(true);
        $subject = 'HambakTech SMTP Diagnostic Test — ' . date('Y-m-d H:i:s');
        $html = "
            <div style='font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;'>
                <h2 style='color: #2563eb;'>SMTP Configuration Verified</h2>
                <p>This is an automated diagnostic test message sent from the <strong>HambakTech Smart Digital Platform</strong>.</p>
                <div style='background: #f8fafc; padding: 12px; border-radius: 6px; font-size: 13px;'>
                    <p style='margin: 4px 0;'><strong>Host:</strong> {$cfg['host']}:{$cfg['port']} ({$cfg['encryption']})</p>
                    <p style='margin: 4px 0;'><strong>Username:</strong> {$cfg['username']}</p>
                    <p style='margin: 4px 0;'><strong>Sender:</strong> {$cfg['fromName']} &lt;{$cfg['fromEmail']}&gt;</p>
                    <p style='margin: 4px 0;'><strong>Timestamp:</strong> " . gmdate('Y-m-d\TH:i:s\Z') . "</p>
                </div>
                <p style='color: #64748b; font-size: 12px; margin-top: 20px;'>HambakTech Production Communications Engine</p>
            </div>
        ";
        $text = "SMTP Configuration Verified.\nHost: {$cfg['host']}:{$cfg['port']} ({$cfg['encryption']})\nTimestamp: " . gmdate('Y-m-d\TH:i:s\Z');

        $result = $transport->send(
            $cfg['fromEmail'],
            $cfg['fromName'],
            $recipient,
            $subject,
            $html,
            $text,
            $cfg['replyToEmail'] ?? null
        );

        $latencyMs = (int)round((microtime(true) - $startTime) * 1000);

        // Update database with test results
        $conn = $this->db->getConnection();
        $status = $result['success'] ? 'SUCCESS' : 'FAILED';
        $error = $result['error'] ?? null;

        $upd = $conn->prepare("
            UPDATE `SmtpConfig`
            SET `isVerified` = :verified,
                `lastTestedAt` = NOW(3),
                `lastTestStatus` = :status,
                `lastTestError` = :err,
                `updatedAt` = NOW(3)
            WHERE `id` = 'default'
        ");
        $upd->execute([
            ':verified' => $result['success'] ? 1 : 0,
            ':status' => $status,
            ':err' => $error ? mb_substr($error, 0, 500) : null,
        ]);

        // Audit log in CommunicationDelivery
        $this->logDelivery(
            null,
            $recipient,
            $result['success'] ? 'SENT' : 'FAILED',
            $result['messageId'] ?? null,
            $error
        );

        return [
            'success' => $result['success'],
            'latencyMs' => $latencyMs,
            'message' => $result['success']
                ? "Test email dispatched successfully to {$recipient} in {$latencyMs}ms."
                : "SMTP test dispatch failed: " . ($result['error'] ?? 'Unknown socket error'),
            'error' => $result['error'] ?? null,
            'transcript' => $transport->getTranscript(),
        ];
    }

    /**
     * Wrap HTML in HambakTech branded responsive layout if not already wrapped.
     */
    public function wrapBrandedLayout(string $subject, string $htmlContent): string
    {
        if (str_contains($htmlContent, '<!DOCTYPE') || str_contains($htmlContent, '<html')) {
            return $htmlContent;
        }

        return $this->wrapInBrandedEmailShell([
            'title' => $subject,
            'headline' => $subject,
            'bodyHtml' => $htmlContent,
        ]);
    }

    /**
     * Send transactional email with delivery auditing in CommunicationDelivery table.
     */
    public function send(
        string $toEmail,
        string $subject,
        string $htmlContent,
        string $textContent = '',
        ?string $notificationId = null,
        array $meta = []
    ): array {
        $toEmail = trim($toEmail);
        $deliveryId = 'cd-' . bin2hex(random_bytes(16));
        $cfg = $this->getConfig();

        // 1. Wrap HTML in HambakTech branded responsive layout
        $fullHtml = $this->wrapBrandedLayout($subject, $htmlContent);

        // 2. Create initial Delivery record
        $this->createDeliveryRecord($deliveryId, $notificationId, $toEmail, 'PENDING', null, null);

        $result = ['success' => false, 'error' => null];

        // 3. Attempt direct SMTP if host and credentials are present
        if ($cfg['isActive'] && !empty($cfg['host']) && !empty($cfg['username']) && !empty($cfg['password'])) {
            try {
                $transport = new SmtpTransport(
                    $cfg['host'],
                    (int)$cfg['port'],
                    $cfg['encryption'],
                    $cfg['username'],
                    $cfg['password'],
                    15
                );

                $result = $transport->send(
                    $cfg['fromEmail'],
                    $cfg['fromName'],
                    $toEmail,
                    $subject,
                    $fullHtml,
                    $textContent,
                    $cfg['replyToEmail'] ?? null
                );
            } catch (\Throwable $smtpErr) {
                $result = ['success' => false, 'error' => $smtpErr->getMessage()];
            }
        }

        // 4. Reliable cPanel MTA Fallback: If SMTP is unconfigured or failed, deliver via PHP native mail() / local Exim if available
        if (empty($result['success']) && function_exists('mail')) {
            $fromEmail = !empty($cfg['fromEmail']) ? $cfg['fromEmail'] : 'support@hambaktech.com.ng';
            $fromName = !empty($cfg['fromName']) ? $cfg['fromName'] : 'HAMBAK TECH & SERVICES';
            $replyTo = !empty($cfg['replyToEmail']) ? $cfg['replyToEmail'] : 'support@hambaktech.com.ng';
            $serverName = $_SERVER['SERVER_NAME'] ?? 'hambaktech.com.ng';
            $msgId = '<ht-' . bin2hex(random_bytes(10)) . '@' . $serverName . '>';

            $headers = [
                'MIME-Version: 1.0',
                'Content-Type: text/html; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                'From: ' . sprintf('%s <%s>', $fromName, $fromEmail),
                'Reply-To: ' . $replyTo,
                'Return-Path: ' . $fromEmail,
                'Date: ' . date('r'),
                'Message-ID: ' . $msgId,
                'X-Mailer: HambakTech-MTA/2.0',
            ];

            // On cPanel/LiteSpeed, envelope sender (-f) ensures SPF and DKIM pass with domain
            $envelopeParam = '-f ' . escapeshellarg($fromEmail);
            $mailSent = @mail($toEmail, $subject, $fullHtml, implode("\r\n", $headers), $envelopeParam);
            if (!$mailSent) {
                $mailSent = @mail($toEmail, $subject, $fullHtml, implode("\r\n", $headers));
            }

            if ($mailSent) {
                $result = [
                    'success' => true,
                    'messageId' => $msgId,
                    'transcript' => ['Delivered via cPanel native Exim MTA successfully'],
                ];
            } else {
                $lastErr = error_get_last();
                $result['error'] = 'MTA delivery failed: ' . ($lastErr['message'] ?? 'mail() returned false');
            }
        }

        // 5. Update Delivery status
        $conn = $this->db->getConnection();
        if ($result['success']) {
            $upd = $conn->prepare("
                UPDATE `CommunicationDelivery`
                SET `status` = 'SENT',
                    `providerMessageId` = :msgId,
                    `deliveredAt` = NOW(3)
                WHERE `id` = :id
            ");
            $upd->execute([
                ':msgId' => $result['messageId'] ?? null,
                ':id' => $deliveryId,
            ]);

            return [
                'success' => true,
                'deliveryId' => $deliveryId,
                'status' => 'SENT',
                'messageId' => $result['messageId'] ?? null,
            ];
        } else {
            $failureReason = mb_substr($result['error'] ?? 'SMTP delivery failed', 0, 190);
            $upd = $conn->prepare("
                UPDATE `CommunicationDelivery`
                SET `status` = 'FAILED',
                    `failureReason` = :reason
                WHERE `id` = :id
            ");
            $upd->execute([
                ':reason' => $failureReason,
                ':id' => $deliveryId,
            ]);

            return [
                'success' => false,
                'deliveryId' => $deliveryId,
                'status' => 'FAILED',
                'failureReason' => $failureReason,
            ];
        }
    }

    /**
     * Backward-compatible direct transactional email dispatcher.
     */
    public function sendTransactionalEmail(
        string $toEmail,
        string $subject,
        string $htmlContent,
        string $textContent = '',
        ?string $notificationId = null
    ): array {
        return $this->send($toEmail, $subject, $htmlContent, $textContent, $notificationId);
    }

    /**
     * Universal Variable Normalizer
     * Resolves all known aliases (e.g. amountFormatted -> amountNaira, transactionReference -> reference,
     * paymentMethod -> channel, paidAt -> timestamp) and ensures every single required template
     * variable has a real, formatted, human-friendly value with zero unresolved brackets.
     */
    public function normalizeVariables(array $vars, string $templateCode = ''): array
    {
        $appUrl = getenv('APP_URL') ?: 'https://hambaktech.com.ng';
        $normalized = [
            'companyName'  => 'Hambak Tech & Services',
            'supportEmail' => 'support@hambaktech.com.ng',
            'appUrl'       => $appUrl,
            'portalUrl'    => $appUrl . '/portal',
            'walletUrl'    => $appUrl . '/portal/wallet',
            'trackingUrl'  => $appUrl . '/portal/orders',
            'supportUrl'   => $appUrl . '/portal/support',
            'securityUrl'  => $appUrl . '/portal/settings',
            'ninUrl'       => $appUrl . '/portal/nin',
            'academyUrl'   => $appUrl . '/portal/academy',
            'ticketUrl'    => $appUrl . '/portal/support',
            'year'         => date('Y'),
        ];

        // Merge incoming variables first
        foreach ($vars as $k => $v) {
            $normalized[$k] = $v;
        }

        // 1. Amount Normalization (amountNaira / amountFormatted / amount / amountKobo)
        $rawAmount = $vars['amountNaira']
            ?? $vars['amountFormatted']
            ?? $vars['amount']
            ?? $vars['totalAmountNaira']
            ?? (isset($vars['amountKobo']) ? ((float)$vars['amountKobo'] / 100) : null)
            ?? (isset($vars['totalAmountKobo']) ? ((float)$vars['totalAmountKobo'] / 100) : null)
            ?? null;

        if ($rawAmount !== null && $rawAmount !== '') {
            $cleanNum = is_string($rawAmount) ? preg_replace('/[^\d\.]/', '', $rawAmount) : (float)$rawAmount;
            $numVal = (float)$cleanNum;
            $formattedNaira = number_format($numVal, 2);
            $normalized['amountNaira'] = $formattedNaira;
            $normalized['amountFormatted'] = $formattedNaira;
            $normalized['amount'] = $formattedNaira;
            $normalized['amountWithSymbol'] = '₦' . $formattedNaira;
        } else {
            $normalized['amountNaira'] = '0.00';
            $normalized['amountFormatted'] = '0.00';
            $normalized['amountWithSymbol'] = '₦0.00';
        }

        // New Balance Normalization
        $rawNewBal = $vars['newBalanceNaira']
            ?? $vars['balanceNaira']
            ?? (isset($vars['newBalanceKobo']) ? ((float)$vars['newBalanceKobo'] / 100) : null)
            ?? (isset($vars['balanceKobo']) ? ((float)$vars['balanceKobo'] / 100) : null)
            ?? null;
        if ($rawNewBal !== null && $rawNewBal !== '') {
            $cleanBal = is_string($rawNewBal) ? preg_replace('/[^\d\.]/', '', $rawNewBal) : (float)$rawNewBal;
            $normalized['newBalanceNaira'] = number_format((float)$cleanBal, 2);
        } else {
            $normalized['newBalanceNaira'] = $normalized['amountNaira'];
        }

        // 2. Reference & Order Number Normalization
        $reference = $vars['reference']
            ?? $vars['transactionReference']
            ?? $vars['orderNumber']
            ?? $vars['gatewayReference']
            ?? $vars['paymentReference']
            ?? $vars['ref']
            ?? $vars['identifierSubmitted']
            ?? $vars['trackingNumber']
            ?? null;

        if (!empty($reference)) {
            $normalized['reference'] = (string)$reference;
            $normalized['transactionReference'] = (string)$reference;
        } else {
            $genRef = 'HTS-REF-' . strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 8));
            $normalized['reference'] = $genRef;
            $normalized['transactionReference'] = $genRef;
        }

        $orderNum = $vars['orderNumber'] ?? $normalized['reference'];
        $normalized['orderNumber'] = (string)$orderNum;
        $normalized['trackingNumber'] = $vars['trackingNumber'] ?? (string)$orderNum;
        $normalized['applicationNumber'] = $vars['applicationNumber'] ?? (string)$orderNum;
        $normalized['ticketNumber'] = $vars['ticketNumber'] ?? (string)$orderNum;

        // 3. Payment Channel / Method Normalization
        $rawChan = $vars['channel']
            ?? $vars['paymentMethod']
            ?? $vars['gateway']
            ?? $vars['source']
            ?? null;

        $channelMap = [
            'WALLET'          => 'HambakTech Digital Wallet',
            'CARD'            => 'Debit Card (Paystack)',
            'BANK_TRANSFER'   => 'Bank Transfer (Moniepoint MFB)',
            'DIRECT_TRANSFER' => 'Bank Transfer (Moniepoint MFB)',
            'PAYSTACK'        => 'Paystack Instant Gateway',
            'FLUTTERWAVE'     => 'Flutterwave Gateway',
        ];
        if (!empty($rawChan)) {
            $upperChan = strtoupper(trim((string)$rawChan));
            $normalized['channel'] = $channelMap[$upperChan] ?? (string)$rawChan;
        } else {
            $normalized['channel'] = 'HambakTech Digital Gateway';
        }
        $normalized['paymentMethod'] = $normalized['channel'];

        // 4. Purpose & Service Name Normalization
        $purpose = $vars['purpose']
            ?? $vars['serviceName']
            ?? $vars['description']
            ?? $vars['orderTitle']
            ?? null;

        if (empty($purpose)) {
            if (!empty($vars['orderNumber'])) {
                $purpose = "Order #{$vars['orderNumber']}";
            } elseif (str_contains($templateCode, 'WALLET')) {
                $purpose = 'Wallet Funding';
            } elseif (str_contains($templateCode, 'VTU') || str_contains($templateCode, 'AIRTIME')) {
                $purpose = 'Telecom & VTU Recharge';
            } elseif (str_contains($templateCode, 'NIN') || str_contains($templateCode, 'IDENTITY')) {
                $purpose = 'NIMC Identity Desk Verification';
            } else {
                $purpose = 'HambakTech Platform Service';
            }
        }
        $normalized['purpose'] = (string)$purpose;
        $normalized['serviceName'] = $vars['serviceName'] ?? (string)$purpose;
        $normalized['serviceType'] = $vars['serviceType'] ?? (string)$purpose;
        $normalized['courseName'] = $vars['courseName'] ?? 'ICT Professional Certificate Course';
        $normalized['cohortName'] = $vars['cohortName'] ?? 'Upcoming Executive Batch';

        // 5. Customer Name Normalization
        $firstName = $vars['firstName']
            ?? $vars['customerName']
            ?? $vars['name']
            ?? $vars['fullName']
            ?? null;

        if (!empty($firstName)) {
            $parts = explode(' ', trim((string)$firstName));
            $normalized['firstName'] = $parts[0];
            $normalized['customerName'] = trim((string)$firstName);
        } else {
            $normalized['firstName'] = 'Valued Customer';
            $normalized['customerName'] = 'Valued Customer';
        }

        // 6. Timestamp Normalization
        $rawTs = $vars['timestamp']
            ?? $vars['paidAt']
            ?? $vars['date']
            ?? $vars['createdAt']
            ?? null;

        if (!empty($rawTs)) {
            $timeVal = strtotime((string)$rawTs);
            $normalized['timestamp'] = ($timeVal !== false && $timeVal > 0)
                ? date('F j, Y, g:i a', $timeVal)
                : (string)$rawTs;
        } else {
            $normalized['timestamp'] = date('F j, Y, g:i a');
        }
        $normalized['paidAt'] = $normalized['timestamp'];

        // 7. URLs Normalization
        $normalized['receiptUrl'] = $vars['receiptUrl']
            ?? $vars['viewOrderUrl']
            ?? ($orderNum ? "{$appUrl}/portal/orders/{$orderNum}" : "{$appUrl}/portal/wallet");
        $normalized['viewOrderUrl'] = $normalized['receiptUrl'];
        $normalized['trackingUrl'] = $vars['trackingUrl'] ?? ($orderNum ? "{$appUrl}/portal/orders/{$orderNum}" : "{$appUrl}/portal/orders");
        $normalized['retryUrl'] = $vars['retryUrl'] ?? "{$appUrl}/portal/wallet";
        $normalized['verificationUrl'] = $vars['verificationUrl'] ?? "{$appUrl}/verify-email";
        $normalized['resetUrl'] = $vars['resetUrl'] ?? "{$appUrl}/reset-password";

        // 8. Miscellaneous standard fields
        $normalized['status'] = $vars['status'] ?? ($vars['orderStatus'] ?? 'COMPLETED');
        $normalized['newStatus'] = $vars['newStatus'] ?? $normalized['status'];
        $normalized['previousStatus'] = $vars['previousStatus'] ?? 'PENDING';
        $normalized['orderStatus'] = $normalized['status'];
        $normalized['deliveryNotes'] = $vars['deliveryNotes'] ?? ($vars['notes'] ?? 'Transaction completed successfully.');
        $normalized['notes'] = $normalized['deliveryNotes'];
        $normalized['resolutionNotes'] = $vars['resolutionNotes'] ?? 'Your identity verification record has been verified.';
        $normalized['reason'] = $vars['reason'] ?? ($vars['rejectionReason'] ?? 'Transaction could not be confirmed.');
        $normalized['rejectionReason'] = $normalized['reason'];
        $normalized['admissionsNote'] = $vars['admissionsNote'] ?? 'Your application has been admitted to the upcoming training stream.';
        $normalized['admissionStatus'] = $vars['admissionStatus'] ?? 'ADMITTED';
        $normalized['latestMessage'] = $vars['latestMessage'] ?? 'Your support ticket has been reviewed by our desk.';
        $normalized['subject'] = $vars['subject'] ?? 'HambakTech Desk Notice';
        $normalized['eventType'] = $vars['eventType'] ?? 'Account Security Activity';
        $normalized['details'] = $vars['details'] ?? 'Sign in from authenticated workstation.';
        $normalized['actionRequired'] = $vars['actionRequired'] ?? 'None required at this time.';
        $normalized['expiresIn'] = $vars['expiresIn'] ?? '30 minutes';
        $normalized['expiresInMinutes'] = $vars['expiresInMinutes'] ?? '30';
        $normalized['otpCode'] = $vars['otpCode'] ?? '------';
        $normalized['ipAddress'] = $vars['ipAddress'] ?? ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');

        return $normalized;
    }

    /**
     * Interpolates all variables with guaranteed fallback cleanup.
     * ZERO unresolved {{...}} or ${...} or undefined/null values are ever allowed to leave this method.
     */
    public function interpolateContent(string $content, array $variables, string $context = 'html'): string
    {
        if (empty($content)) {
            return '';
        }

        // Pass 1: Substitute all defined variables
        foreach ($variables as $k => $v) {
            $val = is_scalar($v) ? (string)$v : (is_null($v) ? '' : json_encode($v));
            $pattern = '/\{\{\s*' . preg_quote((string)$k, '/') . '\s*\}\}/i';
            $content = (string)preg_replace($pattern, $val, $content);
            $patternDollar = '/\$\{\s*' . preg_quote((string)$k, '/') . '\s*\}/i';
            $content = (string)preg_replace($patternDollar, $val, $content);
        }

        // Pass 2: Provide sensible fallbacks for any critical placeholders if unsupplied
        $criticalFallbacks = [
            'amountNaira'      => '0.00',
            'amountFormatted'  => '0.00',
            'amountWithSymbol' => '₦0.00',
            'purpose'          => 'HambakTech Digital Service',
            'serviceName'      => 'HambakTech Digital Service',
            'serviceType'      => 'Identity Verification',
            'reference'        => 'HTS-' . strtoupper(substr(md5((string)time()), 0, 8)),
            'transactionReference' => 'HTS-REF',
            'channel'          => 'HambakTech Digital Gateway',
            'paymentMethod'    => 'HambakTech Digital Gateway',
            'timestamp'        => date('F j, Y, g:i a'),
            'paidAt'           => date('F j, Y, g:i a'),
            'firstName'        => 'Valued Customer',
            'customerName'     => 'Valued Customer',
            'receiptUrl'       => 'https://hambaktech.com.ng/portal/wallet',
            'portalUrl'        => 'https://hambaktech.com.ng/portal',
            'walletUrl'        => 'https://hambaktech.com.ng/portal/wallet',
            'trackingUrl'      => 'https://hambaktech.com.ng/portal/orders',
            'supportUrl'       => 'https://hambaktech.com.ng/portal/support',
            'securityUrl'      => 'https://hambaktech.com.ng/portal/settings',
            'orderNumber'      => 'HTS-ORD',
            'newBalanceNaira'  => '0.00',
            'status'           => 'COMPLETED',
            'newStatus'        => 'COMPLETED',
            'deliveryNotes'    => 'Completed successfully.',
            'notes'            => 'Completed successfully.',
            'reason'           => 'Transaction verification status.',
            'rejectionReason'  => 'Verification requires review.',
            'expiresIn'        => '30 minutes',
            'expiresInMinutes' => '30',
            'otpCode'          => '------',
            'ipAddress'        => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
        ];

        foreach ($criticalFallbacks as $k => $fallbackVal) {
            $pattern = '/\{\{\s*' . preg_quote((string)$k, '/') . '\s*\}\}/i';
            if (preg_match($pattern, $content)) {
                $content = (string)preg_replace($pattern, $fallbackVal, $content);
            }
            $patternDollar = '/\$\{\s*' . preg_quote((string)$k, '/') . '\s*\}/i';
            if (preg_match($patternDollar, $content)) {
                $content = (string)preg_replace($patternDollar, $fallbackVal, $content);
            }
        }

        // Pass 3: Scrub any remaining unresolved placeholders ({{...}} or ${...})
        // Guarantee no raw template syntax reaches customers!
        $content = (string)preg_replace('/\{\{\s*[\w\.\-]+\s*\}\}/', '', $content);
        $content = (string)preg_replace('/\$\{\s*[\w\.\-]+\s*\}/', '', $content);

        // Pass 4: Scrub raw js tokens like [object Object], undefined, null
        $content = str_replace(['[object Object]', 'undefined', 'null'], '', $content);

        // Pass 5: Remove duplicate currency symbols like ₦₦
        $content = (string)preg_replace('/₦\s*₦+/', '₦', $content);

        return $content;
    }

    /**
     * Dispatch email using a pre-defined template with dynamic variable substitution.
     */
    public function sendTemplate(
        string $toEmail,
        string $templateCode,
        array $variables = [],
        ?string $notificationId = null
    ): array {
        $resolvedCode = self::TEMPLATE_ALIASES[$templateCode] ?? $templateCode;

        // 1. Look up in EmailTemplate table
        $conn = $this->db->getConnection();
        $stmt = $conn->prepare('SELECT * FROM `EmailTemplate` WHERE `code` = :code AND `isActive` = 1 LIMIT 1');
        $stmt->execute([':code' => $resolvedCode]);
        $tpl = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tpl && $resolvedCode !== $templateCode) {
            $stmt->execute([':code' => $templateCode]);
            $tpl = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$tpl) {
            // Fallback to internal canonical templates
            $tpl = $this->getFallbackTemplate($resolvedCode) ?? $this->getFallbackTemplate($templateCode);
            if (!$tpl) {
                return [
                    'success' => false,
                    'status' => 'FAILED',
                    'failureReason' => "Email template [{$templateCode}] not found or inactive.",
                ];
            }
        }

        // 2. Normalize and resolve all variables
        $allVars = $this->normalizeVariables($variables, $resolvedCode);

        // 3. Interpolate Subject, BodyHtml, BodyText
        $subject = $this->interpolateContent($tpl['subject'], $allVars, 'subject');
        $html = $this->interpolateContent($tpl['bodyHtml'], $allVars, 'html');
        $text = $this->interpolateContent($tpl['bodyText'] ?? '', $allVars, 'text');

        return $this->send($toEmail, $subject, $html, $text, $notificationId);
    }

    /**
     * Professional Hambak Tech & Services Branded Email Shell
     * Implements distinctive category styling:
     * - SUCCESS / PAYMENT -> Emerald green accent (#059669)
     * - PENDING / WARNING -> Amber gold accent (#d97706)
     * - FAILED / ERROR    -> Crimson red accent (#dc2626)
     * - SECURITY          -> Indigo accent (#4f46e5)
     * - ORDER             -> Royal blue accent (#1d4ed8)
     */
    public function wrapInBrandedEmailShell(array $content): string
    {
        $currentYear = date('Y');
        $title = htmlspecialchars($content['title'] ?? 'Hambak Tech Notification');
        $headline = htmlspecialchars($content['headline'] ?? '');
        $bodyHtml = $content['bodyHtml'] ?? '';
        $badge = htmlspecialchars($content['badge'] ?? '');
        $badgeType = strtoupper($content['badgeType'] ?? 'INFO');

        // Color theme matrix
        $themes = [
            'SUCCESS' => [
                'accent' => '#059669',
                'badgeBg' => '#ecfdf5',
                'badgeBorder' => '#a7f3d0',
                'badgeText' => '#047857',
                'btnBg' => '#059669',
            ],
            'PAYMENT' => [
                'accent' => '#059669',
                'badgeBg' => '#ecfdf5',
                'badgeBorder' => '#a7f3d0',
                'badgeText' => '#047857',
                'btnBg' => '#059669',
            ],
            'PENDING' => [
                'accent' => '#d97706',
                'badgeBg' => '#fffbeb',
                'badgeBorder' => '#fde68a',
                'badgeText' => '#b45309',
                'btnBg' => '#2563eb',
            ],
            'FAILED' => [
                'accent' => '#dc2626',
                'badgeBg' => '#fef2f2',
                'badgeBorder' => '#fecaca',
                'badgeText' => '#b91c1c',
                'btnBg' => '#dc2626',
            ],
            'SECURITY' => [
                'accent' => '#4f46e5',
                'badgeBg' => '#eef2ff',
                'badgeBorder' => '#c7d2fe',
                'badgeText' => '#4338ca',
                'btnBg' => '#4f46e5',
            ],
            'ORDER' => [
                'accent' => '#1d4ed8',
                'badgeBg' => '#eff6ff',
                'badgeBorder' => '#bfdbfe',
                'badgeText' => '#1e40af',
                'btnBg' => '#1d4ed8',
            ],
            'INFO' => [
                'accent' => '#2563eb',
                'badgeBg' => '#f1f5f9',
                'badgeBorder' => '#cbd5e1',
                'badgeText' => '#334155',
                'btnBg' => '#2563eb',
            ],
        ];

        $theme = $themes[$badgeType] ?? $themes['INFO'];
        $accentColor = $theme['accent'];
        $badgeBg = $theme['badgeBg'];
        $badgeBorder = $theme['badgeBorder'];
        $badgeText = $theme['badgeText'];
        $btnBg = $theme['btnBg'];

        $badgeHtml = '';
        if (!empty($badge)) {
            $badgeHtml = '<div style="display: inline-block; padding: 5px 14px; background-color: ' . $badgeBg . '; border: 1px solid ' . $badgeBorder . '; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: ' . $badgeText . '; margin-bottom: 18px; text-transform: uppercase;">' . $badge . '</div>';
        }

        $actionBtn = '';
        if (!empty($content['actionUrl']) && !empty($content['actionText'])) {
            $actionBtn = '<div style="text-align: center; margin: 28px 0 20px 0;">'
                . '<a href="' . htmlspecialchars($content['actionUrl']) . '" style="display: inline-block; background-color: ' . $btnBg . '; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 13px 32px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);" target="_blank" rel="noopener noreferrer">'
                . htmlspecialchars($content['actionText'])
                . '</a></div>';
        }

        $footerNote = '';
        if (!empty($content['footerNote'])) {
            $footerNote = '<div style="background-color: #f8fafc; border-left: 4px solid ' . $accentColor . '; padding: 14px 18px; margin: 20px 0 0 0; border-radius: 0 8px 8px 0; font-size: 13px; color: #475569; line-height: 1.5;">'
                . $content['footerNote']
                . '</div>';
        }

        return '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>' . $title . '</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; line-height: 1.6; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08); }
    .email-header { background: linear-gradient(135deg, #091325 0%, #172554 100%); padding: 32px 28px; text-align: left; border-top: 4px solid ' . $accentColor . '; }
    .brand-title { font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.025em; margin: 0; }
    .brand-sub { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #93c5fd; margin-top: 4px; font-weight: 600; }
    .email-body { padding: 32px 28px; }
    .headline { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.02em; line-height: 1.3; }
    .body-copy { font-size: 14px; color: #334155; line-height: 1.65; }
    .detail-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ' . $accentColor . '; border-radius: 10px; padding: 18px 20px; margin: 20px 0; font-size: 13px; line-height: 1.6; color: #334155; }
    .btn-container { text-align: center; margin: 28px 0; }
    .action-btn { display: inline-block; background-color: ' . $btnBg . '; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 13px 32px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .email-footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; font-size: 12px; color: #64748b; }
    .footer-links a { color: #2563eb; text-decoration: none; font-weight: 600; margin: 0 8px; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <div style="width: 100%; background-color: #f8fafc; padding: 32px 16px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08);">
      
      <!-- Brand Header -->
      <div style="background: linear-gradient(135deg, #091325 0%, #172554 100%); padding: 32px 28px; text-align: left; border-top: 4px solid ' . $accentColor . ';">
        <div style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.025em; margin: 0; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;">
          HAMBAK TECH &amp; SERVICES
        </div>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #93c5fd; margin-top: 4px; font-weight: 600;">
          Where Technology Meets Services
        </div>
      </div>

      <!-- Main Body -->
      <div style="padding: 32px 28px; background-color: #ffffff;">
        ' . $badgeHtml . '
        <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; letter-spacing: -0.02em; line-height: 1.3;">
          ' . $headline . '
        </h2>
        <div style="font-size: 14px; color: #334155; line-height: 1.65;">
          ' . $bodyHtml . '
        </div>
        ' . $actionBtn . '
        ' . $footerNote . '
      </div>

      <!-- Official Footer -->
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
        <div style="margin-bottom: 10px;">
          <a href="https://hambaktech.com.ng/portal" style="color: #2563eb; text-decoration: none; font-weight: 600; margin: 0 8px;">Customer Portal</a> &bull;
          <a href="https://hambaktech.com.ng/portal/support" style="color: #2563eb; text-decoration: none; font-weight: 600; margin: 0 8px;">Support Desk</a> &bull;
          <a href="https://hambaktech.com.ng/terms" style="color: #2563eb; text-decoration: none; font-weight: 600; margin: 0 8px;">Terms of Service</a> &bull;
          <a href="https://hambaktech.com.ng/privacy" style="color: #2563eb; text-decoration: none; font-weight: 600; margin: 0 8px;">Privacy Policy</a>
        </div>
        <p style="margin: 0 0 6px 0; color: #64748b;">This transactional message was dispatched by HambakTech Automated Notification System.</p>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">
          &copy; ' . $currentYear . ' Hambak Tech &amp; Services (BN 9284726) &bull; Lekki LCDA, Lagos State, Nigeria
        </div>
      </div>

    </div>
  </div>
</body>
</html>';
    }

    /**
     * Complete Audited Transactional Templates Library
     * Covers Payments, Wallet, Orders, Services, VTU, Identity, Manual Desk, Auth, and Security.
     */
    public function getCanonicalTemplatesDefinitions(): array
    {
        return [
            // 1. PAYMENT_CONFIRMATION
            'PAYMENT_CONFIRMATION' => [
                'code' => 'PAYMENT_CONFIRMATION',
                'name' => 'Payment Received Confirmation',
                'category' => 'PAYMENTS',
                'subject' => 'Payment Receipt: ₦{{amountNaira}} Confirmed — Ref: {{reference}}',
                'availableVariables' => ['firstName', 'amountNaira', 'reference', 'channel', 'purpose', 'timestamp', 'receiptUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Payment Receipt Confirmed',
                    'badge' => 'PAYMENT CONFIRMED',
                    'badgeType' => 'PAYMENT',
                    'headline' => 'Payment Received: ₦{{amountNaira}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">We confirm receipt of your payment for <strong>{{purpose}}</strong>. This transaction has been settled and recorded in your account ledger.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; font-weight: 700; margin-bottom: 14px;">Payment Summary</div>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Amount Paid:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, monospace; font-size: 15px;">₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Purpose / Service:</td>
      <td style="padding: 6px 0; font-weight: 600; color: #1e293b;">{{purpose}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Transaction Ref:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #0f172a;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Payment Channel:</td>
      <td style="padding: 6px 0; color: #1e293b;">{{channel}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Date &amp; Time:</td>
      <td style="padding: 6px 0; color: #1e293b;">{{timestamp}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; line-height: 1.6;">You can access your complete receipt and order deliverables anytime in your customer workspace.</p>',
                    'actionUrl' => '{{receiptUrl}}',
                    'actionText' => 'View Payment Receipt',
                ]),
                'bodyText' => "Payment Received: ₦{{amountNaira}}\n\nHello {{firstName}},\nWe confirm receipt of your payment for {{purpose}}.\n\nAmount: ₦{{amountNaira}}\nReference: {{reference}}\nChannel: {{channel}}\nDate: {{timestamp}}\n\nView Receipt: {{receiptUrl}}",
            ],

            // 2. PAYMENT_FAILURE
            'PAYMENT_FAILURE' => [
                'code' => 'PAYMENT_FAILURE',
                'name' => 'Payment Failed Notice',
                'category' => 'PAYMENTS',
                'subject' => 'Payment Attempt Failed — Reference: {{reference}}',
                'availableVariables' => ['firstName', 'amountNaira', 'reference', 'reason', 'retryUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Payment Unsuccessful',
                    'badge' => 'PAYMENT UNSUCCESSFUL',
                    'badgeType' => 'FAILED',
                    'headline' => 'Payment Attempt Was Not Successful',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">An attempt to process a payment of <strong>₦{{amountNaira}}</strong> on your account was not successful.</p>
<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #991b1b; font-weight: 700; margin-bottom: 14px;">Failure Details</div>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #0f172a;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Attempted Amount:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Failure Reason:</td>
      <td style="padding: 6px 0; color: #991b1b; font-weight: 600;">{{reason}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; line-height: 1.6;">No funds were deducted from your wallet. You may retry using an alternate channel or funding your wallet balance.</p>',
                    'actionUrl' => '{{retryUrl}}',
                    'actionText' => 'Retry Payment',
                ]),
                'bodyText' => "Payment Attempt Failed\n\nHello {{firstName}},\nAmount: ₦{{amountNaira}}\nReference: {{reference}}\nReason: {{reason}}\n\nRetry Payment: {{retryUrl}}",
            ],

            // 3. PAYMENT_PENDING
            'PAYMENT_PENDING' => [
                'code' => 'PAYMENT_PENDING',
                'name' => 'Payment Pending Verification',
                'category' => 'PAYMENTS',
                'subject' => 'Payment Pending Verification: ₦{{amountNaira}} — Ref: {{reference}}',
                'availableVariables' => ['firstName', 'amountNaira', 'reference', 'channel', 'receiptUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Payment Pending',
                    'badge' => 'AWAITING SETTLEMENT',
                    'badgeType' => 'PENDING',
                    'headline' => 'Payment Verification in Progress',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">We have recorded your initiated payment of <strong>₦{{amountNaira}}</strong>. It is currently awaiting bank settlement confirmation.</p>
<div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Pending Amount:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Channel:</td>
      <td style="padding: 6px 0;">{{channel}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Once confirmed, your account ledger will automatically be credited and an update dispatched.</p>',
                    'actionUrl' => '{{receiptUrl}}',
                    'actionText' => 'Check Payment Status',
                ]),
                'bodyText' => "Payment Pending: ₦{{amountNaira}}\n\nHello {{firstName}},\nRef: {{reference}}\nChannel: {{channel}}\nStatus: Pending Verification\n\nCheck status: {{receiptUrl}}",
            ],

            // 4. WALLET_FUNDING_CONFIRMATION
            'WALLET_FUNDING_CONFIRMATION' => [
                'code' => 'WALLET_FUNDING_CONFIRMATION',
                'name' => 'Wallet Credited Confirmation',
                'category' => 'WALLET',
                'subject' => 'Wallet Credited: ₦{{amountNaira}} Available in Your Account',
                'availableVariables' => ['firstName', 'amountNaira', 'newBalanceNaira', 'channel', 'reference', 'walletUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Wallet Credited',
                    'badge' => 'WALLET CREDITED',
                    'badgeType' => 'SUCCESS',
                    'headline' => '₦{{amountNaira}} Added to Your Wallet',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your HambakTech digital wallet has been credited successfully. Funds are immediately available for instant payments.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Credited Amount:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #059669; font-size: 15px;">+₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">New Balance:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a; font-size: 15px;">₦{{newBalanceNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Funding Channel:</td>
      <td style="padding: 6px 0;">{{channel}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600;">{{reference}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Use your wallet balance to order NIN services, automated VTpass utilities, hardware store items, and academy courses.</p>',
                    'actionUrl' => '{{walletUrl}}',
                    'actionText' => 'View Wallet Balance',
                ]),
                'bodyText' => "Wallet Credited: ₦{{amountNaira}}\n\nHello {{firstName}},\nAmount: +₦{{amountNaira}}\nNew Balance: ₦{{newBalanceNaira}}\nReference: {{reference}}\n\nView Wallet: {{walletUrl}}",
            ],

            // 5. WALLET_DEBIT_CONFIRMATION
            'WALLET_DEBIT_CONFIRMATION' => [
                'code' => 'WALLET_DEBIT_CONFIRMATION',
                'name' => 'Wallet Debit Notice',
                'category' => 'WALLET',
                'subject' => 'Wallet Debit: ₦{{amountNaira}} for {{purpose}}',
                'availableVariables' => ['firstName', 'amountNaira', 'newBalanceNaira', 'purpose', 'reference', 'walletUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Wallet Debited',
                    'badge' => 'WALLET DEBIT',
                    'badgeType' => 'ORDER',
                    'headline' => '₦{{amountNaira}} Debited from Wallet',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">A payment of <strong>₦{{amountNaira}}</strong> was processed from your HambakTech wallet for <strong>{{purpose}}</strong>.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #1d4ed8; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Debited Amount:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">-₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Remaining Balance:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">₦{{newBalanceNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Purpose:</td>
      <td style="padding: 6px 0;">{{purpose}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600;">{{reference}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Your updated ledger entry is available in your customer workspace.</p>',
                    'actionUrl' => '{{walletUrl}}',
                    'actionText' => 'View Wallet Ledger',
                ]),
                'bodyText' => "Wallet Debited: ₦{{amountNaira}}\n\nHello {{firstName}},\nAmount: -₦{{amountNaira}}\nPurpose: {{purpose}}\nNew Balance: ₦{{newBalanceNaira}}\nReference: {{reference}}\n\nWallet: {{walletUrl}}",
            ],

            // 6. MANUAL_FUNDING_APPROVED
            'MANUAL_FUNDING_APPROVED' => [
                'code' => 'MANUAL_FUNDING_APPROVED',
                'name' => 'Manual Bank Deposit Approved',
                'category' => 'WALLET',
                'subject' => 'Manual Bank Deposit Verified: ₦{{amountNaira}} Credited',
                'availableVariables' => ['firstName', 'amountNaira', 'newBalanceNaira', 'reference', 'walletUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Deposit Verified &amp; Approved',
                    'badge' => 'DEPOSIT APPROVED',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'Bank Transfer Verified &amp; Credited',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your manual bank transfer deposit of <strong>₦{{amountNaira}}</strong> has been verified against Moniepoint MFB records and approved by our finance desk.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Amount Credited:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #059669; font-size: 15px;">+₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Available Balance:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a; font-size: 15px;">₦{{newBalanceNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Deposit Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600;">{{reference}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Your wallet balance is immediately active for all platform operations.</p>',
                    'actionUrl' => '{{walletUrl}}',
                    'actionText' => 'Open Digital Wallet',
                ]),
                'bodyText' => "Manual Deposit Approved: ₦{{amountNaira}}\n\nHello {{firstName}},\nYour bank deposit was approved.\nAmount: ₦{{amountNaira}}\nNew Balance: ₦{{newBalanceNaira}}\nRef: {{reference}}\n\nWallet: {{walletUrl}}",
            ],

            // 7. MANUAL_FUNDING_REJECTED
            'MANUAL_FUNDING_REJECTED' => [
                'code' => 'MANUAL_FUNDING_REJECTED',
                'name' => 'Manual Deposit Rejected',
                'category' => 'WALLET',
                'subject' => 'Notice: Manual Bank Deposit Proof Requires Attention',
                'availableVariables' => ['firstName', 'amountNaira', 'reference', 'rejectionReason', 'supportUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Deposit Verification Notice',
                    'badge' => 'DEPOSIT REJECTED',
                    'badgeType' => 'FAILED',
                    'headline' => 'Bank Transfer Proof Verification Failed',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Our finance desk could not verify your manual bank transfer submission of <strong>₦{{amountNaira}}</strong>.</p>
<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Submitted Ref:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Reason for Notice:</td>
      <td style="padding: 6px 0; color: #991b1b; font-weight: 600;">{{rejectionReason}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Please double check your bank session ID or contact our billing desk with your payment receipt.</p>',
                    'actionUrl' => '{{supportUrl}}',
                    'actionText' => 'Contact Billing Support',
                ]),
                'bodyText' => "Deposit Notice\n\nHello {{firstName}},\nDeposit of ₦{{amountNaira}} could not be verified.\nRef: {{reference}}\nReason: {{rejectionReason}}\n\nContact support: {{supportUrl}}",
            ],

            // 8. ORDER_CONFIRMATION
            'ORDER_CONFIRMATION' => [
                'code' => 'ORDER_CONFIRMATION',
                'name' => 'Order Placed Confirmation',
                'category' => 'ORDERS',
                'subject' => 'Order Placed Successfully — #{{orderNumber}}',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'amountNaira', 'channel', 'trackingUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Order Confirmed',
                    'badge' => 'ORDER PLACED',
                    'badgeType' => 'ORDER',
                    'headline' => 'Thank You for Your Order, {{firstName}}!',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your order for <strong>{{serviceName}}</strong> has been received and confirmed in our system.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #1d4ed8; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700; color: #0f172a;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Service Name:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceName}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Amount:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Payment Channel:</td>
      <td style="padding: 6px 0;">{{channel}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Our service team is processing your request. You can follow real-time progress and download deliverables via the tracking portal.</p>',
                    'actionUrl' => '{{trackingUrl}}',
                    'actionText' => 'Track Your Order',
                ]),
                'bodyText' => "Order #{{orderNumber}} Confirmed!\n\nHello {{firstName}},\nYour order for {{serviceName}} (₦{{amountNaira}}) is confirmed.\n\nTrack progress: {{trackingUrl}}",
            ],

            // 9. ORDER_STATUS_CHANGE
            'ORDER_STATUS_CHANGE' => [
                'code' => 'ORDER_STATUS_CHANGE',
                'name' => 'Order Status Changed',
                'category' => 'ORDERS',
                'subject' => 'Update on Order #{{orderNumber}} — {{newStatus}}',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'previousStatus', 'newStatus', 'notes', 'trackingUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Order Status Update',
                    'badge' => 'STATUS UPDATE',
                    'badgeType' => 'PENDING',
                    'headline' => 'Status Update: Order #{{orderNumber}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">There is a new update regarding your order for <strong>{{serviceName}}</strong>.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #d97706; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Current Status:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #b45309; text-transform: uppercase;">{{newStatus}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Desk Remarks:</td>
      <td style="padding: 6px 0;">{{notes}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Check your customer portal for complete details and attached slips.</p>',
                    'actionUrl' => '{{trackingUrl}}',
                    'actionText' => 'View Order Details',
                ]),
                'bodyText' => "Order #{{orderNumber}} Status: {{newStatus}}\n\nHello {{firstName}},\nYour order for {{serviceName}} is now {{newStatus}}.\nNotes: {{notes}}\n\nView details: {{trackingUrl}}",
            ],

            // 10. ORDER_PROCESSING
            'ORDER_PROCESSING' => [
                'code' => 'ORDER_PROCESSING',
                'name' => 'Order In Progress',
                'category' => 'ORDERS',
                'subject' => 'Processing In Progress: Order #{{orderNumber}} ({{serviceName}})',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'notes', 'trackingUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Order In Progress',
                    'badge' => 'IN PROGRESS',
                    'badgeType' => 'PENDING',
                    'headline' => 'Your Order Is Being Processed',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Our operations team is actively working on your order for <strong>{{serviceName}}</strong>.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #d97706; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Assigned Desk:</td>
      <td style="padding: 6px 0; font-weight: 600;">Technical Operations Desk</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Desk Notes:</td>
      <td style="padding: 6px 0;">{{notes}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">You will receive an immediate notification as soon as the deliverable documents are ready.</p>',
                    'actionUrl' => '{{trackingUrl}}',
                    'actionText' => 'Check Order Milestones',
                ]),
                'bodyText' => "Order #{{orderNumber}} Processing\n\nHello {{firstName}},\nYour order for {{serviceName}} is currently being processed.\nNotes: {{notes}}\n\nTrack: {{trackingUrl}}",
            ],

            // 11. ORDER_FAILED
            'ORDER_FAILED' => [
                'code' => 'ORDER_FAILED',
                'name' => 'Order Failed Notice',
                'category' => 'ORDERS',
                'subject' => 'Notice: Action Required on Order #{{orderNumber}}',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'reason', 'supportUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Order Requires Attention',
                    'badge' => 'ORDER FAILED',
                    'badgeType' => 'FAILED',
                    'headline' => 'Action Required on Order #{{orderNumber}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Our desk encountered an issue while processing your order for <strong>{{serviceName}}</strong>.</p>
<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Reason / Issue:</td>
      <td style="padding: 6px 0; color: #991b1b; font-weight: 600;">{{reason}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Please contact our technical support desk or re-verify the submitted identification parameters.</p>',
                    'actionUrl' => '{{supportUrl}}',
                    'actionText' => 'Contact Help Desk',
                ]),
                'bodyText' => "Order #{{orderNumber}} Notice\n\nHello {{firstName}},\nOrder for {{serviceName}} could not complete.\nReason: {{reason}}\n\nContact support: {{supportUrl}}",
            ],

            // 12. ORDER_CANCELLED
            'ORDER_CANCELLED' => [
                'code' => 'ORDER_CANCELLED',
                'name' => 'Order Cancelled Notice',
                'category' => 'ORDERS',
                'subject' => 'Order #{{orderNumber}} Cancelled &amp; Refunded',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'amountNaira', 'reason', 'walletUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Order Cancelled',
                    'badge' => 'ORDER CANCELLED',
                    'badgeType' => 'FAILED',
                    'headline' => 'Order Cancelled &amp; Amount Refunded',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Order <strong>#{{orderNumber}}</strong> for <strong>{{serviceName}}</strong> has been cancelled. Any deducted amount has been restored to your digital wallet.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #dc2626; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Refunded to Wallet:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #059669;">₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Cancellation Reason:</td>
      <td style="padding: 6px 0;">{{reason}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Check your wallet ledger for the posted refund transaction.</p>',
                    'actionUrl' => '{{walletUrl}}',
                    'actionText' => 'Check Wallet Balance',
                ]),
                'bodyText' => "Order #{{orderNumber}} Cancelled\n\nHello {{firstName}},\nOrder #{{orderNumber}} ({{serviceName}}) was cancelled.\nRefunded: ₦{{amountNaira}}\nReason: {{reason}}\n\nWallet: {{walletUrl}}",
            ],

            // 13. SERVICE_COMPLETION
            'SERVICE_COMPLETION' => [
                'code' => 'SERVICE_COMPLETION',
                'name' => 'Service Completed / Delivered',
                'category' => 'ORDERS',
                'subject' => 'Service Complete: Order #{{orderNumber}} Is Ready',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'deliveryNotes', 'portalUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Service Delivered',
                    'badge' => 'COMPLETED &amp; READY',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'Your Service Order Is Ready!',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Great news! Your service request for <strong>{{serviceName}}</strong> (#{{orderNumber}}) has been completed by our technical desk.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Service Delivered:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceName}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Desk Delivery Notes:</td>
      <td style="padding: 6px 0;">{{deliveryNotes}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">You can access your completed documents, slips, or proof of execution directly in your portal.</p>',
                    'actionUrl' => '{{portalUrl}}',
                    'actionText' => 'Access Your Deliverables',
                ]),
                'bodyText' => "Service Completed!\n\nHello {{firstName}},\nYour order #{{orderNumber}} ({{serviceName}}) is ready.\nNotes: {{deliveryNotes}}\n\nAccess portal: {{portalUrl}}",
            ],

            // 14. VTU_TRANSACTION_SUCCESS
            'VTU_TRANSACTION_SUCCESS' => [
                'code' => 'VTU_TRANSACTION_SUCCESS',
                'name' => 'VTU Utility Recharge Successful',
                'category' => 'TELECOM',
                'subject' => 'Recharge Successful: ₦{{amountNaira}} ({{serviceName}})',
                'availableVariables' => ['firstName', 'serviceName', 'reference', 'amountNaira', 'channel', 'timestamp', 'receiptUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'VTU Recharge Successful',
                    'badge' => 'RECHARGE SUCCESSFUL',
                    'badgeType' => 'SUCCESS',
                    'headline' => '₦{{amountNaira}} Recharge Delivered',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your automated VTpass utility recharge of <strong>₦{{amountNaira}}</strong> for <strong>{{serviceName}}</strong> was delivered successfully.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Service:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceName}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Amount:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #059669;">₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Transaction Ref:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 600;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Time:</td>
      <td style="padding: 6px 0;">{{timestamp}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Thank you for using HambakTech automated telecom utility gateway.</p>',
                    'actionUrl' => '{{receiptUrl}}',
                    'actionText' => 'View VTU History',
                ]),
                'bodyText' => "VTU Recharge Successful: ₦{{amountNaira}}\n\nHello {{firstName}},\nService: {{serviceName}}\nAmount: ₦{{amountNaira}}\nRef: {{reference}}\nTime: {{timestamp}}\n\nReceipt: {{receiptUrl}}",
            ],

            // 15. VTU_TRANSACTION_FAILED
            'VTU_TRANSACTION_FAILED' => [
                'code' => 'VTU_TRANSACTION_FAILED',
                'name' => 'VTU Utility Recharge Failed',
                'category' => 'TELECOM',
                'subject' => 'Recharge Unsuccessful: ₦{{amountNaira}} ({{serviceName}})',
                'availableVariables' => ['firstName', 'serviceName', 'reference', 'amountNaira', 'reason', 'portalUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'VTU Recharge Unsuccessful',
                    'badge' => 'RECHARGE FAILED',
                    'badgeType' => 'FAILED',
                    'headline' => 'Recharge Unsuccessful — Wallet Refunded',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your recharge attempt for <strong>{{serviceName}}</strong> was rejected by the upstream telecom provider. Any deducted funds have been automatically refunded to your wallet.</p>
<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Service:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceName}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Attempted Amount:</td>
      <td style="padding: 6px 0; font-weight: 700;">₦{{amountNaira}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Provider Notice:</td>
      <td style="padding: 6px 0; color: #991b1b; font-weight: 600;">{{reason}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Please verify your phone or meter number and retry in your customer portal.</p>',
                    'actionUrl' => '{{portalUrl}}',
                    'actionText' => 'Retry in VTU Desk',
                ]),
                'bodyText' => "VTU Recharge Failed\n\nHello {{firstName}},\nService: {{serviceName}}\nAmount: ₦{{amountNaira}}\nReason: {{reason}}\nWallet refunded.\n\nRetry: {{portalUrl}}",
            ],

            // 16. NIN_SERVICE_STATUS
            'NIN_SERVICE_STATUS' => [
                'code' => 'NIN_SERVICE_STATUS',
                'name' => 'NIN Service Desk Status Update',
                'category' => 'NIN',
                'subject' => 'NIN Service Request #{{trackingNumber}} Update — {{status}}',
                'availableVariables' => ['firstName', 'trackingNumber', 'serviceType', 'status', 'resolutionNotes', 'ninUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'NIN Desk Update',
                    'badge' => 'NIN DESK UPDATE',
                    'badgeType' => 'PENDING',
                    'headline' => 'NIN Request Update: {{status}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your NIMC Identity Desk service request for <strong>{{serviceType}}</strong> has been updated.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0d9488; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Tracking Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{trackingNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Service Type:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceType}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Current Status:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #0d9488; text-transform: uppercase;">{{status}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Officer Remarks:</td>
      <td style="padding: 6px 0;">{{resolutionNotes}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Log in to your portal to download verification slips or review officer instructions.</p>',
                    'actionUrl' => '{{ninUrl}}',
                    'actionText' => 'Open NIN Desk',
                ]),
                'bodyText' => "NIN Service Update\n\nHello {{firstName}},\nRequest #{{trackingNumber}} ({{serviceType}}) status: {{status}}\nNotes: {{resolutionNotes}}\n\nTrack: {{ninUrl}}",
            ],

            // 17. NIN_VERIFICATION_COMPLETED
            'NIN_VERIFICATION_COMPLETED' => [
                'code' => 'NIN_VERIFICATION_COMPLETED',
                'name' => 'NIN Verification Completed Slip Ready',
                'category' => 'NIN',
                'subject' => 'NIN Verification Complete — Slip Ready: {{reference}}',
                'availableVariables' => ['firstName', 'reference', 'timestamp', 'receiptUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'NIN Verification Complete',
                    'badge' => 'VERIFICATION COMPLETED',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'NIN Verified — Slip Generated',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your National Identification Number verification has been validated successfully against official NIMC records.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Tracking Ref:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Document Type:</td>
      <td style="padding: 6px 0; font-weight: 600;">Official High-Resolution NIMC Slip</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Verification Date:</td>
      <td style="padding: 6px 0;">{{timestamp}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Your verifiable slip is ready for instant download and printing.</p>',
                    'actionUrl' => '{{receiptUrl}}',
                    'actionText' => 'Download Verified Slip',
                ]),
                'bodyText' => "NIN Verification Complete!\n\nHello {{firstName}},\nYour NIN verification (Ref: {{reference}}) is complete.\n\nDownload slip: {{receiptUrl}}",
            ],

            // 18. BVN_VERIFICATION_COMPLETED
            'BVN_VERIFICATION_COMPLETED' => [
                'code' => 'BVN_VERIFICATION_COMPLETED',
                'name' => 'BVN Verification Completed',
                'category' => 'IDENTITY',
                'subject' => 'BVN Verification Complete — Reference: {{reference}}',
                'availableVariables' => ['firstName', 'reference', 'timestamp', 'receiptUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'BVN Verification Complete',
                    'badge' => 'BVN VALIDATED',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'BVN Verification Succeeded',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your Bank Verification Number validation check has been verified against the centralized identity database.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Verification Result:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #059669;">VALIDATED</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Timestamp:</td>
      <td style="padding: 6px 0;">{{timestamp}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">You can review the validated parameters in your customer portal.</p>',
                    'actionUrl' => '{{receiptUrl}}',
                    'actionText' => 'View Verification Record',
                ]),
                'bodyText' => "BVN Verification Complete\n\nHello {{firstName}},\nYour BVN check (Ref: {{reference}}) was validated successfully.\n\nRecord: {{receiptUrl}}",
            ],

            // 19. IDENTITY_VERIFICATION_RESULT
            'IDENTITY_VERIFICATION_RESULT' => [
                'code' => 'IDENTITY_VERIFICATION_RESULT',
                'name' => 'Identity Service Result Ready',
                'category' => 'IDENTITY',
                'subject' => 'Identity Verification Result Ready — {{reference}}',
                'availableVariables' => ['firstName', 'serviceType', 'reference', 'status', 'timestamp', 'receiptUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Identity Result Ready',
                    'badge' => 'RESULT READY',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'Identity Verification Result Ready',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">The identity check requested under <strong>{{serviceType}}</strong> has completed processing.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Service:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceType}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">{{reference}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Status:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #059669;">{{status}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Log in to access your detailed demographic report and official verification printout.</p>',
                    'actionUrl' => '{{receiptUrl}}',
                    'actionText' => 'Access Verification Result',
                ]),
                'bodyText' => "Identity Result Ready\n\nHello {{firstName}},\nService: {{serviceType}}\nRef: {{reference}}\nStatus: {{status}}\n\nAccess result: {{receiptUrl}}",
            ],

            // 20. MANUAL_DESK_ORDER_RECEIVED
            'MANUAL_DESK_ORDER_RECEIVED' => [
                'code' => 'MANUAL_DESK_ORDER_RECEIVED',
                'name' => 'Manual Desk Order Received',
                'category' => 'MANUAL_DESK',
                'subject' => 'Manual Desk Request Received — #{{orderNumber}}',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'amountNaira', 'trackingUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Manual Desk Request Logged',
                    'badge' => 'MANUAL DESK LOGGED',
                    'badgeType' => 'ORDER',
                    'headline' => 'Manual Desk Request #{{orderNumber}} Logged',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your assisted desk service request for <strong>{{serviceName}}</strong> has been safely recorded and queued for staff execution.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #1d4ed8; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Tracking Ref:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Service:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceName}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Desk Fee:</td>
      <td style="padding: 6px 0; font-weight: 700;">₦{{amountNaira}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Our identity and documentation specialists are reviewing the submitted files.</p>',
                    'actionUrl' => '{{trackingUrl}}',
                    'actionText' => 'Track Request Progress',
                ]),
                'bodyText' => "Manual Desk Request Logged\n\nHello {{firstName}},\nOrder #{{orderNumber}} for {{serviceName}} (₦{{amountNaira}}) is queued for review.\n\nTrack: {{trackingUrl}}",
            ],

            // 21. MANUAL_DESK_PROCESSING
            'MANUAL_DESK_PROCESSING' => [
                'code' => 'MANUAL_DESK_PROCESSING',
                'name' => 'Manual Desk Processing',
                'category' => 'MANUAL_DESK',
                'subject' => 'Manual Desk Processing: #{{orderNumber}} ({{serviceName}})',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'notes', 'trackingUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Desk Processing In Progress',
                    'badge' => 'SPECIALIST WORKING',
                    'badgeType' => 'PENDING',
                    'headline' => 'Specialist Working on Order #{{orderNumber}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">An officer is currently processing your request for <strong>{{serviceName}}</strong>.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #d97706; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Officer Remarks:</td>
      <td style="padding: 6px 0;">{{notes}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">You will receive an update once all verification seals and deliverable documents are ready.</p>',
                    'actionUrl' => '{{trackingUrl}}',
                    'actionText' => 'Check Desk Status',
                ]),
                'bodyText' => "Manual Desk Processing\n\nHello {{firstName}},\nOfficer working on #{{orderNumber}} ({{serviceName}}).\nNotes: {{notes}}\n\nTrack: {{trackingUrl}}",
            ],

            // 22. MANUAL_DESK_COMPLETED
            'MANUAL_DESK_COMPLETED' => [
                'code' => 'MANUAL_DESK_COMPLETED',
                'name' => 'Manual Desk Completed',
                'category' => 'MANUAL_DESK',
                'subject' => 'Manual Desk Request Completed — #{{orderNumber}}',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'deliveryNotes', 'portalUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Manual Desk Completed',
                    'badge' => 'DESK COMPLETED',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'Manual Desk Service Completed!',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Our operations team has finalized your manual desk request for <strong>{{serviceName}}</strong> (#{{orderNumber}}).</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Number:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Execution Summary:</td>
      <td style="padding: 6px 0;">{{deliveryNotes}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">You can download your official documents and certificate deliverables in the customer portal.</p>',
                    'actionUrl' => '{{portalUrl}}',
                    'actionText' => 'Open Customer Portal',
                ]),
                'bodyText' => "Manual Desk Complete\n\nHello {{firstName}},\nYour request #{{orderNumber}} ({{serviceName}}) was completed.\nNotes: {{deliveryNotes}}\n\nPortal: {{portalUrl}}",
            ],

            // 23. MANUAL_DESK_RESULT_READY
            'MANUAL_DESK_RESULT_READY' => [
                'code' => 'MANUAL_DESK_RESULT_READY',
                'name' => 'Manual Desk Result & Document Ready',
                'category' => 'MANUAL_DESK',
                'subject' => 'Deliverables Ready: #{{orderNumber}} ({{serviceName}})',
                'availableVariables' => ['firstName', 'orderNumber', 'serviceName', 'receiptUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Deliverable Document Ready',
                    'badge' => 'DOCUMENT READY',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'Your Documents Are Ready for Download',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">The document output and certified slips for order <strong>#{{orderNumber}}</strong> ({{serviceName}}) are ready.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 35%;">Order Reference:</td>
      <td style="padding: 6px 0; font-family: monospace; font-weight: 700;">#{{orderNumber}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Document Type:</td>
      <td style="padding: 6px 0; font-weight: 600;">{{serviceName}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Security Integrity:</td>
      <td style="padding: 6px 0; font-weight: 600; color: #059669;">Cryptographically Signed &amp; Verified</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Click below to securely view and print your finalized documents.</p>',
                    'actionUrl' => '{{receiptUrl}}',
                    'actionText' => 'Download Final Document',
                ]),
                'bodyText' => "Document Ready\n\nHello {{firstName}},\nYour documents for order #{{orderNumber}} ({{serviceName}}) are ready.\n\nDownload: {{receiptUrl}}",
            ],

            // 24. WELCOME_VERIFICATION
            'WELCOME_VERIFICATION' => [
                'code' => 'WELCOME_VERIFICATION',
                'name' => 'Account Welcome & Email Verification',
                'category' => 'AUTH',
                'subject' => 'Welcome to HambakTech — Verify Your Email Address',
                'availableVariables' => ['firstName', 'verificationUrl', 'expiresIn'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Verify Your Email Address',
                    'badge' => 'WELCOME TO HAMBAKTECH',
                    'badgeType' => 'INFO',
                    'headline' => 'Welcome to HambakTech, {{firstName}}!',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Thank you for creating an account with HambakTech Smart Digital Platform.</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">To activate your full access to customer services, digital wallet, NIN identity desk, and training academy, please verify your email address below.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px; color: #475569;">
  This verification link is active for <strong>{{expiresIn}}</strong>.
</div>',
                    'actionUrl' => '{{verificationUrl}}',
                    'actionText' => 'Verify Email Address',
                    'footerNote' => 'If you did not sign up for an account on HambakTech, please disregard this message.',
                ]),
                'bodyText' => "Welcome to HambakTech, {{firstName}}!\n\nPlease verify your email address:\n{{verificationUrl}}\n\nActive for {{expiresIn}}.",
            ],

            // 25. PASSWORD_RESET
            'PASSWORD_RESET' => [
                'code' => 'PASSWORD_RESET',
                'name' => 'Password Reset Request',
                'category' => 'AUTH',
                'subject' => 'Reset Your HambakTech Account Password',
                'availableVariables' => ['firstName', 'resetUrl', 'expiresIn', 'ipAddress'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Reset Your Password',
                    'badge' => 'SECURITY ACTION',
                    'badgeType' => 'SECURITY',
                    'headline' => 'Password Reset Request',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">We received a request to reset your password for your HambakTech account. Click the button below to choose a new, secure password.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
  <strong>Request Origin:</strong> {{ipAddress}}<br>
  <strong>Validity:</strong> {{expiresIn}}
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">If you did not request a password reset, please ignore this email or contact security immediately.</p>',
                    'actionUrl' => '{{resetUrl}}',
                    'actionText' => 'Reset Password Now',
                    'footerNote' => 'Never share this link with anyone. HambakTech support will never ask for your password.',
                ]),
                'bodyText' => "Hello {{firstName}},\n\nReset your password here:\n{{resetUrl}}\n\nOrigin: {{ipAddress}}\nValidity: {{expiresIn}}.",
            ],

            // 26. PASSWORD_RESET_OTP
            'PASSWORD_RESET_OTP' => [
                'code' => 'PASSWORD_RESET_OTP',
                'name' => 'Password Reset 8-Digit Verification Code',
                'category' => 'AUTH',
                'subject' => '{{otpCode}} is your HambakTech password reset code',
                'availableVariables' => ['firstName', 'otpCode', 'expiresInMinutes', 'ipAddress'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Password Reset Code',
                    'badge' => 'ONE-TIME PASSCODE',
                    'badgeType' => 'SECURITY',
                    'headline' => 'Password Reset Verification Code',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Use the verification code below to authorize your password change.</p>
<div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; font-weight: 700; margin-bottom: 8px;">Your 8-Digit Reset Code</div>
  <div style="font-family: monospace; font-size: 38px; font-weight: 800; letter-spacing: 0.25em; color: #0f172a;">{{otpCode}}</div>
  <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Expires in {{expiresInMinutes}} minutes &bull; Maximum 5 verification attempts</div>
</div>
<div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 14px 18px; margin: 20px 0; font-size: 12px; color: #475569;">
  <strong>Security Notice:</strong> Never share this code with anyone. HambakTech staff will NEVER ask for your code.
</div>',
                    'footerNote' => 'This code is single-use and will expire in {{expiresInMinutes}} minutes.',
                ]),
                'bodyText' => "Password Reset Code\n\nHello {{firstName}},\nYour reset code: {{otpCode}}\nExpires in {{expiresInMinutes}} minutes. Do not share.",
            ],

            // 27. PASSWORD_CHANGE_CONFIRMATION
            'PASSWORD_CHANGE_CONFIRMATION' => [
                'code' => 'PASSWORD_CHANGE_CONFIRMATION',
                'name' => 'Password Changed Confirmation',
                'category' => 'SECURITY',
                'subject' => 'Security Notice: Your Password Has Been Changed',
                'availableVariables' => ['firstName', 'timestamp', 'ipAddress', 'securityUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Password Changed',
                    'badge' => 'SECURITY NOTICE',
                    'badgeType' => 'SECURITY',
                    'headline' => 'Your Password Has Been Updated',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">The password for your HambakTech account was changed successfully.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
  <strong>Timestamp:</strong> {{timestamp}}<br>
  <strong>Network Origin:</strong> {{ipAddress}}
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">If you made this change, you can safely disregard this email. If not, please review your account security immediately.</p>',
                    'actionUrl' => '{{securityUrl}}',
                    'actionText' => 'Review Account Security',
                ]),
                'bodyText' => "Hello {{firstName}},\n\nYour password was changed at {{timestamp}} from {{ipAddress}}.\n\nReview security: {{securityUrl}}",
            ],

            // 28. ACCOUNT_STATUS
            'ACCOUNT_STATUS' => [
                'code' => 'ACCOUNT_STATUS',
                'name' => 'Account Status Update',
                'category' => 'ACCOUNT',
                'subject' => 'Important: Update Regarding Your HambakTech Account Status',
                'availableVariables' => ['firstName', 'status', 'reason', 'actionRequired', 'supportUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Account Status Update',
                    'badge' => 'ACCOUNT UPDATE',
                    'badgeType' => 'PENDING',
                    'headline' => 'Account Status: {{status}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your HambakTech account status has been updated to: <strong>{{status}}</strong>.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #d97706; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
  <strong>Current Status:</strong> {{status}}<br>
  <strong>Reason:</strong> {{reason}}<br>
  <strong>Action Required:</strong> {{actionRequired}}
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Reach out to our customer support desk if you have any questions.</p>',
                    'actionUrl' => '{{supportUrl}}',
                    'actionText' => 'Contact Support Desk',
                ]),
                'bodyText' => "Account Status: {{status}}\n\nHello {{firstName}},\nReason: {{reason}}\nAction: {{actionRequired}}\n\nSupport: {{supportUrl}}",
            ],

            // 29. ACADEMY_APPLICATION_SUBMITTED
            'ACADEMY_APPLICATION_SUBMITTED' => [
                'code' => 'ACADEMY_APPLICATION_SUBMITTED',
                'name' => 'Academy Application Submitted',
                'category' => 'ACADEMY',
                'subject' => 'Academy Application Received — #{{applicationNumber}}',
                'availableVariables' => ['firstName', 'applicationNumber', 'courseName', 'cohortName', 'academyUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Academy Application Received',
                    'badge' => 'ADMISSIONS DESK',
                    'badgeType' => 'INFO',
                    'headline' => 'Academy Admission Application Received',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your application for <strong>{{courseName}}</strong> has been received by the HambakTech Institute of Computer Technology.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
  <strong>Application Number:</strong> #{{applicationNumber}}<br>
  <strong>Program:</strong> {{courseName}}<br>
  <strong>Target Stream:</strong> {{cohortName}}
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Our admissions board is reviewing your prerequisites. You will receive an admission status decision shortly.</p>',
                    'actionUrl' => '{{academyUrl}}',
                    'actionText' => 'View Application Status',
                ]),
                'bodyText' => "Academy Application Received\n\nHello {{firstName}},\nProgram: {{courseName}}\nApp #: {{applicationNumber}}\n\nCheck status: {{academyUrl}}",
            ],

            // 30. ACADEMY_ADMISSION_STATUS
            'ACADEMY_ADMISSION_STATUS' => [
                'code' => 'ACADEMY_ADMISSION_STATUS',
                'name' => 'Academy Admission Decision',
                'category' => 'ACADEMY',
                'subject' => 'HambakTech Academy Admission Decision: {{admissionStatus}}',
                'availableVariables' => ['firstName', 'applicationNumber', 'courseName', 'admissionStatus', 'admissionsNote', 'academyUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Academy Admission Decision',
                    'badge' => 'ADMISSIONS DECISION',
                    'badgeType' => 'INFO',
                    'headline' => 'Admission Decision: {{admissionStatus}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">An admission decision has been rendered for your application #{{applicationNumber}} ({{courseName}}).</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
  <strong>Decision:</strong> {{admissionStatus}}<br>
  <strong>Faculty Note:</strong> {{admissionsNote}}
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Please complete your enrollment confirmation in your student portal.</p>',
                    'actionUrl' => '{{academyUrl}}',
                    'actionText' => 'Proceed to Student Portal',
                ]),
                'bodyText' => "Academy Admission Decision\n\nHello {{firstName}},\nStatus: {{admissionStatus}}\nNote: {{admissionsNote}}\n\nPortal: {{academyUrl}}",
            ],

            // 31. SUPPORT_TICKET_UPDATE
            'SUPPORT_TICKET_UPDATE' => [
                'code' => 'SUPPORT_TICKET_UPDATE',
                'name' => 'Support Ticket Update',
                'category' => 'SUPPORT',
                'subject' => 'Support Ticket #{{ticketNumber}} Updated — {{subject}}',
                'availableVariables' => ['firstName', 'ticketNumber', 'subject', 'status', 'latestMessage', 'ticketUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Support Ticket Update',
                    'badge' => 'SUPPORT DESK REPLY',
                    'badgeType' => 'INFO',
                    'headline' => 'Update on Ticket #{{ticketNumber}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">There is a new update or response on your support ticket: <strong>{{subject}}</strong>.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
  <strong>Ticket Reference:</strong> #{{ticketNumber}}<br>
  <strong>Status:</strong> {{status}}<br>
  <strong>Latest Desk Response:</strong><br>
  <div style="margin-top: 6px; padding: 10px; background-color: #ffffff; border-radius: 6px; border: 1px solid #e2e8f0; color: #1e293b;">
    {{latestMessage}}
  </div>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">You can reply directly to this ticket from your customer portal.</p>',
                    'actionUrl' => '{{ticketUrl}}',
                    'actionText' => 'View &amp; Reply to Ticket',
                ]),
                'bodyText' => "Support Ticket Update\n\nHello {{firstName}},\nTicket: #{{ticketNumber}}\nStatus: {{status}}\nLatest message:\n{{latestMessage}}\n\nReply: {{ticketUrl}}",
            ],

            // 32. SECURITY_ALERT
            'SECURITY_ALERT' => [
                'code' => 'SECURITY_ALERT',
                'name' => 'Security Alert',
                'category' => 'SECURITY',
                'subject' => 'SECURITY ALERT: Urgent Activity on Your HambakTech Account',
                'availableVariables' => ['firstName', 'eventType', 'details', 'timestamp', 'ipAddress', 'securityUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Security Alert',
                    'badge' => 'CRITICAL SECURITY ALERT',
                    'badgeType' => 'FAILED',
                    'headline' => 'Critical Security Alert',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Our automated security monitoring system detected a sensitive security event associated with your account.</p>
<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; color: #991b1b; font-weight: 700; width: 35%;">Event Type:</td>
      <td style="padding: 6px 0; font-weight: 700; color: #991b1b;">{{eventType}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Timestamp:</td>
      <td style="padding: 6px 0;">{{timestamp}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Origin IP:</td>
      <td style="padding: 6px 0; font-family: monospace;">{{ipAddress}}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; color: #64748b;">Details:</td>
      <td style="padding: 6px 0;">{{details}}</td>
    </tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">If you did not authorize this activity, please immediately secure your account by changing your password and terminating active sessions.</p>',
                    'actionUrl' => '{{securityUrl}}',
                    'actionText' => 'Review Security Settings Now',
                    'footerNote' => 'This is an automated critical security broadcast. System security alerts cannot be disabled.',
                ]),
                'bodyText' => "SECURITY ALERT\n\nHello {{firstName}},\nEvent: {{eventType}}\nTime: {{timestamp}}\nIP: {{ipAddress}}\nDetails: {{details}}\n\nIf not you, secure your account now: {{securityUrl}}",
            ],

            // 33. KYC_SUBMITTED
            'KYC_SUBMITTED' => [
                'code' => 'KYC_SUBMITTED',
                'name' => 'KYC Identity Verification Received',
                'category' => 'IDENTITY',
                'subject' => 'Identity Verification Dossier Received — Ref: {{reference}}',
                'availableVariables' => ['firstName', 'idType', 'maskedIdentifier', 'reference', 'portalUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'KYC Received',
                    'badge' => 'KYC IN QUEUE',
                    'badgeType' => 'PENDING',
                    'headline' => 'Identity Verification Dossier Received',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Thank you for submitting your statutory identity verification dossier. Your application has been logged into the compliance review queue.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #d97706; border-radius: 10px; padding: 18px 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr><td style="padding: 6px 0; color: #64748b; width: 40%;">Document Type:</td><td style="padding: 6px 0; font-weight: 700; color: #0f172a;">{{idType}}</td></tr>
    <tr><td style="padding: 6px 0; color: #64748b;">Masked Identifier:</td><td style="padding: 6px 0; font-family: monospace; font-weight: 700; color: #0f172a;">{{maskedIdentifier}}</td></tr>
    <tr><td style="padding: 6px 0; color: #64748b;">Queue Reference:</td><td style="padding: 6px 0; font-family: monospace; color: #0f172a;">{{reference}}</td></tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; line-height: 1.6;">Compliance desk reviews are typically finalized within 15–30 minutes during standard processing hours.</p>',
                    'actionUrl' => '{{portalUrl}}',
                    'actionText' => 'Check Verification Status',
                ]),
                'bodyText' => "Hello {{firstName}},\n\nYour {{idType}} verification dossier ({{maskedIdentifier}}) was received. Ref: {{reference}}.\n\nCheck status: {{portalUrl}}",
            ],

            // 34. KYC_APPROVED
            'KYC_APPROVED' => [
                'code' => 'KYC_APPROVED',
                'name' => 'KYC Verification Approved',
                'category' => 'IDENTITY',
                'subject' => 'Congratulations! Your Identity Verification Has Been Approved',
                'availableVariables' => ['firstName', 'tier', 'dailyLimitFormatted', 'portalUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'KYC Approved',
                    'badge' => 'VERIFIED & UPGRADED',
                    'badgeType' => 'SUCCESS',
                    'headline' => 'Your Identity Verification Has Been Approved',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">We are pleased to inform you that your identity documents have been verified and approved by our compliance desk.</p>
<div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-left: 4px solid #059669; border-radius: 10px; padding: 18px 20px; margin: 24px 0;">
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr><td style="padding: 6px 0; color: #047857; width: 40%;">Account Tier:</td><td style="padding: 6px 0; font-weight: 700; color: #065f46; text-transform: uppercase;">{{tier}}</td></tr>
    <tr><td style="padding: 6px 0; color: #047857;">Daily Transaction Limit:</td><td style="padding: 6px 0; font-weight: 700; color: #065f46;">{{dailyLimitFormatted}}</td></tr>
    <tr><td style="padding: 6px 0; color: #047857;">Account Status:</td><td style="padding: 6px 0; font-weight: 700; color: #059669;">FULL COMPLIANCE ACTIVE</td></tr>
  </table>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; line-height: 1.6;">Next step: If you haven\'t already, configure your 4-digit transaction PIN in your customer dashboard to authorize wallet payments.</p>',
                    'actionUrl' => '{{portalUrl}}',
                    'actionText' => 'Open Customer Portal',
                ]),
                'bodyText' => "Hello {{firstName}},\n\nCongratulations! Your identity verification has been approved. Your account is now upgraded to {{tier}} with a daily limit of {{dailyLimitFormatted}}.\n\nOpen portal: {{portalUrl}}",
            ],

            // 35. KYC_REJECTED
            'KYC_REJECTED' => [
                'code' => 'KYC_REJECTED',
                'name' => 'KYC Verification Correction Required',
                'category' => 'IDENTITY',
                'subject' => 'Action Required: Identity Verification Correction Needed',
                'availableVariables' => ['firstName', 'rejectionReason', 'portalUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'KYC Correction Required',
                    'badge' => 'CORRECTION REQUIRED',
                    'badgeType' => 'FAILED',
                    'headline' => 'Identity Verification Update',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Our compliance desk has reviewed your identity submission. Regrettably, your dossier could not be approved at this time.</p>
<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 18px 20px; margin: 24px 0;">
  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #991b1b; font-weight: 700; margin-bottom: 8px;">Compliance Feedback:</div>
  <div style="font-size: 14px; color: #7f1d1d; line-height: 1.6;">{{rejectionReason}}</div>
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; line-height: 1.6;">You can correct your details or resubmit a matching official identity document through the link below.</p>',
                    'actionUrl' => '{{portalUrl}}',
                    'actionText' => 'Resubmit Identity Verification',
                ]),
                'bodyText' => "Hello {{firstName}},\n\nYour identity verification requires correction:\n{{rejectionReason}}\n\nPlease review and resubmit: {{portalUrl}}",
            ],

            // 36. TRANSACTION_PIN_CREATED
            'TRANSACTION_PIN_CREATED' => [
                'code' => 'TRANSACTION_PIN_CREATED',
                'name' => 'Transaction PIN Established',
                'category' => 'SECURITY',
                'subject' => 'Security Notice: Your Transaction PIN Has Been Established',
                'availableVariables' => ['firstName', 'timestamp', 'ipAddress', 'securityUrl'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'PIN Established',
                    'badge' => 'SECURITY UPDATE',
                    'badgeType' => 'SECURITY',
                    'headline' => 'Transaction PIN Established',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">Your 4-digit transaction PIN has been successfully established for your HambakTech account.</p>
<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 10px; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
  <strong>Timestamp:</strong> {{timestamp}}<br>
  <strong>Network Origin:</strong> {{ipAddress}}
</div>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">This PIN is required to authorize all wallet debit transactions, bill payments, and disbursements. If you did not establish this PIN, please immediately secure your account.</p>',
                    'actionUrl' => '{{securityUrl}}',
                    'actionText' => 'Review Account Security',
                ]),
                'bodyText' => "Hello {{firstName}},\n\nYour transaction PIN was established at {{timestamp}} from {{ipAddress}}.\n\nReview security: {{securityUrl}}",
            ],

            // 37. TRANSACTION_PIN_RESET
            'TRANSACTION_PIN_RESET' => [
                'code' => 'TRANSACTION_PIN_RESET',
                'name' => 'Transaction PIN Reset Authorization Code',
                'category' => 'SECURITY',
                'subject' => '{{otpCode}} is your HambakTech PIN reset code',
                'availableVariables' => ['firstName', 'otpCode', 'expiresInMinutes'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Transaction PIN Reset Code',
                    'badge' => 'ONE-TIME PASSCODE',
                    'badgeType' => 'SECURITY',
                    'headline' => 'Transaction PIN Reset Code',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin: 0 0 20px 0; font-size: 14px; color: #475569; line-height: 1.6;">We received a request to reset your 4-digit transaction PIN. Use the verification code below to authorize a new PIN:</p>
<div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; font-weight: 700; margin-bottom: 8px;">Your 6-Digit Authorization Code</div>
  <div style="font-family: monospace; font-size: 38px; font-weight: 800; letter-spacing: 0.25em; color: #0f172a;">{{otpCode}}</div>
  <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Expires in {{expiresInMinutes}} minutes &bull; Single-use</div>
</div>
<div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 14px 18px; margin: 20px 0; font-size: 12px; color: #475569;">
  <strong>Security Notice:</strong> Never share this code with anyone. HambakTech support will NEVER ask for your code.
</div>',
                    'footerNote' => 'If you did not request this code, your account may be compromised. Please review your security settings.',
                ]),
                'bodyText' => "Transaction PIN Reset Code\n\nHello {{firstName}},\nYour reset code: {{otpCode}}\nExpires in {{expiresInMinutes}} minutes. Do not share.",
            ],

            // 38. GENERAL_ANNOUNCEMENT
            'GENERAL_ANNOUNCEMENT' => [
                'code' => 'GENERAL_ANNOUNCEMENT',
                'name' => 'General Platform Announcement',
                'category' => 'BROADCAST',
                'subject' => 'HambakTech Update: {{headline}}',
                'availableVariables' => ['firstName', 'headline', 'message', 'actionUrl', 'actionText'],
                'bodyHtml' => $this->wrapInBrandedEmailShell([
                    'title' => 'Platform Announcement',
                    'badge' => 'PLATFORM ANNOUNCEMENT',
                    'badgeType' => 'INFO',
                    'headline' => '{{headline}}',
                    'bodyHtml' => '<p style="margin: 0 0 16px 0; font-size: 15px; color: #1e293b;">Hello <strong>{{firstName}}</strong>,</p>
<div style="font-size: 14px; color: #334155; line-height: 1.65; margin: 20px 0;">{{message}}</div>',
                    'actionUrl' => '{{actionUrl}}',
                    'actionText' => '{{actionText}}',
                ]),
                'bodyText' => "Hello {{firstName}},\n\n{{headline}}\n\n{{message}}\n\nLink: {{actionUrl}}",
            ],
        ];
    }

    /**
     * Resolve fallback template by code or alias.
     */
    public function getFallbackTemplate(string $code): ?array
    {
        $canonicalCode = self::TEMPLATE_ALIASES[$code] ?? $code;
        $defs = $this->getCanonicalTemplatesDefinitions();
        return $defs[$canonicalCode] ?? ($defs[$code] ?? null);
    }

    /**
     * Get all 17 canonical templates formatted as database records.
     */
    public function getAllCanonicalTemplates(): array
    {
        $defs = $this->getCanonicalTemplatesDefinitions();
        $records = [];
        foreach ($defs as $code => $tpl) {
            $records[] = [
                'id'                 => 'tpl-' . strtolower(str_replace('_', '-', $code)),
                'code'               => $tpl['code'],
                'name'               => $tpl['name'],
                'category'           => $tpl['category'],
                'subject'            => $tpl['subject'],
                'bodyHtml'           => $tpl['bodyHtml'],
                'bodyText'           => $tpl['bodyText'],
                'availableVariables' => $tpl['availableVariables'],
                'isActive'           => true,
                'createdAt'          => date('Y-m-d H:i:s'),
                'updatedAt'          => date('Y-m-d H:i:s'),
            ];
        }
        return $records;
    }

    /**
     * Truthful notification health probe for admin desk.
     */
    public function getHealth(): array
    {
        $cfg = $this->getConfig();

        if (empty($cfg['host']) || empty($cfg['username'])) {
            return [
                'name' => 'SMTP (cPanel / mail.hambaktech.com.ng)',
                'channel' => 'EMAIL',
                'configured' => false,
                'status' => 'NOT_CONFIGURED',
                'detail' => 'SMTP host or credentials are not yet configured in admin settings.',
                'lastTestedAt' => $cfg['lastTestedAt'],
                'lastTestStatus' => $cfg['lastTestStatus'],
            ];
        }

        // Quick non-blocking socket ping (3-second timeout)
        $target = ($cfg['encryption'] === 'ssl' ? 'ssl://' : 'tcp://') . $cfg['host'];
        $errno = 0;
        $errstr = '';
        $sock = @stream_socket_client(
            "{$target}:{$cfg['port']}",
            $errno,
            $errstr,
            3.0,
            STREAM_CLIENT_CONNECT
        );

        if ($sock) {
            fclose($sock);
            return [
                'name' => 'SMTP (' . $cfg['host'] . ':' . $cfg['port'] . ')',
                'channel' => 'EMAIL',
                'configured' => true,
                'status' => 'ONLINE',
                'detail' => "Port {$cfg['port']} reachable. Ready for transactional dispatch.",
                'lastTestedAt' => $cfg['lastTestedAt'],
                'lastTestStatus' => $cfg['lastTestStatus'] ?: 'SUCCESS',
            ];
        }

        return [
            'name' => 'SMTP (' . $cfg['host'] . ':' . $cfg['port'] . ')',
            'channel' => 'EMAIL',
            'configured' => true,
            'status' => 'STANDBY',
            'detail' => "Host configured. Socket probe: {$errstr} ({$errno}).",
            'lastTestedAt' => $cfg['lastTestedAt'],
            'lastTestStatus' => $cfg['lastTestStatus'],
        ];
    }

    private function createDeliveryRecord(
        string $id,
        ?string $notificationId,
        string $recipient,
        string $status,
        ?string $providerMsgId,
        ?string $failureReason
    ): void {
        try {
            $conn = $this->db->getConnection();
            $stmt = $conn->prepare("
                INSERT INTO `CommunicationDelivery`
                    (`id`, `notificationId`, `channel`, `provider`, `status`, `recipientAddress`, `providerMessageId`, `failureReason`, `attemptedAt`, `deliveredAt`, `createdAt`)
                VALUES
                    (:id, :nid, 'EMAIL', 'SMTP', :status, :recipient, :msgId, :reason, NOW(3), :delivAt, NOW(3))
            ");
            $stmt->execute([
                ':id' => $id,
                ':nid' => $notificationId,
                ':status' => $status,
                ':recipient' => $recipient,
                ':msgId' => $providerMsgId,
                ':reason' => $failureReason ? mb_substr($failureReason, 0, 190) : null,
                ':delivAt' => ($status === 'SENT') ? date('Y-m-d H:i:s') : null,
            ]);
        } catch (\Throwable) {
            // Ignore DB delivery audit failure to never crash primary workflow
        }
    }

    private function logDelivery(?string $notificationId, string $recipient, string $status, ?string $msgId, ?string $reason): void
    {
        $id = 'cd-' . bin2hex(random_bytes(16));
        $this->createDeliveryRecord($id, $notificationId, $recipient, $status, $msgId, $reason);
    }

    private function encrypt(string $plainText): string
    {
        $iv = random_bytes(16);
        $encrypted = openssl_encrypt($plainText, 'AES-256-CBC', $this->encryptionKey, 0, $iv);
        if ($encrypted === false) {
            throw new RuntimeException('Encryption error');
        }
        return base64_encode($iv . '::' . $encrypted);
    }

    private function decrypt(string $cipherPayload): string|false
    {
        $raw = base64_decode($cipherPayload, true);
        if ($raw === false) {
            return false;
        }
        $parts = explode('::', $raw, 2);
        if (count($parts) !== 2) {
            return false;
        }
        [$iv, $encrypted] = $parts;
        return openssl_decrypt($encrypted, 'AES-256-CBC', $this->encryptionKey, 0, $iv);
    }
}
