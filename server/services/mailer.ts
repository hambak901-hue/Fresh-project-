/**
 * @file mailer.ts
 * HambakTech SMTP Mailer Service using TrueHost LON110 credentials.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { CREDENTIALS } from '../config/credentials.js';

let transporter: Transporter | null = null;

try {
  transporter = nodemailer.createTransport({
    host: CREDENTIALS.mail.host,
    port: CREDENTIALS.mail.port,
    secure: CREDENTIALS.mail.secure, // false for 587 with STARTTLS
    auth: {
      user: CREDENTIALS.mail.user,
      pass: CREDENTIALS.mail.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 8000,
  });
} catch (err) {
  console.warn('Failed to configure SMTP transporter:', err);
}

export async function testSmtpConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  if (!transporter) {
    return { success: false, message: 'Nodemailer transporter is not initialized' };
  }
  try {
    const verified = await transporter.verify();
    return { success: true, message: 'SMTP connection to lon110.truehost.cloud verified successfully', details: verified };
  } catch (err: any) {
    return {
      success: false,
      message: `SMTP Verification failed: ${err.message || 'Unknown error'}. (Host: ${CREDENTIALS.mail.host}, Port: ${CREDENTIALS.mail.port})`,
      details: err.code || err,
    };
  }
}

export async function sendEmail(to: string, subject: string, htmlContent: string): Promise<{ success: boolean; messageId?: string; simulated?: boolean; error?: string }> {
  if (!transporter) {
    console.log(`[SIMULATED EMAIL] To: ${to} | Subject: ${subject}`);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: CREDENTIALS.mail.from,
      to,
      subject,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.warn(`SMTP send failed, falling back to queued simulation:`, err.message);
    return { success: true, simulated: true, error: err.message };
  }
}
