<?php
/**
 * @file MailService.php
 * Transactional Email & OTP Delivery Service
 * Dispatches secure verification tokens, OTP alerts, and notifications via SMTP sockets.
 */

declare(strict_types=1);

namespace HambakTech\Services;

use Exception;
use Throwable;
use HambakTech\Core\Database;
use HambakTech\Core\Security;

class MailService
{
    public const NOTIFICATION_OPTIONS = [
        'from_email' => 'notifications@hambaktech.com.ng',
        'from_name' => 'HAMBAKTECH Notifications',
        'reply_to' => 'support@hambaktech.com.ng',
    ];

    public const SUPPORT_OPTIONS = [
        'from_email' => 'support@hambaktech.com.ng',
        'from_name' => 'HAMBAKTECH Support',
        'reply_to' => 'support@hambaktech.com.ng',
    ];

    private Database $db;
    private array $config;
    private bool $hasDbOverride = false;
    private string $appUrl;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $baseCfg = [];
        $cfgFile = dirname(__DIR__) . '/config/config.php';
        if (file_exists($cfgFile)) {
            $baseCfg = require $cfgFile;
        }
        $configuredUrl = trim((string)($baseCfg['app']['url'] ?? getenv('APP_URL') ?: 'https://hambaktech.com.ng'));
        $this->appUrl = rtrim($configuredUrl !== '' ? $configuredUrl : 'https://hambaktech.com.ng', '/');
        $mailDefaults = $baseCfg['mail'] ?? [
            'host' => 'mail.hambaktech.com.ng',
            'port' => 465,
            'encryption' => 'ssl',
            'user' => 'support@hambaktech.com.ng',
            'password' => '',
            'from_name' => 'HambakTech Support',
            'from_email' => 'support@hambaktech.com.ng',
        ];

        $this->config = $mailDefaults;

