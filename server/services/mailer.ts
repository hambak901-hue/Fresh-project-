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
    console.warn('Failed to configure SMTP transporter:', err);
    return null;
  }
}

// Initial transporter setup
reloadTransporter();

export async function testSmtpConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  if (!transporter) {
    reloadTransporter();
  }
  if (!transporter) {
    return { success: false, message: 'Nodemailer transporter could not be initialized' };
  }
  const config = db.data?.smtp_config;
  const host = config?.host || CREDENTIALS.mail.host;
  const port = config?.port || CREDENTIALS.mail.port;

  try {
    const verified = await transporter.verify();
    db.updateSmtpConfig({
      last_tested_at: new Date().toISOString(),
      last_test_status: 'operational',
      last_test_message: `Handshake verified successfully with ${host}:${port}`,
    });
    return { success: true, message: `SMTP connection to ${host}:${port} verified successfully`, details: verified };
  } catch (err: any) {
    const errMsg = `SMTP Handshake failed: ${err.message || 'Unknown error'}. (Host: ${host}, Port: ${port})`;
    db.updateSmtpConfig({
      last_tested_at: new Date().toISOString(),
      last_test_status: 'error',
      last_test_message: errMsg,
    });
    return {
      success: false,
      message: errMsg,
      details: err.code || err,
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
    console.log(`[SIMULATED EMAIL] To: ${to} | Subject: ${subject}`);
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
    console.warn(`SMTP send failed, logged as simulated:`, err.message);
    db.logSmtpEmail(to, subject, 'simulated', err.message);
    return { success: true, simulated: true, error: err.message };
  }
}
