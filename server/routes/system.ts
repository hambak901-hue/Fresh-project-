/**
 * @file system.ts
 * System diagnostics, integration status, and settings router.
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';
import { testSmtpConnection, sendEmail } from '../services/mailer.js';

export const systemRouter = Router();

// GET /api/system/status
systemRouter.get('/status', async (req, res) => {
  const credentialsStatus = {
    veripine: {
      configured: Boolean(CREDENTIALS.verification.veripine.apiKey),
      keyMasked: CREDENTIALS.verification.veripine.apiKey.slice(0, 10) + '...' + CREDENTIALS.verification.veripine.apiKey.slice(-6),
    },
    sureverify: {
      configured: Boolean(CREDENTIALS.verification.sureverify.apiKey),
      keyMasked: CREDENTIALS.verification.sureverify.apiKey.slice(0, 8) + '...' + CREDENTIALS.verification.sureverify.apiKey.slice(-6),
    },
    ulamaData: {
      configured: Boolean(CREDENTIALS.telecom.ulamaData.apiKey),
      keyMasked: CREDENTIALS.telecom.ulamaData.apiKey.slice(0, 8) + '...' + CREDENTIALS.telecom.ulamaData.apiKey.slice(-6),
    },
    vtpass: {
      configured: Boolean(CREDENTIALS.telecom.vtpass.apiKey && CREDENTIALS.telecom.vtpass.secretKey),
      apiKeyMasked: CREDENTIALS.telecom.vtpass.apiKey.slice(0, 8) + '...',
      publicKeyMasked: CREDENTIALS.telecom.vtpass.publicKey.slice(0, 8) + '...',
      secretKeyMasked: CREDENTIALS.telecom.vtpass.secretKey.slice(0, 8) + '...',
    },
    flutterwave: {
      configured: Boolean(CREDENTIALS.payments.flutterwave.clientId && CREDENTIALS.payments.flutterwave.secretKey),
      clientIdMasked: CREDENTIALS.payments.flutterwave.clientId.slice(0, 8) + '...',
      secretKeyMasked: CREDENTIALS.payments.flutterwave.secretKey.slice(0, 8) + '...',
      encryptionKeyConfigured: Boolean(CREDENTIALS.payments.flutterwave.encryptionKey),
    },
    smtpMail: {
      configured: Boolean(CREDENTIALS.mail.host && CREDENTIALS.mail.user),
      host: CREDENTIALS.mail.host,
      port: CREDENTIALS.mail.port,
      user: CREDENTIALS.mail.user,
      supportEmail: CREDENTIALS.mail.supportEmail,
      webmailUrl: CREDENTIALS.mail.webmailUrl,
    },
    cpanel: {
      serverName: CREDENTIALS.cpanel.serverName,
      serverIp: CREDENTIALS.cpanel.serverIp,
      sftpHost: CREDENTIALS.cpanel.ftpHost,
      sftpPort: CREDENTIALS.cpanel.ftpPort,
      sftpUser: CREDENTIALS.cpanel.ftpUser,
      sftpPassConfigured: Boolean(CREDENTIALS.cpanel.ftpPass),
      nameservers: CREDENTIALS.cpanel.nameservers,
    },
  };

  const stats = {
    totalUsers: db.data.users.length,
    totalTransactions: db.data.transactions.length,
    totalVerifications: db.data.verifications.length,
    totalOrders: db.data.telecom_orders.length,
    activeSettings: db.data.settings,
  };

  res.json({
    status: 'ONLINE',
    phase: '01 Project Foundation and Architecture',
    credentials: credentialsStatus,
    stats,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/system/test-smtp
systemRouter.post('/test-smtp', async (req, res) => {
  const { toEmail } = req.body;
  const target = toEmail || CREDENTIALS.mail.supportEmail;

  const testResult = await testSmtpConnection();
  let sendResult = null;

  if (testResult.success) {
    sendResult = await sendEmail(
      target,
      'HambakTech LON110 SMTP Connectivity Test',
      `<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #059669;">HambakTech Mail Gateway Verified</h2>
        <p>This email confirms that the SMTP credentials on <strong>lon110.truehost.cloud</strong> are properly connected and authorized.</p>
        <p>Sender: <code>${CREDENTIALS.mail.user}</code></p>
        <p>Target: <code>${target}</code></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
        <small style="color: #64748b;">HambakTech Enterprise Systems &bull; Phase 01 Architecture</small>
      </div>`
    );
  }

  res.json({
    connectionCheck: testResult,
    dispatchCheck: sendResult,
  });
});

// GET /api/system/audit-logs
systemRouter.get('/audit-logs', (req, res) => {
  res.json({
    logs: db.data.audit_logs.slice(0, 50),
  });
});

// POST /api/system/update-settings
systemRouter.post('/update-settings', (req, res) => {
  const updated = db.updateSettings(req.body);
  db.logAudit('SETTINGS_UPDATED', req.body);
  res.json({ success: true, settings: updated });
});
