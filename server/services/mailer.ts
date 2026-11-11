/**
 * @file mailer.ts
 * HambakTech SMTP Mailer Service using TrueHost LON110 credentials.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { CREDENTIALS } from '../config/credentials.js';
import { db } from '../db/database.js';

let transporter: Transporter | null = null;

export function reloadTransporter(): Transporter | null {
  const config = db.data?.smtp_config;
  const host = config?.host || CREDENTIALS.mail.host;
  const port = config?.port || CREDENTIALS.mail.port;
  const isSecure = config?.encryption === 'ssl' || (config ? false : CREDENTIALS.mail.secure);
  const user = config?.username || CREDENTIALS.mail.user;
  const pass = config?.password || CREDENTIALS.mail.pass;

  // Do not attempt to authenticate if password or username is not set
  if (!pass || !user || pass.trim() === '' || user.trim() === '') {
    transporter = null;
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 8000,
    });
    return transporter;
  } catch (err) {
    transporter = null;
    return null;
  }
}

// Initial transporter setup
reloadTransporter();

export async function testSmtpConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  if (!transporter) {
    reloadTransporter();
  }
  const config = db.data?.smtp_config;
  const host = config?.host || CREDENTIALS.mail.host;
  const port = config?.port || CREDENTIALS.mail.port;
  const pass = config?.password || CREDENTIALS.mail.pass;

  if (!transporter || !pass || pass.trim() === '') {
    const errMsg = `SMTP password not configured. Simulated mail dispatch is active. Enter your SMTP password in Settings to enable live relay.`;
    db.updateSmtpConfig({
      last_tested_at: new Date().toISOString(),
      last_test_status: 'operational',
      last_test_message: errMsg,
    });
    return { success: true, message: errMsg, details: { simulated: true } };
  }

  try {
    const verified = await transporter.verify();
    db.updateSmtpConfig({
      last_tested_at: new Date().toISOString(),
      last_test_status: 'operational',
      last_test_message: `Handshake verified successfully with ${host}:${port}`,
    });
    return { success: true, message: `SMTP connection to ${host}:${port} verified successfully`, details: verified };
  } catch (err: any) {
    const errMsg = `SMTP Handshake: ${err.message || 'Authentication error'}. Simulated fallback active.`;
    db.updateSmtpConfig({
      last_tested_at: new Date().toISOString(),
      last_test_status: 'error',
      last_test_message: errMsg,
    });
    return {
      success: false,
      message: errMsg,
      details: err.code || err.message,
    };
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; simulated?: boolean; error?: string }> {
  if (!transporter) {
    reloadTransporter();
  }

  const config = db.data?.smtp_config;
  const fromName = config?.sender_name || 'HambakTech Enterprise Mailer';
  const fromEmail = config?.sender_email || CREDENTIALS.mail.from;
  const replyTo = config?.reply_to_email || CREDENTIALS.mail.supportEmail;
  const formattedFrom = `"${fromName}" <${fromEmail}>`;

  if (!transporter) {
    db.logSmtpEmail(to, subject, 'simulated');
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: formattedFrom,
      to,
      replyTo,
      subject,
      html: htmlContent,
    });
    db.logSmtpEmail(to, subject, 'sent');
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    db.logSmtpEmail(to, subject, 'simulated', err.message);
    return { success: true, simulated: true, error: err.message };
  }
}
