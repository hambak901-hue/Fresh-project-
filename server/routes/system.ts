/**
 * @file system.ts
 * System diagnostics, integration status, and settings router.
 * Administrative endpoints are strictly protected with requireAdmin.
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';
import { testSmtpConnection, sendEmail } from '../services/mailer.js';
import { parseToken } from './auth.js';

export const systemRouter = Router();

// Middleware: Require Admin or SuperAdmin
function requireAdmin(req: any, res: any, next: any) {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account is suspended.' });
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required' });
  }

  req.user = user;
  next();
}

// -------------------------------------------------------------
// PUBLIC ENDPOINTS
// -------------------------------------------------------------

// GET /api/system/rates - Public rates & pricing for calculators
systemRouter.get('/rates', (req, res) => {
  res.json({
    success: true,
    rates: {
      nin_fee: db.data.settings.nin_fee,
      bvn_fee: db.data.settings.bvn_fee,
      mtn_sme_1gb: db.data.settings.mtn_sme_1gb,
      airtel_1gb: db.data.settings.airtel_1gb,
      glo_1gb: db.data.settings.glo_1gb,
      nine_mobile_1gb: db.data.settings.nine_mobile_1gb,
      airtime_discount_percent: db.data.settings.airtime_discount_percent,
    },
  });
});

// -------------------------------------------------------------
// ADMINISTRATOR-ONLY ENDPOINTS
// -------------------------------------------------------------

// GET /api/system/status - Public health & operational status without infrastructure leaks
systemRouter.get('/status', (req: any, res) => {
  res.json({
    status: 'success',
    data: {
      service: 'HambakTech Enterprise Production Backend',
      status: 'ONLINE',
      uptime: '99.98%',
      deployment: 'Enterprise Cloud Native',
      timestamp: new Date().toISOString(),
    },
  });
});

// POST /api/system/test-smtp (Admin only)
systemRouter.post('/test-smtp', requireAdmin, async (req: any, res) => {
  const { toEmail } = req.body;
  const target = toEmail || CREDENTIALS.mail.supportEmail;

  const testResult = await testSmtpConnection();
  let sendResult = null;

  if (testResult.success) {
    sendResult = await sendEmail(
      target,
      'HambakTech Production SMTP Connectivity Test',
      `<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #059669;">HambakTech Mail Gateway Verified</h2>
        <p>This email confirms that the production SMTP credentials are properly connected and authorized.</p>
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

// GET /api/system/audit-logs (Admin only)
systemRouter.get('/audit-logs', requireAdmin, (req: any, res) => {
  res.json({
    logs: db.data.audit_logs.slice(0, 50),
  });
});

// POST /api/system/update-settings (Admin only)
systemRouter.post('/update-settings', requireAdmin, (req: any, res) => {
  const updated = db.updateSettings(req.body);
  db.logAudit('SETTINGS_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, settings: updated });
});
