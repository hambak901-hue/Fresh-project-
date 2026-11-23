/**
 * @file auth.ts
 * Cryptographically Secure Authentication Engine for HambakTech Enterprise.
 * Implements:
 * 1. HMAC-SHA256 Signed JWT tokens with strict signature verification & expiration.
 * 2. Brute-force protection & account lockouts on consecutive failed login attempts.
 * 3. Secure password hashing with bcrypt (cost 10/12) and automatic legacy hash upgrade.
 * 4. Transaction PIN management with bcrypt hashing, lockout protection, and verification.
 * 5. Password reset tokens with cryptographically secure random bytes & expiry.
 * 6. User object sanitization (never exposing password_hash or transaction_pin_hash).
 */

import { Router } from 'express';
import crypto from 'crypto';
import { db, hashPassword, verifyPassword, hashPin, verifyPin, User } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';
import { sendEmail } from '../services/mailer.js';
import {
  normalizeRole,
  normalizeDashboardKey,
  isConsoleRole,
  getDefaultPermissionsForRole,
  getDashboardConfig,
} from '../services/dashboardConfig.js';
import { reconcileUserAcademyLinksInMemory } from './academy.js';

export const authRouter = Router();

// In-memory rate limiting and account lockout store
interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

const loginAttemptsByIp: Map<string, AttemptRecord> = new Map();
const loginAttemptsByEmail: Map<string, AttemptRecord> = new Map();
const pinAttemptsByUser: Map<string, AttemptRecord> = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout
const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function checkLockout(store: Map<string, AttemptRecord>, key: string, maxAttempts: number, lockoutMs: number): { locked: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = store.get(key);
  if (!record) return { locked: false };

  if (record.lockedUntil && record.lockedUntil > now) {
    const waitSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { locked: true, waitSeconds };
  }

  // If lockout window passed, reset
  if (record.lockedUntil && record.lockedUntil <= now) {
    store.delete(key);
    return { locked: false };
  }

  return { locked: false };
}

function recordFailedAttempt(store: Map<string, AttemptRecord>, key: string, maxAttempts: number, lockoutMs: number) {
  const now = Date.now();
  const record = store.get(key) || { count: 0, firstAttempt: now };

  // If the window has been longer than lockoutMs, start fresh
  if (now - record.firstAttempt > lockoutMs && !record.lockedUntil) {
    record.count = 1;
    record.firstAttempt = now;
  } else {
    record.count++;
  }

  if (record.count >= maxAttempts) {
    record.lockedUntil = now + lockoutMs;
  }

  store.set(key, record);
}

function clearAttempts(store: Map<string, AttemptRecord>, key: string) {
  store.delete(key);
}

// -------------------------------------------------------------------
// Cryptographic JWT (HS256) Generator and Verifier
// -------------------------------------------------------------------

function base64UrlEncode(str: string | Buffer): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export function generateToken(
  userId: string,
  role: string,
  expiresInSeconds: number = 86400 * 7,
  tokenVersion: number = 1
): string {
  const secret = CREDENTIALS.app.jwtSecret;
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    sub: userId,
    userId,
    role,
    tv: tokenVersion,
    iat: now,
    exp: now + expiresInSeconds,
  }));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

export function parseToken(tokenHeader?: string): { userId: string; role: string } | null {
  if (!tokenHeader) return null;
  try {
    const raw = tokenHeader.replace(/^Bearer\s+/i, '').trim();
    if (!raw) return null;

    const parts = raw.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signature] = parts;
    const secret = CREDENTIALS.app.jwtSecret;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null; // Invalid signature / forgery attempt
    }

    const payloadJson = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);

    if (payloadJson.exp && payloadJson.exp < now) {
      return null; // Token expired
    }

    const userId = payloadJson.userId || payloadJson.sub || payloadJson.id;
    if (!userId) return null;

    const user = db.findUserById(userId);
    if (!user || user.status === 'suspended') {
      return null;
    }
    if (payloadJson.tv !== undefined && Number(user.token_version ?? 1) !== Number(payloadJson.tv)) {
      return null; // Immediately revoked after role/permission/password change
    }

    return {
      userId,
      role: normalizeRole(user.role),
    };
  } catch {
    return null;
  }
}

export const LEGACY_ADMIN_DEFAULT_PERMISSIONS = [
  'customers',
  'wallet',
  'kyc',
  'services',
  'support',
  'reports',
  'referrals',
  'withdrawals',
];

