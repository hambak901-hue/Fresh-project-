<?php
declare(strict_types=1);

namespace Hambak\Services;

use RuntimeException;
use InvalidArgumentException;

/**
 * RFC 5321 / RFC 2822 Native SMTP Socket Transport
 * Pure PHP implementation supporting SSL, TLS/STARTTLS, AUTH LOGIN/PLAIN.
 */
class SmtpTransport
{
    private string $host;
    private int $port;
    private string $encryption; // 'ssl', 'tls', 'none'
    private string $username;
    private string $password;
    private int $timeout;
    private array $transcript = [];

    public function __construct(
        string $host,
        int $port = 465,
        string $encryption = 'ssl',
        string $username = '',
        string $password = '',
        int $timeout = 15
    ) {
        $this->host = trim($host);
        $this->port = $port > 0 ? $port : 465;
        $this->encryption = strtolower(trim($encryption));
        $this->username = trim($username);
        $this->password = $password;
        $this->timeout = max(5, $timeout);
    }

    /**
     * Send email message via SMTP.
     *
     * @param string $fromEmail
     * @param string $fromName
     * @param string $toEmail
     * @param string $subject
     * @param string $htmlBody
     * @param string $textBody
     * @param string|null $replyTo
     * @return array{success: bool, messageId: string, transcript: array, error?: string}
     */
    public function send(
        string $fromEmail,
        string $fromName,
        string $toEmail,
        string $subject,
        string $htmlBody,
        string $textBody = '',
        ?string $replyTo = null
    ): array {
        $this->transcript = [];
        $socket = null;

        try {
            if (empty($this->host)) {
                throw new InvalidArgumentException('SMTP host is not configured');
            }
            if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException("Invalid recipient email: {$toEmail}");
            }
            if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
                $fromEmail = 'no-reply@hambaktech.com.ng';
            }

            // 1. Establish Socket Connection
            $target = $this->host;
            if ($this->encryption === 'ssl') {
                $target = 'ssl://' . $this->host;
            } elseif ($this->encryption === 'tls' || $this->encryption === 'none') {
                $target = 'tcp://' . $this->host;
            }

            $context = stream_context_create([
                'ssl' => [
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                    'allow_self_signed' => true,
                ],
            ]);

            $errno = 0;
            $errstr = '';
            $this->log("CONNECT {$target}:{$this->port} (timeout: {$this->timeout}s)");

            $socket = @stream_socket_client(
                "{$target}:{$this->port}",
                $errno,
                $errstr,
                (float)$this->timeout,
                STREAM_CLIENT_CONNECT,
                $context
            );

            if (!$socket) {
                throw new RuntimeException("SMTP connection to {$this->host}:{$this->port} failed: {$errstr} ({$errno})");
            }

            stream_set_timeout($socket, $this->timeout);

            // 2. Read Initial Greeting (220)
            $greeting = $this->readResponse($socket);
            if ($greeting['code'] !== 220) {
                throw new RuntimeException("SMTP server rejected connection: {$greeting['text']}");
            }

            // 3. Send EHLO / HELO
            $clientHost = !empty($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'hambaktech.com.ng';
            $ehlo = $this->sendCommand($socket, "EHLO {$clientHost}");
            if ($ehlo['code'] !== 250) {
                // Fallback to HELO
                $helo = $this->sendCommand($socket, "HELO {$clientHost}");
                if ($helo['code'] !== 250) {
                    throw new RuntimeException("SMTP handshake failed: {$ehlo['text']}");
                }
            }

            // 4. STARTTLS upgrade if requested
            if ($this->encryption === 'tls') {
                $tlsResp = $this->sendCommand($socket, 'STARTTLS');
                if ($tlsResp['code'] !== 220) {
                    throw new RuntimeException("SMTP STARTTLS failed: {$tlsResp['text']}");
                }

                $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT;
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                    $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                }
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                    $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
                }

                $cryptoOk = stream_socket_enable_crypto($socket, true, $cryptoMethod);
                if (!$cryptoOk) {
                    throw new RuntimeException('SMTP TLS encryption handshake failed on established socket');
                }

