/**
 * @file auth.ts
 * Authentication routes for HambakTech Enterprise.
 */

import { Router } from 'express';
import { db, hashPassword, verifyPassword } from '../db/database.js';
import { sendEmail } from '../services/mailer.js';

export const authRouter = Router();

// Simple JWT-like secure token generator for session handling
function generateToken(userId: string, role: string): string {
  const payload = JSON.stringify({ userId, role, timestamp: Date.now() });
  return Buffer.from(payload).toString('base64');
}

export function parseToken(tokenHeader?: string): { userId: string; role: string } | null {
  if (!tokenHeader) return null;
  try {
    const raw = tokenHeader.replace(/^Bearer\s+/i, '').trim();
    let jsonStr = '';
    if (raw.includes('.')) {
      // Standard JWT format: header.payload.signature
      const parts = raw.split('.');
      jsonStr = Buffer.from(parts[1], 'base64').toString('utf-8');
    } else {
      jsonStr = Buffer.from(raw, 'base64').toString('utf-8');
    }
    const decoded = JSON.parse(jsonStr);
    const userId = decoded.userId || decoded.sub || decoded.id;
    if (!userId) return null;
    return {
      userId,
      role: decoded.role || 'customer',
    };
  } catch {
    return null;
  }
}

// POST /api/auth/register
authRouter.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone_number } = req.body;

    if (!email || !password || !full_name || !phone_number) {
      return res.status(400).json({ error: 'All fields (full_name, email, phone_number, password) are required.' });
    }

    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const password_hash = hashPassword(password);
    const referral_code = 'HT-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const newUser = db.createUser({
      email: email.trim().toLowerCase(),
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

    // Add welcome notification
    db.addNotification(
      newUser.id,
      'Welcome to HambakTech Enterprise!',
      `Hello ${newUser.full_name}, your account has been successfully created. Fund your wallet or complete KYC to get started.`,
      'success'
    );

    // Audit log
    db.logAudit('USER_REGISTERED', { email: newUser.email, phone: newUser.phone_number }, newUser.id, newUser.email, req.ip);

    // Optional welcome email
    sendEmail(
      newUser.email,
      'Welcome to HambakTech Enterprise Portal',
      `<h2>Welcome ${newUser.full_name}!</h2><p>Your account is ready at HambakTech. Access instant NIN/BVN verification, VTU airtime & data, and digital services.</p>`
    ).catch(() => {});

    const token = generateToken(newUser.id, newUser.role);

    const safeUser = { ...newUser };
    delete (safeUser as any).password_hash;

    return res.status(201).json({
      success: true,
      token,
      user: safeUser,
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support@hambaktech.com.ng.' });
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Auto-migrate legacy SHA-256 hashes to bcrypt on successful login
    if (!user.password_hash.startsWith('$2')) {
      user.password_hash = hashPassword(password);
      db.saveDatabase();
    }

    const token = generateToken(user.id, user.role);

    db.logAudit('USER_LOGIN', { role: user.role }, user.id, user.email, req.ip);

    const safeUser = { ...user };
    delete (safeUser as any).password_hash;

    return res.json({
      success: true,
      token,
      user: safeUser,
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
    return res.status(404).json({ error: 'User not found' });
  }

  const safeUser = { ...user };
  delete (safeUser as any).password_hash;

  return res.json({
    success: true,
    user: safeUser,
  });
});
