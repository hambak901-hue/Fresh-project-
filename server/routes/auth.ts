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

export function generateToken(userId: string, role: string, expiresInSeconds: number = 86400 * 7): string {
  const secret = CREDENTIALS.app.jwtSecret;
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    sub: userId,
    userId,
    role,
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

    return {
      userId,
      role: payloadJson.role || 'customer',
    };
  } catch {
    return null;
  }
}

export function sanitizeUser(user: any): Partial<User> {
  if (!user) return user;
  const safe = { ...user };
  delete safe.password_hash;
  delete safe.transaction_pin_hash;
  delete safe.reset_password_token;
  delete safe.reset_password_expires;
  return safe;
}

// -------------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------------

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
      wallet_balance: 0,
      kyc_status: 'unverified',
      tier: 1,
      referral_code,
      status: 'active',
    });

    db.addNotification(
      newUser.id,
      'Welcome to HambakTech Enterprise!',
      `Hello ${newUser.full_name}, your account has been successfully created. Fund your wallet or complete KYC to get started.`,
      'success'
    );

    const clientIp = getClientIp(req);
    db.logAudit('USER_REGISTERED', { email: newUser.email, phone: newUser.phone_number }, newUser.id, newUser.email, clientIp);

    sendEmail(
      newUser.email,
      'Welcome to HambakTech Enterprise Portal',
      `<h2>Welcome ${newUser.full_name}!</h2><p>Your account is ready at HambakTech. Access instant NIN/BVN verification, VTU airtime & data, and digital services.</p>`
    ).catch(() => {});

    const token = generateToken(newUser.id, newUser.role);

    return res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(newUser),
      message: 'Account created successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Registration failed' });
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

    const token = generateToken(user.id, user.role);

    db.logAudit('USER_LOGIN', { role: user.role }, user.id, user.email, clientIp);

    return res.json({
      success: true,
      token,
      user: sanitizeUser(user),
      message: 'Logged in successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Login failed' });
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

  return res.json({
    success: true,
    user: sanitizeUser(user),
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
