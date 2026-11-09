/**
 * @file customer.ts
 * Dedicated backend router for Customer Dashboard.
 * Powers dashboard overview metrics, profile editing, transaction PIN, KYC submission,
 * wallet statements, manual payment proof, and notifications.
 */

import { Router } from 'express';
import { db, hashPassword, verifyPassword, hashPin, verifyPin, User } from '../db/database.js';
import { parseToken } from './auth.js';
import { sendEmail } from '../services/mailer.js';
import { validateUploadFile, validateUploadBuffer, generateSecureFilename } from '../services/security.js';

export const customerRouter = Router();

function requireCustomer(req: any, res: any, next: any) {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Account is suspended' });
  }
  req.user = user;
  next();
}

function safeUserResponse(user: User) {
  const safe: any = { ...user };
  delete safe.password_hash;
  safe.has_transaction_pin = Boolean(user.transaction_pin_hash);
  delete safe.transaction_pin_hash;
  return safe;
}

// GET /api/customer/summary - Live dashboard overview metrics
customerRouter.get('/summary', requireCustomer, (req: any, res) => {
  const user = req.user;
  const userTxns = db.data.transactions.filter(t => t.user_id === user.id);
  const userOrders = db.data.telecom_orders.filter(o => o.user_id === user.id);
  const userVerifications = db.data.verifications.filter(v => v.user_id === user.id);
  const userNotifications = db.data.notifications.filter(n => n.user_id === user.id);

  const successfulTxns = userTxns.filter(t => t.status === 'successful');
  const pendingTxns = userTxns.filter(t => t.status === 'pending');
  const failedTxns = userTxns.filter(t => t.status === 'failed');

  const totalFunded = userTxns
    .filter(t => t.type === 'credit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSpent = userTxns
    .filter(t => t.type === 'debit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  // Combine and sort recent activities chronologically
  const activities = [
    ...userTxns.map(t => ({
      id: t.id,
      category: 'transaction',
      type: t.type,
      title: t.description,
      amount: t.amount,
      status: t.status,
      timestamp: t.created_at,
    })),
    ...userOrders.map(o => ({
      id: o.id,
      category: 'order',
      type: 'debit',
      title: `${o.network} ${o.plan} to ${o.phone}`,
      amount: o.amount,
      status: o.status,
      timestamp: o.created_at,
    })),
    ...userVerifications.map(v => ({
      id: v.id,
      category: 'verification',
      type: 'debit',
      title: `${v.type} Query: ${v.search_value}`,
      amount: v.cost,
      status: v.status,
      timestamp: v.created_at,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Announcements (published)
  const publishedAnnouncements = (db.data.announcements || [])
    .filter(a => a.status === 'published')
    .slice(0, 3);

  res.json({
    success: true,
    user: safeUserResponse(user),
    metrics: {
      wallet_balance: user.wallet_balance,
      total_transactions: userTxns.length,
      successful_transactions: successfulTxns.length,
      pending_transactions: pendingTxns.length,
      failed_transactions: failedTxns.length,
      total_funded: totalFunded,
      total_spent: totalSpent,
      total_orders: userOrders.length,
      total_verifications: userVerifications.length,
      unread_notifications_count: userNotifications.filter(n => !n.read).length,
    },
    recent_activities: activities.slice(0, 10),
    recent_orders: userOrders.slice(0, 5),
    recent_verifications: userVerifications.slice(0, 5),
    notifications: userNotifications.slice(0, 5),
    announcements: publishedAnnouncements,
    bank_details: {
      accountName: db.data.settings.bank_transfer_account_name,
      bank: db.data.settings.bank_transfer_bank,
      accountNumber: db.data.settings.bank_transfer_account_number,
    },
  });
});

// PUT /api/customer/profile - Edit customer profile
customerRouter.put('/profile', requireCustomer, (req: any, res) => {
  const { full_name, phone_number, address, state, lga, bio, avatar_url } = req.body;

  const updates: Partial<User> = {};
  if (full_name !== undefined) updates.full_name = String(full_name).trim();
  if (phone_number !== undefined) updates.phone_number = String(phone_number).trim();
  if (address !== undefined) updates.address = String(address).trim();
  if (state !== undefined) updates.state = String(state).trim();
  if (lga !== undefined) updates.lga = String(lga).trim();
  if (bio !== undefined) updates.bio = String(bio).trim();
  if (avatar_url !== undefined) updates.avatar_url = String(avatar_url).trim();

  const updated = db.updateUser(req.user.id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.logAudit('CUSTOMER_PROFILE_UPDATED', updates, req.user.id, req.user.email);

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user: safeUserResponse(updated),
  });
});

// PUT /api/customer/password - Change password
customerRouter.put('/password', requireCustomer, (req: any, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current password and new password are required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  if (!verifyPassword(current_password, req.user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const updated = db.updateUser(req.user.id, {
    password_hash: hashPassword(new_password),
  });

  db.logAudit('CUSTOMER_PASSWORD_CHANGED', {}, req.user.id, req.user.email);

  db.addNotification(
    req.user.id,
    'Password Changed',
    'Your account password was updated successfully. If this was not you, contact security immediately.',
    'warning'
  );

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
});

// PUT /api/customer/pin - Set or update 4-digit transaction PIN
customerRouter.put('/pin', requireCustomer, (req: any, res) => {
  const { pin, current_pin } = req.body;

  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }

  // If user already has PIN, verify current_pin
  if (req.user.transaction_pin_hash) {
    if (!current_pin || !verifyPin(String(current_pin), req.user.transaction_pin_hash)) {
      return res.status(401).json({ error: 'Current transaction PIN is incorrect' });
    }
  }

  const updated = db.updateUser(req.user.id, {
    transaction_pin_hash: hashPin(String(pin)),
  });

  db.logAudit('TRANSACTION_PIN_UPDATED', {}, req.user.id, req.user.email);

  db.addNotification(
    req.user.id,
    'Security PIN Configured',
    'Your 4-digit transaction security PIN has been set.',
    'info'
  );

  res.json({
    success: true,
    message: 'Transaction PIN set successfully',
    has_transaction_pin: true,
  });
});

// POST /api/customer/verify-pin - Validate transaction PIN before sensitive operations
customerRouter.post('/verify-pin', requireCustomer, (req: any, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'Please enter a valid 4-digit PIN' });
  }

  // If user hasn't set PIN yet, do not permit default 1234
  if (!req.user.transaction_pin_hash) {
    return res.status(400).json({ error: 'Transaction PIN has not been configured. Please configure your 4-digit PIN in Security Settings before transacting.' });
  }

  if (!verifyPin(String(pin), req.user.transaction_pin_hash)) {
    return res.status(401).json({ error: 'Incorrect 4-digit transaction PIN' });
  }

  res.json({ success: true, verified: true });
});

// PUT /api/customer/preferences - Update notification and security preferences
customerRouter.put('/preferences', requireCustomer, (req: any, res) => {
  const { notification_preferences, security_settings } = req.body;

  const updates: Partial<User> = {};
  if (notification_preferences) {
    updates.notification_preferences = {
      ...(req.user.notification_preferences || {
        email_alerts: true,
        sms_alerts: false,
        transaction_receipts: true,
        security_warnings: true,
      }),
      ...notification_preferences,
    };
  }
  if (security_settings) {
    updates.security_settings = {
      ...(req.user.security_settings || {
        two_factor_enabled: false,
        login_alerts: true,
      }),
      ...security_settings,
    };
  }

  const updated = db.updateUser(req.user.id, updates);
  res.json({
    success: true,
    message: 'Preferences updated successfully',
    user: safeUserResponse(updated!),
  });
});

// POST /api/customer/upload - Secure Document Upload (KYC, Receipts, Profile Image)
customerRouter.post('/upload', requireCustomer, (req: any, res) => {
  try {
    const { fileData, fileName, mimeType } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided' });
    }

    let buffer: Buffer;
    let declaredMime = mimeType;

    if (fileData.startsWith('data:')) {
      const match = fileData.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid data URI format' });
      }
      declaredMime = match[1];
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(fileData, 'base64');
    }

    const validation = validateUploadBuffer(buffer, declaredMime, fileName);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const secureName = generateSecureFilename(validation.extension);
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const relativeUrl = `/api/customer/document/${documentId}`;

    // Store in-memory document metadata for protected download
    if (!db.data.uploaded_documents) {
      (db.data as any).uploaded_documents = [];
    }

    (db.data as any).uploaded_documents.push({
      id: documentId,
      user_id: req.user.id,
      original_name: fileName || secureName,
      secure_name: secureName,
      mime_type: validation.mimeType,
      size_bytes: buffer.length,
      created_at: new Date().toISOString(),
      // store base64 data for protected retrieval
      data_uri: `data:${validation.mimeType};base64,${buffer.toString('base64')}`,
    });
    db.saveDatabase();

    db.logAudit('DOCUMENT_UPLOADED', { documentId, mimeType: validation.mimeType, sizeBytes: buffer.length }, req.user.id, req.user.email);

    return res.status(201).json({
      success: true,
      document_id: documentId,
      url: relativeUrl,
      secure_name: secureName,
      mime_type: validation.mimeType,
      size_bytes: buffer.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'File upload failed' });
  }
});

// GET /api/customer/document/:id - Protected document retrieval (Requires ownership or admin)
customerRouter.get('/document/:id', requireCustomer, (req: any, res) => {
  const docs = (db.data as any).uploaded_documents || [];
  const doc = docs.find((d: any) => d.id === req.params.id);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Authorization check: User must own the document OR be an administrator
  const isOwner = doc.user_id === req.user.id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

  if (!isOwner && !isAdmin) {
    db.logAudit('UNAUTHORIZED_DOCUMENT_ACCESS', { documentId: req.params.id, targetUserId: doc.user_id }, req.user.id, req.user.email);
    return res.status(403).json({ error: 'Access denied: You do not have permission to view this document.' });
  }

  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${doc.secure_name}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const base64Data = doc.data_uri.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  return res.send(buffer);
});

// POST /api/customer/kyc-submit - Submit KYC verification documents
customerRouter.post('/kyc-submit', requireCustomer, (req: any, res) => {
  const { id_type, id_number, doc_url, notes } = req.body;

  if (!id_type || !id_number) {
    return res.status(400).json({ error: 'ID Type and ID number are required' });
  }

  if (doc_url) {
    const fileCheck = validateUploadFile(doc_url);
    if (!fileCheck.valid) {
      return res.status(400).json({ error: fileCheck.error });
    }
  }

  const existingDocs = req.user.kyc_documents || [];
  const newDoc = {
    id: `kyc_${Date.now()}`,
    id_type,
    id_number,
    doc_url: doc_url || '/public/assets/aistudio/IMG_0484_0fb633df.png',
    submitted_at: new Date().toISOString(),
    status: 'pending' as const,
    review_notes: notes || 'Pending admin compliance review',
  };

  const updated = db.updateUser(req.user.id, {
    kyc_status: 'pending',
    kyc_documents: [newDoc, ...existingDocs],
  });

  db.logAudit('KYC_DOCUMENT_SUBMITTED', { id_type, id_number }, req.user.id, req.user.email);

  db.addNotification(
    req.user.id,
    'KYC Submission Received',
    `Your ${id_type} document has been submitted and is currently under compliance review.`,
    'info'
  );

  res.json({
    success: true,
    message: 'KYC documents submitted successfully. Status is now PENDING review.',
    user: safeUserResponse(updated!),
  });
});

// POST /api/customer/manual-funding - Submit proof of bank transfer
customerRouter.post('/manual-funding', requireCustomer, (req: any, res) => {
  const { amount, sender_name, bank_name, reference, payment_proof_url } = req.body;
  const numAmount = Number(amount);

  if (!numAmount || numAmount < 500) {
    return res.status(400).json({ error: 'Minimum manual funding amount is ₦500' });
  }
  if (!sender_name || !reference) {
    return res.status(400).json({ error: 'Sender name and transaction reference are required' });
  }

  if (payment_proof_url) {
    const fileCheck = validateUploadFile(payment_proof_url);
    if (!fileCheck.valid) {
      return res.status(400).json({ error: fileCheck.error });
    }
  }

  const cleanRef = reference.trim().toUpperCase();
  const existingRef = db.data.transactions.find(t => t.reference === cleanRef);
  if (existingRef) {
    return res.status(400).json({ error: `A transaction with reference "${cleanRef}" has already been submitted.` });
  }

  // Create pending transaction in ledger
  const txnId = `txn_${Date.now()}`;
  const transaction: any = {
    id: txnId,
    user_id: req.user.id,
    type: 'credit',
    amount: numAmount,
    balance_before: req.user.wallet_balance,
    balance_after: req.user.wallet_balance, // not credited until approved
    category: 'funding',
    reference: cleanRef,
    gateway: 'manual_transfer',
    status: 'pending',
    description: `Manual Bank Transfer: ₦${numAmount.toLocaleString()} from ${sender_name} (${bank_name || 'Bank'})`,
    metadata: {
      sender_name,
      bank_name,
      payment_proof_url,
      submitted_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
  };

  db.data.transactions.unshift(transaction);
  db.saveDatabase();

  db.logAudit('MANUAL_FUNDING_SUBMITTED', { amount: numAmount, reference, sender_name }, req.user.id, req.user.email);

  db.addNotification(
    req.user.id,
    'Payment Proof Submitted',
    `Your transfer of ₦${numAmount.toLocaleString()} (Ref: ${reference}) is received and pending manual verification.`,
    'info'
  );

  res.json({
    success: true,
    message: 'Payment proof submitted. An admin will verify the transfer within 15 minutes.',
    transaction,
  });
});

// GET /api/customer/notifications
customerRouter.get('/notifications', requireCustomer, (req: any, res) => {
  const userNotifs = db.data.notifications.filter(n => n.user_id === req.user.id);
  res.json({
    success: true,
    notifications: userNotifs,
    unread_count: userNotifs.filter(n => !n.read).length,
  });
});

// PUT /api/customer/notifications/:id/read
customerRouter.put('/notifications/:id/read', requireCustomer, (req: any, res) => {
  const notif = db.data.notifications.find(n => n.id === req.params.id && n.user_id === req.user.id);
  if (notif) {
    notif.read = true;
    db.saveDatabase();
  }
  res.json({ success: true });
});

// PUT /api/customer/notifications/read-all
customerRouter.put('/notifications/read-all', requireCustomer, (req: any, res) => {
  db.data.notifications.forEach(n => {
    if (n.user_id === req.user.id) {
      n.read = true;
    }
  });
  db.saveDatabase();
  res.json({ success: true, message: 'All notifications marked as read' });
});

// GET /api/customer/statement - Generate customer financial statement
customerRouter.get('/statement', requireCustomer, (req: any, res) => {
  const { startDate, endDate } = req.query;
  let txns = db.data.transactions.filter(t => t.user_id === req.user.id);

  if (startDate) {
    txns = txns.filter(t => new Date(t.created_at) >= new Date(String(startDate)));
  }
  if (endDate) {
    txns = txns.filter(t => new Date(t.created_at) <= new Date(String(endDate)));
  }

  const totalCredits = txns
    .filter(t => t.type === 'credit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebits = txns
    .filter(t => t.type === 'debit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  res.json({
    success: true,
    account: {
      fullName: req.user.full_name,
      email: req.user.email,
      phone: req.user.phone_number,
      tier: req.user.tier,
      kycStatus: req.user.kyc_status,
      currentBalance: req.user.wallet_balance,
    },
    statement: {
      generatedAt: new Date().toISOString(),
      period: { startDate: startDate || 'All Time', endDate: endDate || 'Present' },
      totalCredits,
      totalDebits,
      netFlow: totalCredits - totalDebits,
      transactionCount: txns.length,
      transactions: txns,
    },
  });
});

// POST /api/customer/support-ticket - Submit support message from dashboard
customerRouter.post('/support-ticket', requireCustomer, async (req: any, res) => {
  const { subject, message, priority = 'medium' } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  db.logAudit('SUPPORT_TICKET_CREATED', { subject, priority, messageLength: message.length }, req.user.id, req.user.email);

  db.addNotification(
    req.user.id,
    'Support Ticket Opened',
    `Your ticket "${subject}" has been received. Ticket ID: TKT-${Date.now().toString().slice(-6)}.`,
    'info'
  );

  try {
    await sendEmail(
      db.data.branding?.support_email || 'support@hambaktech.com.ng',
      `[Support Ticket] ${subject} - From ${req.user.full_name}`,
      `<p><strong>User:</strong> ${req.user.full_name} (${req.user.email})</p>
       <p><strong>Priority:</strong> ${priority}</p>
       <p><strong>Message:</strong></p>
       <p>${message}</p>`
    );
  } catch (e) {}

  res.json({
    success: true,
    ticketId: `TKT-${Date.now().toString().slice(-6)}`,
    message: 'Support ticket submitted. A representative will attend to your request shortly.',
  });
});

// -------------------------------------------------------------
// PHASE 8: CUSTOMER MESSAGES, STORE, ACADEMY, REPORTS
// -------------------------------------------------------------

// GET /api/customer/messages - System messages and official communications
customerRouter.get('/messages', requireCustomer, (req: any, res) => {
  const allMessages = db.data.customer_messages || [];
  const userMessages = allMessages.filter(m => m.user_id === req.user.id || m.user_id === 'all');
  const unreadCount = userMessages.filter(m => !m.read).length;

  res.json({
    success: true,
    count: userMessages.length,
    unreadCount,
    messages: userMessages,
  });
});

// PUT /api/customer/messages/:id/read - Mark message as read
customerRouter.put('/messages/:id/read', requireCustomer, (req: any, res) => {
  const ok = db.markCustomerMessageRead(req.params.id);
  res.json({ success: ok, message: ok ? 'Message marked as read' : 'Message not found' });
});

// GET /api/customer/store - Stored products and status
customerRouter.get('/store', requireCustomer, (req: any, res) => {
  res.json({
    success: true,
    items: (db.data.store_items || []).filter(i => i.status !== 'draft'),
    settings: db.data.store_settings || {
      store_name: 'HambakTech Hardware & Developer Store',
      status: 'coming_soon',
      coming_soon_message: 'Official launch in Phase 5.',
    },
  });
});

// GET /api/customer/academy - Courses catalog and status
customerRouter.get('/academy', requireCustomer, (req: any, res) => {
  res.json({
    success: true,
    courses: (db.data.academy_courses || []).filter(c => c.status !== 'draft'),
    settings: db.data.academy_settings || {
      academy_name: 'HambakTech VTU & Identity Reseller Academy',
      status: 'coming_soon',
      coming_soon_message: 'Accreditation syllabus under review.',
    },
  });
});

// GET /api/customer/reports - Customer personal analytics
customerRouter.get('/reports', requireCustomer, (req: any, res) => {
  const userTxns = (db.data.transactions || []).filter(t => t.user_id === req.user.id);
  const userOrders = (db.data.telecom_orders || []).filter(o => o.user_id === req.user.id);
  const userVerifs = (db.data.verifications || []).filter(v => v.user_id === req.user.id);

  const totalSpent = userTxns.filter(t => t.type === 'debit' && t.status === 'successful').reduce((s, t) => s + t.amount, 0);
  const totalFunded = userTxns.filter(t => t.type === 'credit' && t.status === 'successful').reduce((s, t) => s + t.amount, 0);

  const categoryBreakdown = {
    nin_verification: userTxns.filter(t => t.category === 'nin_verification' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    bvn_verification: userTxns.filter(t => t.category === 'bvn_verification' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    data_purchase: userTxns.filter(t => t.category === 'data_purchase' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    airtime: userTxns.filter(t => t.category === 'airtime' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    cable_tv: userTxns.filter(t => t.category === 'cable_tv' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
    store_purchase: userTxns.filter(t => t.category === 'store_purchase' && t.status === 'successful').reduce((s, t) => s + t.amount, 0),
  };

  res.json({
    success: true,
    settings: db.data.reports_settings,
    analytics: {
      totalSpent,
      totalFunded,
      currentBalance: req.user.wallet_balance,
      categoryBreakdown,
      ordersCount: userOrders.length,
      verificationsCount: userVerifs.length,
      transactionsCount: userTxns.length,
      recentTransactions: userTxns.slice(0, 10),
    },
  });
});