        try {
            $row = $this->db->fetchOne('SELECT * FROM smtp_configs WHERE is_active = 1 LIMIT 1');
            if ($row && !empty($row['host'])) {
                $this->hasDbOverride = true;
                $this->config['host'] = $row['host'];
                $this->config['port'] = (int)$row['port'];
                $this->config['encryption'] = $row['encryption'] ?: (((int)$row['port'] === 465) ? 'ssl' : 'tls');
                $this->config['user'] = $row['username'] ?: $mailDefaults['user'];
                if (!empty($row['password'])) {
                    $this->config['password'] = $row['password'];
                }
                if (!empty($row['sender_email'])) {
                    $this->config['from_email'] = $row['sender_email'];
                }
                if (!empty($row['sender_name'])) {
                    $this->config['from_name'] = $row['sender_name'];
                }
                if (!empty($row['reply_to'])) {
                    $this->config['reply_to'] = $row['reply_to'];
                }
            }
        } catch (Throwable) {
            // Table may not exist yet before SchemaSync
        }
    }

    /**
     * Resolve effective sender identity, honoring active DB smtp_configs overrides when present.
     */
    public function getSenderIdentity(
        string $defaultFromEmail = 'notifications@hambaktech.com.ng',
        string $defaultFromName = 'HAMBAKTECH Support',
        string $defaultReplyTo = 'support@hambaktech.com.ng'
    ): array {
        $cfgFrom = trim((string)($this->config['from_email'] ?? ''));
        $cfgUser = trim((string)($this->config['user'] ?? ''));
        $cfgName = trim((string)($this->config['from_name'] ?? ''));
        $cfgReply = trim((string)($this->config['reply_to'] ?? ''));

        $fromEmail = $defaultFromEmail;
        if ($this->hasDbOverride && filter_var($cfgFrom, FILTER_VALIDATE_EMAIL)) {
            $fromEmail = $cfgFrom;
        } elseif (!$this->hasDbOverride && filter_var($cfgUser, FILTER_VALIDATE_EMAIL)) {
            $fromEmail = $cfgUser;
        }

        return [
            'from_email' => $fromEmail,
            'from_name' => $this->hasDbOverride && $cfgName !== '' ? $cfgName : $defaultFromName,
            'reply_to' => filter_var($cfgReply, FILTER_VALIDATE_EMAIL) ? $cfgReply : $defaultReplyTo,
        ];
    }

    /**
     * Send OTP Verification Email
     */
    public function sendPasswordResetOtp(string $recipientEmail, string $recipientName, string $otpCode, string $resetToken): array
    {
        $subject = 'Your HambakTech Verification Code: ' . $otpCode;
        $html = $this->buildOtpHtml($recipientName, $otpCode, $resetToken);
        return $this->send(
            $recipientEmail,
            $recipientName,
            $subject,
            $html,
            $otpCode,
            self::NOTIFICATION_OPTIONS + ['audit_action' => 'OTP_DISPATCHED']
        );
    }

    /**
     * Send Account Registration Email Verification (6-digit OTP + secure click-to-verify link)
     */
    public function sendEmailVerification(
        string $recipientEmail,
        string $recipientName,
        string $otpCode,
        string $verifyToken,
        int $expiryMinutes = 60
    ): array {
        $subject = 'Verify Your HAMBAKTECH Email Address';
        $verifyUrl = $this->appUrl . '/?verify_email=1&token=' . rawurlencode($verifyToken) . '&email=' . rawurlencode($recipientEmail);
        $html = $this->buildEmailVerificationHtml($recipientEmail, $recipientName, $otpCode, $verifyUrl, $expiryMinutes);
        $safeGreeting = !empty(trim($recipientName)) ? trim($recipientName) : 'Valued Customer';
        $textBody = "HAMBAK TECH & SERVICES\n\n"
            . "Hello {$safeGreeting},\n\n"
            . "Thank you for registering on HAMBAK TECH & SERVICES. To activate wallet funding, identity verification, VTU services, and order submissions, verify your email address using either option below:\n\n"
            . "6-Digit Verification Code: {$otpCode}\n"
            . "Verification Link: {$verifyUrl}\n\n"
            . "This code and link expire in {$expiryMinutes} minutes. Never share your verification code with anyone.\n\n"
            . "Need assistance? Email support@hambaktech.com.ng or call 09127469686.\n";

        $sender = $this->getSenderIdentity(
            'notifications@hambaktech.com.ng',
            'HAMBAKTECH Support',
            'support@hambaktech.com.ng'
        );

        return $this->send(
            $recipientEmail,
            $recipientName,
            $subject,
            $html,
            null,
            $sender + [
                'text_body' => $textBody,
                'audit_action' => 'EMAIL_VERIFICATION_DISPATCHED',
            ]
        );
    }

    /**
     * Direct RFC-5321 Authenticated SMTP Mail Sender via SmtpTransport
     *
     * @param array{
     *   from_email?: string,
     *   from_name?: string,
     *   reply_to?: string,
     *   text_body?: string,
     *   envelope_from?: string,
     *   audit_action?: string
     * } $options
     */
    public function send(
        string $toEmail,
        string $toName,
        string $subject,
        string $htmlBody,
        ?string $otp = null,
        array $options = []
    ): array {
        $cleanEmail = strtolower(trim($toEmail));
        $host = (string)($this->config['host'] ?? 'mail.hambaktech.com.ng');
        $port = (int)($this->config['port'] ?? 465);
        $encryption = (string)($this->config['encryption'] ?? ($port === 465 ? 'ssl' : 'tls'));
        $username = (string)($this->config['user'] ?? '');
        $password = (string)($this->config['password'] ?? '');

        $fromEmail = trim((string)($options['from_email'] ?? ($this->config['from_email'] ?? 'support@hambaktech.com.ng')));
        if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            $fromEmail = (string)($this->config['from_email'] ?? 'support@hambaktech.com.ng');
        }
        $fromName = trim((string)($options['from_name'] ?? ($this->config['from_name'] ?? 'HambakTech Support')));
        $replyTo = trim((string)($options['reply_to'] ?? ($this->config['reply_to'] ?? $fromEmail)));
        $textBody = (string)($options['text_body'] ?? '');
        $envelopeFrom = isset($options['envelope_from']) ? trim((string)$options['envelope_from']) : null;
        $auditAction = trim((string)($options['audit_action'] ?? ($otp ? 'OTP_DISPATCHED' : 'EMAIL_DISPATCHED')));

        $deliverySuccess = false;
        $deliveryMessage = '';
        $messageId = '';
        $smtpResponse = '';

        // 1. Log in internal notifications table if user exists and OTP is set
        if ($otp) {
            try {
                $user = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1', ['email' => $cleanEmail]);
                if ($user) {
                    $this->db->execute(
                        'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                         VALUES (:id, :uid, :title, :msg, "security", 0, NOW())',
                        [
                            'id' => Security::generateUuid(),
                            'uid' => $user['id'],
                            'title' => $subject,
                            'msg' => "Your verification code is: {$otp}. Valid for 15 minutes.",
                        ]
                    );
                }
            } catch (Throwable) {
            }
        }

        // 2. Attempt authenticated SMTP dispatch via SmtpTransport (with connection-only fallback if primary socket fails)
        $activeHost = $host;
        try {
            if (!class_exists(\Hambak\Services\SmtpTransport::class)) {
                require_once __DIR__ . '/SmtpTransport.php';
            }
            $transport = new \Hambak\Services\SmtpTransport($host, $port, $encryption, $username, $password, 15);
            $res = $transport->send($fromEmail, $fromName, $cleanEmail, $subject, $htmlBody, $textBody, $replyTo, $envelopeFrom);

            if (empty($res['success'])) {
                $errLower = strtolower((string)($res['error'] ?? ''));
                $isConnectErr = str_contains($errLower, 'connection')
                    || str_contains($errLower, 'handshake')
                    || str_contains($errLower, 'starttls')
                    || str_contains($errLower, 'timed out');
                $fallbackHost = trim((string)($this->config['fallback_host'] ?? ''));
                $fallbackPort = (int)($this->config['fallback_port'] ?? 587);
                if ($isConnectErr && $fallbackHost !== '' && ($fallbackHost !== $host || $fallbackPort !== $port)) {
                    $fbEnc = $fallbackPort === 465 ? 'ssl' : 'tls';
                    $fbTransport = new \Hambak\Services\SmtpTransport($fallbackHost, $fallbackPort, $fbEnc, $username, $password, 15);
                    $fbRes = $fbTransport->send($fromEmail, $fromName, $cleanEmail, $subject, $htmlBody, $textBody, $replyTo, $envelopeFrom);
                    if (!empty($fbRes['success'])) {
                        $res = $fbRes;
                        $activeHost = $fallbackHost;
                        $port = $fallbackPort;
                        $encryption = $fbEnc;
                    }
                }
            }

            $deliverySuccess = !empty($res['success']);
            $messageId = (string)($res['messageId'] ?? '');
            foreach ((array)($res['transcript'] ?? []) as $tRow) {
                $entry = (string)($tRow['entry'] ?? '');
                if (preg_match('/^<\s*(250\s+OK.*)$/i', $entry, $m)) {
                    $smtpResponse = trim($m[1]);
                }
            }
            if ($smtpResponse === '' && !empty($res['transcript'])) {
                $last = end($res['transcript']);
                $smtpResponse = (string)($last['entry'] ?? '');
            }
            $deliveryMessage = $deliverySuccess
                ? "Email delivered via {$activeHost}:{$port} ({$encryption})"
                : (string)($res['error'] ?? 'SMTP delivery failed');
        } catch (Throwable $e) {
            $deliveryMessage = 'SMTP error: ' . $e->getMessage();
        }

        // 3. Log into email_logs table
        try {
            $this->db->execute(
                'INSERT INTO email_logs (id, recipient, subject, status, error, host, created_at)
                 VALUES (:id, :rec, :sub, :st, :err, :host, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'rec' => $cleanEmail,
                    'sub' => $subject,
                    'st' => $deliverySuccess ? 'sent' : 'failed',
                    'err' => $deliverySuccess ? null : $deliveryMessage,
                    'host' => $activeHost,
                ]
            );
        } catch (Throwable) {
        }

        // 4. Log audit event
        try {
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
                 VALUES (:id, NULL, :email, :act, :details, "127.0.0.1", NOW())',
                [
                    'id' => Security::generateUuid(),
                    'email' => $cleanEmail,
                    'act' => $auditAction,
                    'details' => json_encode([
                        'subject' => $subject,
                        'from_email' => $fromEmail,
                        'reply_to' => $replyTo,
                        'otp_dispatched' => !empty($otp),
                        'smtp_delivery' => $deliverySuccess,
                        'message_id' => $messageId,
                        'smtp_response' => $smtpResponse,
                        'message' => $deliveryMessage,
                    ]),
                ]
            );
        } catch (Throwable) {
        }

        return [
            'sent' => $deliverySuccess,
            'smtp_delivered' => $deliverySuccess,
            'message_id' => $messageId,
            'smtp_response' => $smtpResponse,
            'from_email' => $fromEmail,
            'from_name' => $fromName,
            'reply_to' => $replyTo,
            'message' => $deliverySuccess ? 'Email dispatched via authenticated SMTP relay.' : $deliveryMessage,
            'error' => $deliverySuccess ? null : $deliveryMessage,
            'channel' => 'email',
            'recipient' => $cleanEmail,
        ];
    }

    /**
     * Professional HTML Template for Password Reset OTP
     */
    private function buildOtpHtml(string $recipientName, string $otpCode, string $resetToken): string
    {
        $name = !empty($recipientName) ? htmlspecialchars($recipientName) : 'Valued Customer';
        $code = htmlspecialchars($otpCode);

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>HAMBAKTECH Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <tr>
            <td style="padding: 28px 32px; text-align: left; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%);">
                <div style="font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                    HAMBAK TECH &amp; SERVICES
                </div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #bfdbfe; margin-top: 4px; font-weight: 600;">
                    Where Technology Meets Services &bull; Account Security
                </div>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px;">
                <h1 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 0 0 12px 0;">
                    Password Reset Verification
                </h1>
                <p style="font-size: 14px; line-height: 22px; color: #334155; margin-top: 0;">
                    Hello <strong>{$name}</strong>,
                </p>
                <p style="font-size: 13px; line-height: 22px; color: #475569;">
                    We received a request to reset the password for your HAMBAKTECH account. Enter the 6-digit one-time verification code below on the password reset screen:
                </p>

                <div style="margin: 26px 0; text-align: center;">
                    <div style="display: inline-block; background-color: #eff6ff; border: 2px solid #2563eb; border-radius: 12px; padding: 14px 34px; letter-spacing: 8px; font-family: monospace; font-size: 30px; font-weight: 800; color: #1e40af;">
                        {$code}
                    </div>
                    <p style="font-size: 11px; color: #64748b; margin-top: 10px; margin-bottom: 0;">
                        This code expires in <strong>15 minutes</strong>.
                    </p>
                </div>

                <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; margin-top: 20px;">
                    <p style="font-size: 12px; color: #92400e; margin: 0; line-height: 18px;">
                        <strong>Security Reminder:</strong> Never share this code with anyone, including HAMBAKTECH staff.
                    </p>
                </div>

                <p style="font-size: 12px; color: #64748b; line-height: 18px; margin-top: 22px; margin-bottom: 0;">
                    Need assistance? Email <a href="mailto:support@hambaktech.com.ng" style="color: #1d4ed8; font-weight: 600;">support@hambaktech.com.ng</a> or call Customer Service on 09127469686.
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 18px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                <p style="font-size: 11px; color: #64748b; margin: 0;">
                    &copy; 2024–2026 HAMBAK TECH &amp; SERVICES (BN 9284726). All rights reserved.<br>
                    Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;
    }

    /**
     * Branded HTML Template for Registration Email Verification
     */
    private function buildEmailVerificationHtml(
        string $recipientEmail,
        string $recipientName,
        string $otpCode,
        string $verifyUrl,
        int $expiryMinutes = 60
    ): string {
        $name = !empty($recipientName) ? htmlspecialchars($recipientName, ENT_QUOTES, 'UTF-8') : 'Valued Customer';
        $code = htmlspecialchars($otpCode, ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($verifyUrl, ENT_QUOTES, 'UTF-8');

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Verify Your HAMBAKTECH Account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <tr>
            <td style="padding: 28px 32px; text-align: left; background: linear-gradient(135deg, #065f46 0%, #0284c7 100%);">
                <div style="font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                    HAMBAK TECH &amp; SERVICES
                </div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #d1fae5; margin-top: 4px; font-weight: 600;">
                    Email Verification &bull; Account Activation
                </div>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px;">
                <h1 style="color: #0f172a; font-size: 20px; font-weight: 800; margin: 0 0 12px 0;">
                    Confirm Your Email Address
                </h1>
                <p style="font-size: 14px; line-height: 22px; color: #334155; margin-top: 0;">
                    Hello <strong>{$name}</strong>,
                </p>
                <p style="font-size: 13px; line-height: 22px; color: #475569;">
                    Thank you for registering on HAMBAK TECH &amp; SERVICES. To activate wallet funding, identity verification, VTU services, and order submissions, please verify your email address using the button or 6-digit code below:
                </p>

                <div style="margin: 24px 0; text-align: center;">
                    <a href="{$safeUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-size: 14px; font-weight: 700;">
                        Verify Email Address
                    </a>
                </div>

                <div style="margin: 22px 0; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 8px; font-weight: 700;">
                        Or enter this 6-digit verification code
                    </div>
                    <div style="display: inline-block; background-color: #ecfdf5; border: 2px solid #10b981; border-radius: 12px; padding: 14px 34px; letter-spacing: 8px; font-family: monospace; font-size: 30px; font-weight: 800; color: #065f46;">
                        {$code}
                    </div>
                    <p style="font-size: 11px; color: #64748b; margin-top: 10px; margin-bottom: 0;">
                        This verification link and code expire in <strong>{$expiryMinutes} minutes</strong>.
                    </p>
                </div>

                <p style="font-size: 12px; color: #64748b; line-height: 18px; margin-top: 22px; margin-bottom: 0;">
                    Need assistance? Email <a href="mailto:support@hambaktech.com.ng" style="color: #059669; font-weight: 600;">support@hambaktech.com.ng</a> or call Customer Service on 09127469686.
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 18px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                <p style="font-size: 11px; color: #64748b; margin: 0;">
                    &copy; 2024–2026 HAMBAK TECH &amp; SERVICES (BN 9284726). All rights reserved.<br>
                    Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;
    }

    /**
     * Send secure one-time, expiring (48h) Academy Account Activation invitation email (no plaintext password).
     */
    public function sendAcademyAccountInvitation(
        string $recipientEmail,
        string $recipientName,
        string $applicationRef,
        string $courseTitle,
        string $rawToken,
        int $expiryHours = 48
    ): array {
        $cleanEmail = strtolower(trim($recipientEmail));
        $activationUrl = 'https://hambaktech.com.ng/?academy_activate=' . urlencode($rawToken) . '#academy';
        $safeName = htmlspecialchars($recipientName ?: 'Applicant', ENT_QUOTES, 'UTF-8');
        $safeRef = htmlspecialchars($applicationRef, ENT_QUOTES, 'UTF-8');
        $safeCourse = htmlspecialchars($courseTitle, ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($activationUrl, ENT_QUOTES, 'UTF-8');

        $html = <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Activate Your HAMBAKTECH Academy Applicant Account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%);">
                <div style="font-size: 18px; font-weight: 800; color: #ffffff;">HAMBAK TECH &amp; SERVICES DIGITAL TRAINING ACADEMY</div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #bfdbfe; margin-top: 4px; font-weight: 600;">Application Received &bull; Account Activation Invitation</div>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px;">
                <p style="font-size: 14px; line-height: 22px; color: #334155; margin-top: 0;">Hello <strong>{$safeName}</strong>,</p>
                <p style="font-size: 13px; line-height: 22px; color: #475569;">
                    Your training application for <strong>{$safeCourse}</strong> has been received and logged under reference <strong>{$safeRef}</strong>.
                </p>
                <p style="font-size: 13px; line-height: 22px; color: #475569;">
                    To set your own password, activate your HAMBAKTECH portal account, track your admission review progress, and respond to any document requests, use the secure activation link below:
                </p>
                <div style="margin: 24px 0; text-align: center;">
                    <a href="{$safeUrl}" style="display: inline-block; background-color: #1d4ed8; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-size: 14px; font-weight: 700;">
                        Activate Portal Account &amp; Set Password
                    </a>
                </div>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-top: 16px;">
                    <p style="font-size: 12px; color: #475569; margin: 0; line-height: 18px;">
                        <strong>Security Notice:</strong> This single-use activation link expires in <strong>{$expiryHours} hours</strong>. No temporary password is ever sent by email — you will choose your own private password during activation.
                    </p>
                </div>
            </td>
        </tr>
        <tr>
            <td style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                <p style="font-size: 11px; color: #64748b; margin: 0;">&copy; 2024–2026 HAMBAK TECH &amp; SERVICES (BN 9284726). Where Technology Meets Services.</p>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;

        return $this->send(
            $cleanEmail,
            $recipientName ?: 'Applicant',
            "[HAMBAKTECH Academy] Activate Your Account — Ref: {$applicationRef}",
            $html
        );
    }

    /**
     * Send Academy Admission Workflow Update Email
     */
    public function sendAcademyApplicationStatusEmail(
        string $recipientEmail,
        string $recipientName,
        string $applicationRef,
        string $courseTitle,
        string $newStatus,
        string $detailsMessage = '',
        ?string $studentId = null
    ): array {
        $cleanEmail = strtolower(trim($recipientEmail));
        $safeName = htmlspecialchars($recipientName ?: 'Applicant', ENT_QUOTES, 'UTF-8');
        $safeRef = htmlspecialchars($applicationRef, ENT_QUOTES, 'UTF-8');
        $safeCourse = htmlspecialchars($courseTitle, ENT_QUOTES, 'UTF-8');
        $safeMsg = nl2br(htmlspecialchars($detailsMessage, ENT_QUOTES, 'UTF-8'));
        $statusLabel = match ($newStatus) {
            'under_review' => 'Under Admissions Review',
            'information_requested' => 'Additional Information Requested',
            'approved' => 'Admission Approved (Pending Enrollment)',
            'enrolled' => 'Officially Enrolled',
            'rejected' => 'Application Decision: Not Approved',
            'withdrawn' => 'Application / Enrollment Withdrawn',
            default => ucwords(str_replace('_', ' ', $newStatus)),
        };
        $safeLabel = htmlspecialchars($statusLabel, ENT_QUOTES, 'UTF-8');
        $studentBlock = $studentId
            ? '<p style="font-size:13px;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;padding:12px;border-radius:8px;"><strong>Official Student ID:</strong> ' . htmlspecialchars($studentId, ENT_QUOTES, 'UTF-8') . '</p>'
            : '';

        $html = <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>HAMBAKTECH Academy Application Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #065f46 0%, #0284c7 100%); color: #ffffff;">
                <div style="font-size: 17px; font-weight: 800;">HAMBAK TECH &amp; SERVICES DIGITAL TRAINING ACADEMY</div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #d1fae5; margin-top: 4px;">Admission Status Update &bull; {$safeRef}</div>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px;">
                <p style="font-size: 14px; color: #334155; margin-top: 0;">Hello <strong>{$safeName}</strong>,</p>
                <p style="font-size: 13px; line-height: 22px; color: #475569;">
                    There is an update on your application for <strong>{$safeCourse}</strong> (Reference: <strong>{$safeRef}</strong>):
                </p>
                <div style="margin: 18px 0; padding: 14px 18px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #1d4ed8; font-weight: 700;">Current Status</div>
                    <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px;">{$safeLabel}</div>
                </div>
                {$studentBlock}
                <p style="font-size: 13px; line-height: 22px; color: #334155;">{$safeMsg}</p>
                <div style="margin: 24px 0;">
                    <a href="https://hambaktech.com.ng/#academy" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 13px; font-weight: 700;">
                        View Application in Portal
                    </a>
                </div>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;

        return $this->send(
            $cleanEmail,
            $recipientName ?: 'Applicant',
            "[HAMBAKTECH Academy] {$statusLabel} — {$applicationRef}",
            $html
        );
    }
}