export function resolveUserPermissions(user: any): string[] {
  if (!user) return [];
  const role = normalizeRole(user.role);
  if (role === 'superadmin') return ['*'];
  if (!isConsoleRole(role)) return [];
  if (Array.isArray(user.permissions)) {
    return user.permissions;
  }
  return getDefaultPermissionsForRole(role);
}

export function hasUserPermission(user: any, permission: string): boolean {
  if (!user || user.status === 'suspended') return false;
  const role = normalizeRole(user.role);
  if (role === 'superadmin') return true;
  if (!isConsoleRole(role)) return false;
  const perms = resolveUserPermissions(user);
  return perms.includes('*') || perms.includes(permission);
}

export function hasAnyUserPermission(user: any, permissions: string[]): boolean {
  if (!user || user.status === 'suspended') return false;
  if (normalizeRole(user.role) === 'superadmin') return true;
  return permissions.some((p) => hasUserPermission(user, p));
}

export function isEmailVerificationPending(user: any): boolean {
  if (!user) return false;
  if (isConsoleRole(normalizeRole(user.role))) return false;
  return Boolean(user.email_verification_required) && !Boolean(user.email_verified);
}

export function requireVerifiedEmail(req: any, res: any): { userId: string; role: string; user: User } | null {
  const session = parseToken(req.headers?.authorization);
  if (!session) {
    res.status(401).json({ success: false, error: 'Authentication required or session expired.', code: 'UNAUTHORIZED' });
    return null;
  }
  const user = db.findUserById(session.userId);
  if (!user) {
    res.status(401).json({ success: false, error: 'User account not found.', code: 'UNAUTHORIZED' });
    return null;
  }
  if (isEmailVerificationPending(user)) {
    res.status(403).json({
      success: false,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      error: 'Please verify your email address before accessing wallet funding, service transactions, or submissions.',
      message: 'Please verify your email address before accessing wallet funding, service transactions, or submissions.',
      errors: { email: user.email, email_verification_required: true },
    });
    return null;
  }
  return { userId: session.userId, role: session.role, user };
}

export function sanitizeUser(user: any, includeDashboardConfig: boolean = false): Partial<User> & { dashboard_config?: any } {
  if (!user) return user;
  const safe: any = { ...user };
  const hasPin = Boolean(safe.transaction_pin_hash);
  delete safe.password_hash;
  delete safe.transaction_pin_hash;
  delete safe.reset_password_token;
  delete safe.reset_password_expires;
  delete safe.token_version;
  safe.role = normalizeRole(safe.role);
  safe.assigned_dashboard = normalizeDashboardKey(safe.assigned_dashboard, safe.role);
  safe.has_transaction_pin = hasPin;
  safe.has_pin_set = hasPin;
  safe.email_verified = Boolean(safe.email_verified);
  safe.email_verification_required = Boolean(safe.email_verification_required);
  safe.permissions = resolveUserPermissions(safe);
  if (includeDashboardConfig) {
    safe.dashboard_config = getDashboardConfig(safe.assigned_dashboard, 'published');
  }
  return safe;
}