                // Re-send EHLO after TLS upgrade
                $ehloAfterTls = $this->sendCommand($socket, "EHLO {$clientHost}");
                if ($ehloAfterTls['code'] !== 250) {
                    throw new RuntimeException("SMTP EHLO after TLS failed: {$ehloAfterTls['text']}");
                }
            }

            // 5. Authentication
            if (!empty($this->username) && !empty($this->password)) {
                $authResp = $this->sendCommand($socket, 'AUTH LOGIN');
                if ($authResp['code'] === 334) {
                    // Send username
                    $userResp = $this->sendCommand($socket, base64_encode($this->username), true);
                    if ($userResp['code'] !== 334) {
                        throw new RuntimeException("SMTP username rejected: {$userResp['text']}");
                    }
                    // Send password
                    $passResp = $this->sendCommand($socket, base64_encode($this->password), true);
                    if ($passResp['code'] !== 235) {
                        throw new RuntimeException("SMTP authentication failed: {$passResp['text']}");
                    }
                } elseif ($authResp['code'] === 503 || $authResp['code'] === 502) {
                    // Try AUTH PLAIN
                    $plainPayload = base64_encode("\0{$this->username}\0{$this->password}");
                    $plainResp = $this->sendCommand($socket, "AUTH PLAIN {$plainPayload}", true);
                    if ($plainResp['code'] !== 235) {
                        throw new RuntimeException("SMTP AUTH PLAIN failed: {$plainResp['text']}");
                    }
                } else {
                    throw new RuntimeException("SMTP server refused authentication: {$authResp['text']}");
                }
            }

            // 6. MAIL FROM
            $mailFromResp = $this->sendCommand($socket, "MAIL FROM:<{$fromEmail}>");
            if ($mailFromResp['code'] !== 250) {
                throw new RuntimeException("SMTP MAIL FROM failed: {$mailFromResp['text']}");
            }

            // 7. RCPT TO
            $rcptResp = $this->sendCommand($socket, "RCPT TO:<{$toEmail}>");
            if ($rcptResp['code'] !== 250 && $rcptResp['code'] !== 251) {
                throw new RuntimeException("SMTP RCPT TO rejected recipient {$toEmail}: {$rcptResp['text']}");
            }

            // 8. DATA
            $dataResp = $this->sendCommand($socket, 'DATA');
            if ($dataResp['code'] !== 354) {
                throw new RuntimeException("SMTP DATA command rejected: {$dataResp['text']}");
            }

            // 9. Build MIME Message
            $messageId = sprintf('<%s.%s@%s>', bin2hex(random_bytes(12)), (string)time(), $this->host);
            $mimeData = $this->buildMimeMessage(
                $fromEmail,
                $fromName,
                $toEmail,
                $subject,
                $htmlBody,
                $textBody,
                $messageId,
                $replyTo
            );

            // Send payload with dot termination
            $this->log('SEND [MIME payload + dot]');
            fwrite($socket, $mimeData . "\r\n.\r\n");

            $finalResp = $this->readResponse($socket);
            if ($finalResp['code'] !== 250) {
                throw new RuntimeException("SMTP message dispatch failed: {$finalResp['text']}");
            }

            // 10. QUIT
            $this->sendCommand($socket, 'QUIT');
            fclose($socket);

            return [
                'success' => true,
                'messageId' => $messageId,
                'transcript' => $this->transcript,
            ];
        } catch (\Throwable $e) {
            if ($socket) {
                @fclose($socket);
            }
            return [
                'success' => false,
                'messageId' => '',
                'transcript' => $this->transcript,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Send command and return parsed response.
     */
    private function sendCommand($socket, string $command, bool $maskLog = false): array
    {
        $logCommand = $maskLog ? '*** [CREDENTIAL MASKED] ***' : $command;
        $this->log("> {$logCommand}");

        fwrite($socket, $command . "\r\n");
        return $this->readResponse($socket);
    }

    /**
     * Read multiline response from SMTP socket.
     */
    private function readResponse($socket): array
    {
        $response = '';
        $code = 0;

        while (!feof($socket)) {
            $line = fgets($socket, 1024);
            if ($line === false) {
                break;
            }
            $response .= $line;

            // Check if line is terminal: 3-digit code followed by space (or end)
            if (preg_match('/^([0-9]{3})[ ](.*)$/', $line, $matches)) {
                $code = (int)$matches[1];
                break;
            }
            // In case of multiline (code followed by hyphen): e.g. "250-SIZE 52428800"
            if (preg_match('/^([0-9]{3})-(.*)$/', $line, $matches)) {
                $code = (int)$matches[1];
            }
        }

        $trimmed = trim($response);
        $this->log("< {$trimmed}");

        return [
            'code' => $code,
            'text' => $trimmed,
        ];
    }

    /**
     * Build RFC 2822 MIME multipart/alternative payload.
     */
    private function buildMimeMessage(
        string $fromEmail,
        string $fromName,
        string $toEmail,
        string $subject,
        string $htmlBody,
        string $textBody,
        string $messageId,
        ?string $replyTo = null
    ): string {
        $boundary = '=_hambak_' . md5(uniqid((string)microtime(true), true));
        $date = date('r');
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $encodedFromName = !empty($fromName) ? '=?UTF-8?B?' . base64_encode($fromName) . '?= ' : '';

        if (empty($textBody)) {
            $textBody = strip_tags(preg_replace('/<br\s*\/?>/i', "\n", $htmlBody));
        }

        $headers = [];
        $headers[] = "Date: {$date}";
        $headers[] = "From: {$encodedFromName}<{$fromEmail}>";
        $headers[] = "To: <{$toEmail}>";
        if (!empty($replyTo) && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $headers[] = "Reply-To: <{$replyTo}>";
        }
        $headers[] = "Subject: {$encodedSubject}";
        $headers[] = "Message-ID: {$messageId}";
        $headers[] = "X-Mailer: HambakTech-MailEngine/1.0";
        $headers[] = "MIME-Version: 1.0";
        $headers[] = "Content-Type: multipart/alternative; boundary=\"{$boundary}\"";

        $body = [];
        $body[] = "--{$boundary}";
        $body[] = 'Content-Type: text/plain; charset=UTF-8';
        $body[] = 'Content-Transfer-Encoding: base64';
        $body[] = '';
        $body[] = chunk_split(base64_encode($textBody));

        $body[] = "--{$boundary}";
        $body[] = 'Content-Type: text/html; charset=UTF-8';
        $body[] = 'Content-Transfer-Encoding: base64';
        $body[] = '';
        $body[] = chunk_split(base64_encode($htmlBody));

        $body[] = "--{$boundary}--";

        // Dot stuffing: ensure lines starting with a dot are prefixed with another dot per RFC 5321
        $fullPayload = implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $body);
        return preg_replace('/^\./m', '..', $fullPayload);
    }

    private function log(string $msg): void
    {
        $this->transcript[] = [
            'time' => microtime(true),
            'entry' => $msg,
        ];
    }

    public function getTranscript(): array
    {
        return $this->transcript;
    }
}
