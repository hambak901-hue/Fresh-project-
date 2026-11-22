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
  htmlContent: string,
  options?: { text?: string; replyTo?: string }
): Promise<{ success: boolean; messageId?: string; simulated?: boolean; error?: string }> {
  if (!transporter) {
    reloadTransporter();
  }

  const config = db.data?.smtp_config;
  const fromName = String(config?.sender_name || 'HambakTech Support').replace(/[\r\n"]/g, '');
  const rawFrom = String(config?.sender_email || CREDENTIALS.mail.from || 'support@hambaktech.com.ng').trim();
  const angleMatch = rawFrom.match(/<([^>]+)>/);
  const fromEmail = (angleMatch ? angleMatch[1] : rawFrom).trim() || 'support@hambaktech.com.ng';
  const replyTo = options?.replyTo || config?.reply_to_email || CREDENTIALS.mail.supportEmail;
  const formattedFrom = `"${fromName}" <${fromEmail}>`;

  if (!transporter) {
    db.logSmtpEmail(to, subject, 'simulated', 'SMTP password not configured');
    return { success: false, simulated: true, error: 'SMTP credentials not configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: formattedFrom,
      to,
      replyTo,
      subject,
      text: options?.text,
      html: htmlContent,
    });
    db.logSmtpEmail(to, subject, 'sent');
    return { success: true, simulated: false, messageId: info.messageId };
  } catch (err: any) {
    db.logSmtpEmail(to, subject, 'failed', err.message);
    return { success: false, simulated: false, error: err.message };
  }
}