// -------------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------------

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function issueExpressEmailVerification(user: User, enforceCooldown: boolean = false): Promise<{
  sent: boolean;
  cooldownSeconds?: number;
  expiresInMinutes: number;
}> {
  if (!Array.isArray(db.data.email_verifications)) {
    db.data.email_verifications = [];
  }

  const nowMs = Date.now();
  if (enforceCooldown) {
    const recent = db.data.email_verifications.find(
      (v) => v.user_id === user.id && nowMs - new Date(v.created_at).getTime() < 60000
    );
    if (recent) {
      const waitSeconds = Math.max(1, Math.ceil((60000 - (nowMs - new Date(recent.created_at).getTime())) / 1000));
      return { sent: false, cooldownSeconds: waitSeconds, expiresInMinutes: 60 };
    }
  }

  const recordId = `ev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const otpCode = String(crypto.randomInt(100000, 999999));
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const codeHash = crypto.createHash('sha256').update(otpCode).digest('hex');
  const expiresAt = new Date(nowMs + 60 * 60 * 1000).toISOString();

  const newRecord = {
    id: recordId,
    user_id: user.id,
    email: user.email.toLowerCase(),
    token_hash: tokenHash,
    code_hash: codeHash,
    attempts: 0,
    max_attempts: 5,
    is_used: false,
    expires_at: expiresAt,
    created_at: new Date(nowMs).toISOString(),
  };

  db.data.email_verifications.unshift(newRecord);
  if (db.data.email_verifications.length > 2000) {
    db.data.email_verifications = db.data.email_verifications.slice(0, 2000);
  }
  db.saveDatabase();

  const baseAppUrl = String(CREDENTIALS.app.appUrl || 'https://hambaktech.com.ng').replace(/\/+$/, '');
  const verifyUrl = `${baseAppUrl}/?verify_email=1&token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(user.email)}`;
  const safeName = escapeHtml(user.full_name || 'Valued Customer');
  const textBody = [
    'HAMBAK TECH & SERVICES',
    '',
    `Hello ${user.full_name || 'Valued Customer'},`,
    '',
    'Thank you for registering on HAMBAK TECH & SERVICES. To activate wallet funding, identity verification, VTU services, and order submissions, verify your email address using either option below:',
    '',
    `6-Digit Verification Code: ${otpCode}`,
    `Verification Link: ${verifyUrl}`,
    '',
    'This code and link expire in 60 minutes. Never share your verification code with anyone.',
    '',
    'Need assistance? Email support@hambaktech.com.ng or call 09127469686.',
  ].join('\n');

  const mailRes = await sendEmail(
    user.email,
    'Verify Your HAMBAKTECH Email Address',
    `<div style="font-family: Arial, sans-serif; padding: 24px; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #0f172a;">
      <div style="padding: 20px 24px; background: linear-gradient(135deg, #065f46 0%, #0284c7 100%); border-radius: 10px 10px 0 0; margin: -24px -24px 24px -24px;">
        <div style="font-size: 16px; font-weight: 800; color: #ffffff;">HAMBAK TECH &amp; SERVICES</div>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #d1fae5; margin-top: 4px;">Email Verification &bull; Account Activation</div>
      </div>
      <h2 style="margin-top: 0; color: #0f172a; font-size: 18px;">Confirm Your Email Address</h2>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${safeName}</strong>,</p>
      <p style="font-size: 13px; color: #475569; line-height: 1.6;">Please verify your email address to activate wallet funding, NIN/BVN verification, and VTU services on HAMBAK TECH &amp; SERVICES.</p>
      <p style="margin: 24px 0; text-align: center;">
        <a href="${escapeHtml(verifyUrl)}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">Verify Email Address</a>
      </p>
      <p style="text-align: center; font-size: 12px; color: #475569; font-weight: 600;">Or enter this 6-digit verification code (valid for 60 minutes):</p>
      <div style="text-align: center; font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #065f46; background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 12px;">${otpCode}</div>
      <p style="font-size: 11px; color: #64748b; margin-top: 20px;">Never share this code with anyone. Need help? Email <a href="mailto:support@hambaktech.com.ng" style="color: #059669;">support@hambaktech.com.ng</a>.</p>
    </div>`,
    { text: textBody }
  );

  const delivered = Boolean(mailRes.success && !mailRes.simulated && !mailRes.error);
  if (delivered) {
    for (const v of db.data.email_verifications) {
      if (v.user_id === user.id && v.id !== recordId && !v.is_used) {
        v.is_used = true;
      }
    }
    db.saveDatabase();
    db.logAudit('EMAIL_VERIFICATION_DISPATCHED', { email: user.email, messageId: mailRes.messageId }, user.id, user.email);
  } else {
    // Delete undelivered record so failed SMTP attempts do not block retry with a 60s cooldown
    db.data.email_verifications = db.data.email_verifications.filter((v) => v.id !== recordId);
    db.saveDatabase();
    console.error('[EmailVerificationDispatchFailed]', { email: user.email, error: mailRes.error || 'Delivery not completed' });
    db.logAudit('EMAIL_VERIFICATION_DISPATCH_FAILED', { email: user.email, simulated: Boolean(mailRes.simulated) }, user.id, user.email);
  }

  return { sent: delivered, expiresInMinutes: 60 };
}

// POST /api/auth/register
authRouter.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone_number } = req.body;

    if (!email || !password || !full_name || !phone_number) {
      return res.status(400).json({ error: 'All fields (full_name, email, phone_number, password) are required.' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters in length.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.findUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const password_hash = hashPassword(password);
    const referral_code = 'HT-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const newUser = db.createUser({
      email: cleanEmail,
      password_hash,
      full_name: full_name.trim(),
      phone_number: phone_number.trim(),
      role: 'customer',
      assigned_dashboard: 'customer',
      token_version: 1,
      wallet_balance: 0,
      kyc_status: 'unverified',
      tier: 1,
      referral_code,
      status: 'active',
      email_verified: false,
      email_verification_required: true,
    });

    db.addNotification(
      newUser.id,
      'Welcome to HambakTech Enterprise!',
      `Hello ${newUser.full_name}, please check your inbox and verify your email address to unlock wallet funding and services.`,
      'info'
    );

    const clientIp = getClientIp(req);
    db.logAudit('USER_REGISTERED', { email: newUser.email, phone: newUser.phone_number }, newUser.id, newUser.email, clientIp);

    const verificationDispatch = await issueExpressEmailVerification(newUser, false);
    const token = generateToken(newUser.id, newUser.role, 86400 * 7, newUser.token_version ?? 1);
    const safeUser = sanitizeUser(newUser, true);
    const verificationSent = Boolean(verificationDispatch.sent);
    const registerMessage = verificationSent
      ? 'Account created! Please enter the 6-digit verification code or click the link sent to your email to verify your account.'
      : 'Account created! We could not send your verification email right now. Please tap Resend Verification Code to try again.';

    return res.status(201).json({
      success: true,
      token,
      user: safeUser,
      dashboard_config: safeUser.dashboard_config,
      email_verification_required: true,
      verification_sent: verificationSent,
      verification_expires_in_minutes: verificationDispatch.expiresInMinutes,
      cooldown_seconds: verificationSent ? 60 : 0,
      message: registerMessage,
    });
  } catch (error: any) {
    console.error('[Register Error]', error?.message || error);
    return res.status(500).json({ error: 'Unable to create your account right now. Please try again later.' });
  }
});

function handleVerifyEmailRequest(req: any, res: any) {
  try {
    const token = String(req.body?.token ?? req.query?.token ?? '').trim();
    const otp = String(req.body?.otp_code ?? req.body?.otp ?? req.body?.code ?? req.query?.code ?? '').trim();
    let email = String(req.body?.email ?? req.query?.email ?? '').trim().toLowerCase();

    const session = parseToken(req.headers.authorization);
    if (!email && session) {
      const u = db.findUserById(session.userId);
      if (u) email = u.email.toLowerCase();
    }

    if (!token && (!otp || !email)) {
      return res.status(400).json({ success: false, error: 'Please provide a verification token or both email and 6-digit code.' });
    }

    const records = Array.isArray(db.data.email_verifications) ? db.data.email_verifications : [];
    let record = token
      ? records.find((r) => r.token_hash === crypto.createHash('sha256').update(token).digest('hex'))
      : records.find((r) => r.email.toLowerCase() === email && !r.is_used);

    if (!record && email) {
      const existingUser = db.findUserByEmail(email);
      if (existingUser && existingUser.email_verified) {
        return res.json({
          success: true,
          verified: true,
          already_verified: true,
          user: sanitizeUser(existingUser, true),
          message: 'Your email address is already verified.',
        });
      }
    }

    if (!record) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification link/code. Please request a new one.' });
    }

    const targetUser = db.findUserById(record.user_id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    if (targetUser.email_verified) {
      record.is_used = true;
      db.saveDatabase();
      return res.json({
        success: true,
        verified: true,
        already_verified: true,
        user: sanitizeUser(targetUser, true),
        message: 'Your email address is already verified.',
      });
    }

    if (record.is_used) {
      return res.status(400).json({
        success: false,
        code: 'VERIFICATION_ALREADY_USED',
        error: 'This verification link or code has already been used. Please request a new one if needed.',
        errors: { can_resend: true },
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      record.is_used = true;
      db.saveDatabase();
      return res.status(400).json({
        success: false,
        code: 'VERIFICATION_EXPIRED',
        error: 'Verification link/code has expired. Please request a new one.',
        errors: { expired: true, can_resend: true },
      });
    }

    if ((record.attempts || 0) >= (record.max_attempts || 5)) {
      record.is_used = true;
      db.saveDatabase();
      return res.status(429).json({
        success: false,
        code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
        error: 'Maximum verification attempts exceeded. Please request a new code.',
        errors: { attempts_remaining: 0, can_resend: true },
      });
    }

    const candidateHash = crypto.createHash('sha256').update(token || otp).digest('hex');
    const expectedHash = token ? record.token_hash : record.code_hash;
    if (candidateHash !== expectedHash) {
      record.attempts = (record.attempts || 0) + 1;
      const remaining = Math.max(0, (record.max_attempts || 5) - record.attempts);
      if (remaining <= 0) {
        record.is_used = true;
        db.saveDatabase();
        return res.status(429).json({
          success: false,
          code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
          error: 'Maximum verification attempts exceeded. Please request a new verification code.',
          errors: { attempts_remaining: 0, can_resend: true },
        });
      }
      db.saveDatabase();
      return res.status(400).json({
        success: false,
        code: 'INVALID_VERIFICATION_CODE',
        error: `Invalid verification code. ${remaining} attempt(s) remaining.`,
        errors: { attempts_remaining: remaining },
      });
    }

    for (const r of records) {
      if (r.user_id === targetUser.id && !r.is_used) {
        r.is_used = true;
        r.used_at = new Date().toISOString();
      }
    }
    targetUser.email_verified = true;
    targetUser.email_verified_at = new Date().toISOString();
    targetUser.updated_at = new Date().toISOString();
    db.saveDatabase();

    reconcileUserAcademyLinksInMemory(targetUser.id, targetUser.email, true);
    const refreshedUser = db.findUserById(targetUser.id) || targetUser;

    db.addNotification(
      refreshedUser.id,
      'Email Verified Successfully',
      'Your email address has been verified. Wallet funding, identity verification, and VTU services are now unlocked.',
      'success'
    );
    db.logAudit('EMAIL_VERIFIED', { method: token ? 'link_token' : 'otp_code' }, refreshedUser.id, refreshedUser.email, getClientIp(req));

    const freshToken = generateToken(refreshedUser.id, refreshedUser.role, 86400 * 7, refreshedUser.token_version ?? 1);
    return res.json({
      success: true,
      verified: true,
      user: sanitizeUser(refreshedUser, true),
      token: freshToken,
      message: 'Email verified successfully! Full portal access is now active.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Failed to verify email address.' });
  }
}

authRouter.get('/verify-email', handleVerifyEmailRequest);
authRouter.post('/verify-email', handleVerifyEmailRequest);

authRouter.post('/resend-verification', async (req, res) => {
  try {
    const session = parseToken(req.headers.authorization);
    const sessionUser = session ? db.findUserById(session.userId) : undefined;
    const email = String(req.body?.email ?? sessionUser?.email ?? '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const targetUser = sessionUser || db.findUserByEmail(email);
    if (!targetUser) {
      return res.json({
        success: true,
        sent: true,
        expires_in_minutes: 60,
        message: 'If an unverified account exists for this email address, a verification email has been sent.',
      });
    }

    if (targetUser.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Your account is suspended. Please contact support.' });
    }

    if (targetUser.email_verified) {
      return res.json({
        success: true,
        verified: true,
        already_verified: true,
        message: 'Your email address is already verified.',
      });
    }

    const dispatch = await issueExpressEmailVerification(targetUser, true);
    if (dispatch.cooldownSeconds) {
      return res.status(429).json({
        success: false,
        code: 'VERIFICATION_COOLDOWN',
        error: `Please wait ${dispatch.cooldownSeconds} second(s) before requesting another verification email.`,
        errors: { retry_after_seconds: dispatch.cooldownSeconds },
      });
    }

    if (!dispatch.sent) {
      return res.status(503).json({
        success: false,
        code: 'EMAIL_DELIVERY_FAILED',
        error: 'We could not send your verification email at this time. Please try again shortly, or contact support if the issue persists.',
        errors: { sent: false, can_retry: true },
      });
    }

    return res.json({
      success: true,
      sent: true,
      expires_in_minutes: dispatch.expiresInMinutes,
      cooldown_seconds: 60,
      message: 'A fresh verification code and link have been sent to your email address.',
    });
  } catch (err: any) {
    console.error('[ResendVerification Error]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Unable to send verification email right now. Please try again later.' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIp = getClientIp(req);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Check IP & Email Lockout
    const ipLock = checkLockout(loginAttemptsByIp, clientIp, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS);
    if (ipLock.locked) {
      db.logAudit('LOGIN_LOCKED_OUT', { ip: clientIp, email: cleanEmail }, undefined, cleanEmail, clientIp);
      return res.status(429).json({
        error: `Too many failed login attempts from this network. Please try again in ${ipLock.waitSeconds} seconds.`,
      });
    }

    const emailLock = checkLockout(loginAttemptsByEmail, cleanEmail, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS);
    if (emailLock.locked) {
      db.logAudit('ACCOUNT_LOCKED_OUT', { email: cleanEmail }, undefined, cleanEmail, clientIp);
      return res.status(429).json({
        error: `Account is temporarily locked due to repeated failed logins. Please try again in ${emailLock.waitSeconds} seconds.`,
      });
    }

    const user = db.findUserByEmail(cleanEmail);
    if (!user) {
      recordFailedAttempt(loginAttemptsByIp, clientIp, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS);
      recordFailedAttempt(loginAttemptsByEmail, cleanEmail, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS);
      db.logAudit('LOGIN_FAILED', { reason: 'User not found' }, undefined, cleanEmail, clientIp);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support@hambaktech.com.ng.' });
    }

    const isMatch = verifyPassword(password, user.password_hash, user.email);
    if (!isMatch) {
      recordFailedAttempt(loginAttemptsByIp, clientIp, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS);
      recordFailedAttempt(loginAttemptsByEmail, cleanEmail, MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS);
      db.logAudit('LOGIN_FAILED', { reason: 'Incorrect password', userId: user.id }, user.id, user.email, clientIp);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Clear failed attempts upon successful authentication
    clearAttempts(loginAttemptsByIp, clientIp);
    clearAttempts(loginAttemptsByEmail, cleanEmail);

    // Auto-migrate legacy hashes to standard bcrypt on successful login
    if (!user.password_hash.startsWith('$2')) {
      user.password_hash = hashPassword(password);
      db.saveDatabase();
    }

    if (user.email_verified !== false) {
      reconcileUserAcademyLinksInMemory(user.id, user.email, true);
    }
    const freshLoginUser = db.findUserById(user.id) || user;

    const token = generateToken(freshLoginUser.id, freshLoginUser.role, 86400 * 7, freshLoginUser.token_version ?? 1);
    const safeUser = sanitizeUser(freshLoginUser, true);

    db.logAudit('USER_LOGIN', { role: user.role, assigned_dashboard: safeUser.assigned_dashboard }, user.id, user.email, clientIp);

    return res.json({
      success: true,
      token,
      user: safeUser,
      dashboard_config: safeUser.dashboard_config,
      message: 'Logged in successfully',
    });
  } catch (error: any) {
    console.error('[Login Error]', error?.message || error);
    return res.status(500).json({ error: 'Unable to sign in right now. Please try again later.' });
  }
});

// GET /api/auth/me
authRouter.get('/me', (req, res) => {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized or invalid token' });
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const safeUser = sanitizeUser(user, true);
  return res.json({
    success: true,
    user: safeUser,
    dashboard_config: safeUser.dashboard_config,
  });
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  const session = parseToken(req.headers.authorization);
  if (session) {
    db.logAudit('USER_LOGOUT', { userId: session.userId }, session.userId, undefined, getClientIp(req));
  }
  return res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/forgot-password
authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.findUserByEmail(cleanEmail);

    if (!user) {
      return res.status(404).json({ error: 'No registered account was found with this email address.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

    (user as any).reset_password_otp = otp;
    (user as any).reset_password_token = resetTokenHash;
    (user as any).reset_password_raw_token = resetToken;
    (user as any).reset_password_expires = resetExpires;
    db.saveDatabase();

    const resetLink = `${CREDENTIALS.app.appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(cleanEmail)}`;
    sendEmail(
      user.email,
      'HambakTech Enterprise - Password Reset Code',
      `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h3>Password Reset Request</h3>
        <p>Hello ${user.full_name},</p>
        <p>Your 6-digit verification code is: <strong style="font-size: 20px; color: #10b981; letter-spacing: 4px;">${otp}</strong></p>
        <p>This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
      </div>`
    ).catch(() => {});

    db.logAudit('PASSWORD_RESET_REQUESTED', { email: user.email }, user.id, user.email, getClientIp(req));

    return res.json({
      success: true,
      message: 'A 6-digit verification code has been dispatched to your email address.',
      email: cleanEmail,
      token: resetToken,
      expires_in_minutes: 15,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to process password reset' });
  }
});

// POST /api/auth/verify-otp
authRouter.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp_code, otp } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const code = String(otp_code || otp || '').trim();

    if (!cleanEmail || !code) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const user = db.findUserByEmail(cleanEmail);
    if (!user || !(user as any).reset_password_otp) {
      return res.status(404).json({ error: 'No active password reset request found for this email.' });
    }

    const expires = new Date((user as any).reset_password_expires).getTime();
    if (expires < Date.now()) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    if ((user as any).reset_password_otp !== code) {
      return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    return res.json({
      success: true,
      message: 'Verification code verified successfully. You may now enter your new password.',
      valid: true,
      email: cleanEmail,
      token: (user as any).reset_password_raw_token || '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to verify code' });
  }
});

// POST /api/auth/reset-password
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { token, otp_code, otp, email, new_password, password } = req.body;
    const targetPassword = new_password || password;
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !targetPassword) {
      return res.status(400).json({ error: 'Email and new password are required.' });
    }

    if (typeof targetPassword !== 'string' || targetPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters in length.' });
    }

    const user = db.findUserByEmail(cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const expires = new Date((user as any).reset_password_expires || 0).getTime();
    if (expires < Date.now()) {
      return res.status(400).json({ error: 'Password reset authorization has expired. Please request a new code.' });
    }

    const code = String(otp_code || otp || '').trim();
    let isAuthorized = false;

    if (code && (user as any).reset_password_otp === code) {
      isAuthorized = true;
    } else if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      if (tokenHash === (user as any).reset_password_token) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(400).json({ error: 'Invalid or expired password reset authorization.' });
    }

    // Update password hash and clear reset state
    user.password_hash = hashPassword(targetPassword);
    delete (user as any).reset_password_token;
    delete (user as any).reset_password_raw_token;
    delete (user as any).reset_password_otp;
    delete (user as any).reset_password_expires;
    user.updated_at = new Date().toISOString();
    db.saveDatabase();

    db.logAudit('PASSWORD_RESET_COMPLETED', { email: user.email }, user.id, user.email, getClientIp(req));

    // Generate authenticated session token
    const jwtToken = generateToken(user.id, user.role);
    const sanitizedUser = sanitizeUser(user);

    return res.json({
      success: true,
      message: 'Password reset successfully! You are now logged in.',
      token: jwtToken,
      user: sanitizedUser,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// -------------------------------------------------------------------
// TRANSACTION PIN MANAGEMENT
// -------------------------------------------------------------------

// POST /api/auth/set-pin
authRouter.post('/set-pin', (req, res) => {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { pin, current_password } = req.body;
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN must be exactly 4 numeric digits' });
  }

  // Require current password for security verification if changing PIN
  if (user.transaction_pin_hash && !current_password) {
    return res.status(400).json({ error: 'Current account password is required to change transaction PIN' });
  }

  if (current_password && !verifyPassword(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect account password' });
  }

  user.transaction_pin_hash = hashPin(String(pin));
  user.updated_at = new Date().toISOString();
  db.saveDatabase();

  clearAttempts(pinAttemptsByUser, user.id);

  db.logAudit('TRANSACTION_PIN_CONFIGURED', { userId: user.id }, user.id, user.email, getClientIp(req));

  return res.json({
    success: true,
    message: 'Transaction PIN configured securely',
  });
});

// POST /api/auth/verify-pin
authRouter.post('/verify-pin', (req, res) => {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.transaction_pin_hash) {
    return res.status(400).json({ error: 'Transaction PIN has not been configured for this account' });
  }

  // Check PIN lockout
  const pinLock = checkLockout(pinAttemptsByUser, user.id, MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MS);
  if (pinLock.locked) {
    db.logAudit('PIN_LOCKED_OUT', { userId: user.id }, user.id, user.email, getClientIp(req));
    return res.status(429).json({
      error: `Too many incorrect PIN attempts. Security lockout active for ${pinLock.waitSeconds} seconds.`,
    });
  }

  const { pin } = req.body;
  const isMatch = verifyPin(String(pin), user.transaction_pin_hash);

  if (!isMatch) {
    recordFailedAttempt(pinAttemptsByUser, user.id, MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MS);
    db.logAudit('PIN_VERIFICATION_FAILED', { userId: user.id }, user.id, user.email, getClientIp(req));
    return res.status(401).json({ error: 'Incorrect transaction PIN' });
  }

  clearAttempts(pinAttemptsByUser, user.id);

  return res.json({
    success: true,
    message: 'PIN verified successfully',
  });
});
