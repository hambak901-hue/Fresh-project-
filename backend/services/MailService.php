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
    private Database $db;
    private array $config;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $baseCfg = [];
        $cfgFile = dirname(__DIR__) . '/config/config.php';
        if (file_exists($cfgFile)) {
            $baseCfg = require $cfgFile;
        }
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
     * Send OTP Verification Email
     */
    public function sendPasswordResetOtp(string $recipientEmail, string $recipientName, string $otpCode, string $resetToken): array
    {
        $subject = 'Your HambakTech Verification Code: ' . $otpCode;
        $html = $this->buildOtpHtml($recipientName, $otpCode, $resetToken);
        return $this->send($recipientEmail, $recipientName, $subject, $html, $otpCode);
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

        // 1. Log in internal notifications table if user exists and OTP is set
        if ($otp) {
            try {
                $user = $this->db->fetchOne('SELECT id FROM users WHERE email = :email', ['email' => $cleanEmail]);
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

        // 2. Attempt authenticated SMTP dispatch via SmtpTransport
        try {
            if (!class_exists(\Hambak\Services\SmtpTransport::class)) {
                require_once __DIR__ . '/SmtpTransport.php';
            }
            $transport = new \Hambak\Services\SmtpTransport($host, $port, $encryption, $username, $password, 15);
            $res = $transport->send($fromEmail, $fromName, $cleanEmail, $subject, $htmlBody, $textBody, $replyTo, $envelopeFrom);
            $deliverySuccess = !empty($res['success']);
            $messageId = (string)($res['messageId'] ?? '');
            $deliveryMessage = $deliverySuccess
                ? "Email delivered via {$host}:{$port} ({$encryption})"
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
                    'host' => $host,
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
}
