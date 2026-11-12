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
     */
    public function send(string $toEmail, string $toName, string $subject, string $htmlBody, ?string $otp = null): array
    {
        $cleanEmail = strtolower(trim($toEmail));
        $host = (string)($this->config['host'] ?? 'mail.hambaktech.com.ng');
        $port = (int)($this->config['port'] ?? 465);
        $encryption = (string)($this->config['encryption'] ?? ($port === 465 ? 'ssl' : 'tls'));
        $username = (string)($this->config['user'] ?? '');
        $password = (string)($this->config['password'] ?? '');
        $fromEmail = (string)($this->config['from_email'] ?? 'support@hambaktech.com.ng');
        $fromName = (string)($this->config['from_name'] ?? 'HambakTech Support');
        $replyTo = (string)($this->config['reply_to'] ?? $fromEmail);

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
            $res = $transport->send($fromEmail, $fromName, $cleanEmail, $subject, $htmlBody, '', $replyTo);
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
                    'act' => $otp ? 'OTP_DISPATCHED' : 'EMAIL_DISPATCHED',
                    'details' => json_encode([
                        'subject' => $subject,
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
    <title>HambakTech Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden;">
        <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #1e293b; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);">
                <div style="display: inline-block; padding: 8px 16px; background-color: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 20px; color: #818cf8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
                    Account Security &bull; Verification
                </div>
                <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">
                    Password Reset Verification
                </h1>
            </td>
        </tr>
        <tr>
            <td style="padding: 32px;">
                <p style="font-size: 14px; line-height: 22px; color: #cbd5e1; margin-top: 0;">
                    Hello <strong>{$name}</strong>,
                </p>
                <p style="font-size: 13px; line-height: 22px; color: #94a3b8;">
                    We received a request to reset the password for your HambakTech account. Enter the 6-digit one-time verification code below on the password reset screen:
                </p>
                
                <div style="margin: 28px 0; text-align: center;">
                    <div style="display: inline-block; background-color: #020617; border: 2px solid #4f46e5; border-radius: 12px; padding: 16px 36px; letter-spacing: 8px; font-family: monospace; font-size: 32px; font-weight: 800; color: #38bdf8;">
                        {$code}
                    </div>
                    <p style="font-size: 11px; color: #64748b; margin-top: 10px; margin-bottom: 0;">
                        This code will expire in <strong>15 minutes</strong>.
                    </p>
                </div>

                <div style="background-color: #020617; border: 1px solid #1e293b; border-radius: 10px; padding: 14px; margin-top: 24px;">
                    <p style="font-size: 11px; color: #f59e0b; margin: 0; line-height: 18px;">
                        <strong>Security Reminder:</strong> Never share this code with anyone, including HambakTech staff. We will never ask for your password or verification code.
                    </p>
                </div>

                <p style="font-size: 12px; color: #64748b; line-height: 18px; margin-top: 24px; margin-bottom: 0;">
                    If you did not request this password reset, your account is still secure. You can safely disregard this message or contact enterprise support immediately.
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 20px 32px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                <p style="font-size: 11px; color: #475569; margin: 0;">
                    &copy; 2026 HambakTech Enterprise Portal. All rights reserved.<br>
                    Plot 14 Commercial Avenue, Ikeja, Lagos, Nigeria.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;
    }
}
