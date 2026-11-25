/**
 * @file wallet.ts
 * Enterprise Wallet & Payment Gateway Engine for HambakTech Portal (Phase 7).
 *
 * Implements:
 * 1. Individual customer wallets with atomic balance locks, credit, debit, statements, and ledger entries.
 * 2. Immutable double-entry ledger with atomic updates and duplicate protection.
 * 3. Paystack Online Gateway: Initialization, Authorization, Verification, Webhook with HMAC SHA512 signature validation.
 * 4. Admin Wallet Controls: Manual Credit/Debit with mandatory audit logging and reason recording.
 * 5. Financial Administration: Summary metrics, ledger reports, and revenue analysis.
 */

import { Router } from 'express';
import { db, User, Transaction } from '../db/database.js';
import { paymentManager, PaystackAdapter } from '../adapters/payment/PaymentAdapter.js';
import { parseToken, hasAnyUserPermission, requireVerifiedEmail } from './auth.js';
import { sendEmail } from '../services/mailer.js';
import { sanitizeCustomerError } from '../services/errorSanitizer.js';
import {
  NIGERIAN_DVA_BANKS,
  buildCustomerVirtualAccountState,
  provisionCustomerVirtualAccount,
} from '../services/paystackDvaLocal.js';

export const walletRouter = Router();

// -------------------------------------------------------------
// Authentication Middlewares
// -------------------------------------------------------------

function requireAuth(req: any, res: any, next: any) {
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

function requireAdmin(req: any, res: any, next: any) {
  requireAuth(req, res, () => {
    if (!['admin', 'staff', 'superadmin'].includes(req.user.role) || !hasAnyUserPermission(req.user, ['wallet', 'reports'])) {
      return res.status(403).json({ error: 'Access denied. Wallet management permission required.' });
    }
    next();
  });
}

// -------------------------------------------------------------
// 1. INDIVIDUAL WALLET SUMMARY & STATEMENTS
// -------------------------------------------------------------

// GET /api/wallet/summary
walletRouter.get('/summary', requireAuth, (req: any, res) => {
  const user = req.user;
  const userTxns = db.data.transactions.filter(t => t.user_id === user.id);

  const totalSpent = userTxns
    .filter(t => t.type === 'debit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalFunded = userTxns
    .filter(t => t.type === 'credit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const pendingFunding = userTxns
    .filter(t => t.type === 'credit' && t.status === 'pending')
    .reduce((sum, t) => sum + t.amount, 0);

  res.json({
    success: true,
    wallet_id: `wal_${user.id}`,
    balance: user.wallet_balance,
    currency: 'NGN',
    status: user.status === 'active' ? 'active' : 'restricted',
    totalSpent,
    totalFunded,
    pendingFunding,
    transactionCount: userTxns.length,
    recentTransactions: userTxns.slice(0, 15),
    activeGateway: paymentManager.getActiveGateway().getId(),
    availableGateways: paymentManager.getAllGateways(),
    bankDetails: null,
  });
});

// GET /api/wallet/statement - Filterable official customer statement
walletRouter.get('/statement', requireAuth, (req: any, res) => {
  const { startDate, endDate, category, type } = req.query;
  let txns = db.data.transactions.filter(t => t.user_id === req.user.id);

  if (startDate) {
    txns = txns.filter(t => new Date(t.created_at) >= new Date(String(startDate)));
  }
  if (endDate) {
    txns = txns.filter(t => new Date(t.created_at) <= new Date(String(endDate)));
  }
  if (category && category !== 'all') {
    txns = txns.filter(t => t.category === category);
  }
  if (type && type !== 'all') {
    txns = txns.filter(t => t.type === type);
  }

  const totalCredits = txns
    .filter(t => t.type === 'credit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebits = txns
    .filter(t => t.type === 'debit' && t.status === 'successful')
    .reduce((sum, t) => sum + t.amount, 0);

  res.json({
    success: true,
    statement: {
      accountName: req.user.full_name,
      email: req.user.email,
      phone: req.user.phone_number,
      tier: req.user.tier,
      wallet_id: `WAL-${req.user.id.toUpperCase()}`,
      currentBalance: req.user.wallet_balance,
      generatedAt: new Date().toISOString(),
      period: {
        startDate: startDate || 'Beginning',
        endDate: endDate || 'Present',
      },
      summary: {
        totalCredits,
        totalDebits,
        netFlow: totalCredits - totalDebits,
        transactionCount: txns.length,
      },
      entries: txns,
    },
  });
});

// GET /api/wallet/transactions
walletRouter.get('/transactions', requireAuth, (req: any, res) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));
  const search = (req.query.search as string || '').toLowerCase();

  let userTxns = db.data.transactions.filter(t => t.user_id === req.user.id);

  if (search) {
    userTxns = userTxns.filter(t =>
      t.description.toLowerCase().includes(search) ||
      t.reference.toLowerCase().includes(search) ||
      t.category.toLowerCase().includes(search)
    );
  }

  const total = userTxns.length;
  const startIdx = (page - 1) * limit;
  const paginated = userTxns.slice(startIdx, startIdx + limit);

  res.json({
    success: true,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    transactions: paginated,
  });
});

// -------------------------------------------------------------
// 2. PAYSTACK GATEWAY INTEGRATION
// -------------------------------------------------------------

// POST /api/wallet/paystack/initialize & /api/wallet/fund/initiate
// Initializes transaction with Paystack and returns checkout URL
async function handlePaystackInitialize(req: any, res: any) {
  if (!requireVerifiedEmail(req, res)) return;
  try {
    const requestedGateway = String(req.body?.gateway || 'paystack').trim().toLowerCase();
    if (requestedGateway && requestedGateway !== 'paystack') {
      return res.status(410).json({
        success: false,
        error: 'Only Paystack is supported for wallet funding. Manual bank transfer and other gateways have been discontinued.',
      });
    }

    const { amount, callback_url } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 100) {
      return res.status(400).json({ error: 'Minimum online funding amount is ₦100' });
    }
    if (numAmount > 5000000) {
      return res.status(400).json({ error: 'Maximum single online funding amount is ₦5,000,000' });
    }

    const reference = `PSTK_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Record pending funding transaction in ledger
    const pendingTxn: Transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: req.user.id,
      type: 'credit',
      amount: numAmount,
      balance_before: req.user.wallet_balance,
      balance_after: req.user.wallet_balance, // atomic lock - untouched until verified
      category: 'funding',
      reference,
      gateway: 'paystack',
      status: 'pending',
      description: `Paystack Online Card/Transfer Top-up: ₦${numAmount.toLocaleString()}`,
      metadata: {
        gateway: 'paystack',
        initialized_at: new Date().toISOString(),
        customer_email: req.user.email,
        customer_name: req.user.full_name,
      },
      created_at: new Date().toISOString(),
    };

    db.data.transactions.unshift(pendingTxn);
    db.saveDatabase();

    const paystack = new PaystackAdapter();
    const result = await paystack.initializePayment({
      email: req.user.email,
      amount: numAmount,
      reference,
      callback_url,
      metadata: {
        userId: req.user.id,
        transactionId: pendingTxn.id,
      },
    });

    if (!result.success) {
      pendingTxn.status = 'failed';
      pendingTxn.metadata = {
        ...pendingTxn.metadata,
        init_failed_at: new Date().toISOString(),
        init_error: result.message,
      };
      db.saveDatabase();
      return res.status(400).json({
        success: false,
        error: sanitizeCustomerError(result.message),
      });
    }

    res.json({
      success: true,
      message: 'Paystack checkout session created',
      authorization_url: result.authorization_url,
      link: result.authorization_url,
      access_code: result.access_code,
      reference,
      tx_ref: reference,
      amount: numAmount,
      gateway: 'paystack',
      is_simulated: result.is_simulated,
    });
  } catch (error: any) {
    res.status(500).json({ error: sanitizeCustomerError(error?.message) });
  }
}

walletRouter.post('/paystack/initialize', requireAuth, handlePaystackInitialize);
walletRouter.post('/fund/initiate', requireAuth, handlePaystackInitialize);

// POST /api/wallet/flutterwave/initialize (Discontinued)
walletRouter.post('/flutterwave/initialize', requireAuth, (_req: any, res) => {
  return res.status(410).json({
    success: false,
    error: 'Flutterwave checkout has been discontinued. Please use Paystack.',
  });
});

// POST /api/wallet/paystack/verify & /api/wallet/fund/verify
// Verifies transaction server-side. NEVER credits based solely on customer returning.
async function handlePaystackVerify(req: any, res: any) {
  try {
    const requestedGateway = String(req.body?.gateway || req.query?.gateway || 'paystack').trim().toLowerCase();
    if (requestedGateway && requestedGateway !== 'paystack') {
      return res.status(410).json({
        success: false,
        error: 'Only Paystack payment verification is supported.',
      });
    }

    const reference = String(req.body?.reference || req.query?.reference || '').trim();
    if (!reference) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    // 1. Look up transaction in database ledger
    const txn = db.data.transactions.find(t => t.reference === reference);
    if (!txn) {
      return res.status(404).json({ error: 'Transaction reference not found in ledger' });
    }

    // 2. Ownership / IDOR protection
    const isAdminOrSuper = ['admin', 'superadmin'].includes(String(req.user.role || '').toLowerCase());
    if (txn.user_id !== req.user.id && !isAdminOrSuper) {
      return res.status(403).json({ error: 'Unauthorized: This payment reference belongs to a different account.' });
    }

    if (txn.gateway !== 'paystack') {
      return res.status(400).json({ error: 'This transaction reference does not belong to Paystack.' });
    }

    // 3. Prevent duplicate credit / double-spending (Idempotent)
    if (txn.status === 'successful') {
      const user = db.findUserById(txn.user_id);
      return res.json({
        success: true,
        settled: true,
        already_credited: true,
        status: 'successful',
        amount: txn.amount,
        message: 'Transaction already verified and credited to wallet (Idempotent)',
        balance: user?.wallet_balance || 0,
        transaction: txn,
      });
    }

    // 4. Query Paystack server-side for verification
    const paystack = new PaystackAdapter();
    const verifyResult = await paystack.verifyPayment(reference);
    const upstreamStatus = String(verifyResult.raw_response?.status || '').trim().toLowerCase();

    if (!verifyResult.verified) {
      if (['pending', 'ongoing', 'processing', 'queued', 'abandoned'].includes(upstreamStatus)) {
        return res.json({
          success: true,
          settled: false,
          pending: true,
          status: 'pending',
          amount: txn.amount,
          reference,
          message: 'Payment is still awaiting confirmation from Paystack. Complete checkout and click Verify Payment.',
        });
      }

      txn.status = 'failed';
      if (!txn.metadata) txn.metadata = {};
      txn.metadata.verification_failed_at = new Date().toISOString();
      txn.metadata.verification_message = verifyResult.message;
      db.saveDatabase();
      return res.status(400).json({
        error: 'We could not confirm this payment yet. If you were debited, please try verifying again shortly or contact support.',
      });
    }

    // 5. Amount and currency check
    if (Math.abs(verifyResult.amount - txn.amount) > 1) {
      txn.status = 'failed';
      txn.metadata = { ...txn.metadata, amount_mismatch: true, paystack_amount: verifyResult.amount, expected: txn.amount };
      db.saveDatabase();
      return res.status(400).json({ error: 'Amount mismatch detected. Cannot credit wallet.' });
    }

    if (verifyResult.currency && verifyResult.currency.toUpperCase() !== 'NGN') {
      txn.status = 'failed';
      txn.metadata = { ...txn.metadata, currency_mismatch: true, paystack_currency: verifyResult.currency };
      db.saveDatabase();
      return res.status(400).json({ error: 'Invalid transaction currency' });
    }

    // 6. Atomic balance credit & ledger update
    const user = db.findUserById(txn.user_id);
    if (!user) {
      return res.status(404).json({ error: 'Customer account not found' });
    }

    const oldBalance = user.wallet_balance;
    const newBalance = oldBalance + txn.amount;
    user.wallet_balance = newBalance;
    user.updated_at = new Date().toISOString();

    txn.status = 'successful';
    txn.balance_before = oldBalance;
    txn.balance_after = newBalance;
    txn.metadata = {
      ...txn.metadata,
      verified_at: new Date().toISOString(),
      channel: verifyResult.channel || 'paystack_online',
      paystack_paid_at: verifyResult.paid_at,
    };

    db.saveDatabase();

    db.logAudit('PAYSTACK_PAYMENT_VERIFIED', {
      reference,
      amount: txn.amount,
      userId: user.id,
      email: user.email,
    }, user.id, user.email);

    db.addNotification(
      user.id,
      'Wallet Credited (Paystack)',
      `₦${txn.amount.toLocaleString()} was successfully credited to your wallet via Paystack. Reference: ${reference}.`,
      'success'
    );

    res.json({
      success: true,
      settled: true,
      status: 'successful',
      amount: txn.amount,
      message: `Wallet credited with ₦${txn.amount.toLocaleString()} successfully!`,
      balance: user.wallet_balance,
      transaction: txn,
    });
  } catch (error: any) {
    res.status(500).json({ error: sanitizeCustomerError(error?.message) });
  }
}

walletRouter.post('/paystack/verify', requireAuth, handlePaystackVerify);
walletRouter.post('/fund/verify', requireAuth, handlePaystackVerify);

// POST /api/wallet/paystack/webhook
// Webhook endpoint with strict HMAC SHA512 signature validation & duplicate event protection
walletRouter.post('/paystack/webhook', (req: any, res) => {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    const paystack = new PaystackAdapter();
    const rawPayload = req.rawBody || JSON.stringify(req.body);

    if (!signature || !paystack.validateWebhookSignature(rawPayload, signature)) {
      console.warn('[Paystack Webhook] Signature verification failed');
      return res.status(401).json({ error: 'Invalid Paystack webhook signature' });
    }

    const event = req.body;
    if (event?.event === 'charge.success' && event?.data) {
      const data = event.data;
      const reference = String(data.reference || '').trim();
      const amountInNaira = data.amount ? Number(data.amount) / 100 : 0;
      const currency = String(data.currency || 'NGN').toUpperCase();

      if (!reference || amountInNaira <= 0 || currency !== 'NGN') {
        return res.status(200).json({ status: 'ignored_invalid_payload' });
      }

      // Find ledger entry
      const txn = db.data.transactions.find(t => t.reference === reference);
      if (txn) {
        if (txn.gateway !== 'paystack') {
          return res.status(200).json({ status: 'ignored_gateway_mismatch' });
        }

        // Idempotency check: if already successful, do not credit twice
        if (txn.status === 'successful') {
          return res.status(200).json({ status: 'success', message: 'Transaction already processed (Idempotent)' });
        }

        if (amountInNaira + 1 < txn.amount) {
          txn.status = 'failed';
          txn.metadata = { ...txn.metadata, underpayment_webhook: true, paystack_amount: amountInNaira };
          db.saveDatabase();
          return res.status(400).json({ error: 'Paystack webhook underpayment rejected' });
        }

        const user = db.findUserById(txn.user_id);
        if (user) {
          const oldBalance = user.wallet_balance;
          const creditAmount = txn.amount;
          user.wallet_balance = oldBalance + creditAmount;
          user.updated_at = new Date().toISOString();

          txn.status = 'successful';
          txn.balance_before = oldBalance;
          txn.balance_after = user.wallet_balance;
          txn.metadata = {
            ...txn.metadata,
            webhook_processed_at: new Date().toISOString(),
            paystack_channel: data.channel,
          };

          db.saveDatabase();

          db.logAudit('PAYSTACK_WEBHOOK_CREDIT', {
            reference,
            amount: creditAmount,
            userId: user.id,
          }, user.id, user.email);

          db.addNotification(
            user.id,
            'Wallet Credited via Paystack',
            `₦${creditAmount.toLocaleString()} received via Paystack webhook. New balance: ₦${user.wallet_balance.toLocaleString()}.`,
            'success'
          );
        }
      }
    }

    res.status(200).json({ status: 'success' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Webhook processing failed' });
  }
});

// -------------------------------------------------------------
// 3. MANUAL WALLET FUNDING (DISCONTINUED — PAYSTACK ONLY)
// -------------------------------------------------------------

// POST /api/wallet/manual-funding - Discontinued
walletRouter.post('/manual-funding', requireAuth, (_req: any, res) => {
  return res.status(410).json({
    error: 'Direct Bank Transfer and Bank Transfer Proof submission have been discontinued. Please fund your wallet via Paystack.',
  });
});

// -------------------------------------------------------------
// 4. ADMIN MANUAL PAYMENT APPROVAL & REJECTION (DISCONTINUED)
// -------------------------------------------------------------

// GET /api/wallet/admin/pending-fundings
walletRouter.get('/admin/pending-fundings', requireAdmin, (_req, res) => {
  res.json({
    success: true,
    count: 0,
    pending: [],
  });
});

// POST /api/wallet/admin/approve-funding/:id - Discontinued
walletRouter.post('/admin/approve-funding/:id', requireAdmin, (_req: any, res) => {
  return res.status(410).json({
    success: false,
    error: 'Manual funding approval workflows have been discontinued. Paystack is the sole active wallet funding method. Historical records remain preserved for audit.',
  });
});

// POST /api/wallet/admin/reject-funding/:id - Discontinued
walletRouter.post('/admin/reject-funding/:id', requireAdmin, (_req: any, res) => {
  return res.status(410).json({
    success: false,
    error: 'Manual funding rejection workflows have been discontinued. Paystack is the sole active wallet funding method. Historical records remain preserved for audit.',
  });
});

// -------------------------------------------------------------
// 5. ADMIN DIRECT WALLET CONTROLS (CREDIT / DEBIT)
// -------------------------------------------------------------

// POST /api/wallet/admin/adjust-balance
walletRouter.post('/admin/adjust-balance', requireAdmin, (req: any, res) => {
  try {
    const { customerId, type, amount, reason } = req.body;
    const numAmount = Number(amount);

    if (!customerId) {
      return res.status(400).json({ error: 'Target customer ID is required' });
    }
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Adjustment amount must be a positive number' });
    }
    if (!['credit', 'debit'].includes(type)) {
      return res.status(400).json({ error: 'Adjustment type must be credit or debit' });
    }
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: 'A descriptive reason (min 5 chars) is mandatory for regulatory audit compliance' });
    }

    const user = db.findUserById(customerId);
    if (!user) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const delta = type === 'credit' ? numAmount : -numAmount;

    // Concurrency / negative balance prevention
    if (delta < 0 && user.wallet_balance + delta < 0) {
      return res.status(400).json({
        error: `Cannot debit ₦${numAmount.toLocaleString()}. Customer available balance is only ₦${user.wallet_balance.toLocaleString()}.`,
      });
    }

    const result = db.adjustBalance(
      user.id,
      delta,
      'manual_adjustment',
      `Admin ${type.toUpperCase()}: ₦${numAmount.toLocaleString()} - ${reason}`,
      'internal',
      {
        adminId: req.user.id,
        adminEmail: req.user.email,
        adminName: req.user.full_name,
        reason,
        timestamp: new Date().toISOString(),
      }
    );

    db.logAudit('ADMIN_DIRECT_WALLET_ADJUSTMENT', {
      targetUserId: user.id,
      targetEmail: user.email,
      type,
      amount: numAmount,
      reason,
      balanceBefore: result.transaction.balance_before,
      balanceAfter: result.transaction.balance_after,
      adminId: req.user.id,
      adminEmail: req.user.email,
    }, req.user.id, req.user.email);

    db.addNotification(
      user.id,
      type === 'credit' ? 'Wallet Credited by Admin' : 'Wallet Debited by Admin',
      `Your wallet was ${type === 'credit' ? 'credited with' : 'debited by'} ₦${numAmount.toLocaleString()}. Reason: ${reason}. Current Balance: ₦${user.wallet_balance.toLocaleString()}.`,
      type === 'credit' ? 'success' : 'warning'
    );

    res.json({
      success: true,
      message: `Customer wallet ${type === 'credit' ? 'credited' : 'debited'} with ₦${numAmount.toLocaleString()} successfully.`,
      newBalance: user.wallet_balance,
      transaction: result.transaction,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Balance adjustment failed' });
  }
});

// -------------------------------------------------------------
// 6. GATEWAY MANAGEMENT (FLUTTERWAVE COMING SOON STATUS)
// -------------------------------------------------------------

// GET /api/wallet/gateways
walletRouter.get('/gateways', (req, res) => {
  res.json({
    activeGateway: paymentManager.getActiveGateway().getId(),
    gateways: paymentManager.getAllGateways(),
  });
});

// POST /api/wallet/admin/gateways/switch (Admin only)
walletRouter.post('/admin/gateways/switch', requireAdmin, (req: any, res) => {
  const { gatewayId } = req.body;
  if (!gatewayId) {
    return res.status(400).json({ error: 'Gateway ID is required' });
  }

  const normalizedId = String(gatewayId).trim().toLowerCase();
  if (normalizedId !== 'paystack') {
    return res.status(400).json({
      error: 'Only Paystack is supported as an automated online payment gateway.',
    });
  }

  const gateway = paymentManager.getGateway(normalizedId);

  paymentManager.setActiveGateway(gatewayId);
  db.data.settings.active_payment_gateway = gatewayId as any;
  db.saveDatabase();

  db.logAudit('PAYMENT_GATEWAY_SWITCHED', { gatewayId }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Payment gateway set to ${gateway.getName()}`,
    activeGateway: gatewayId,
  });
});

// -------------------------------------------------------------
// 7. FINANCIAL REPORTS & AUDITS
// -------------------------------------------------------------

// GET /api/wallet/admin/financial-reports
walletRouter.get('/admin/financial-reports', requireAdmin, (req, res) => {
  const txns = db.data.transactions;
  const telecomOrders = db.data.telecom_orders || [];
  const verifications = db.data.verifications || [];

  // 1. Funding Totals
  const successfulFundings = txns.filter(t => t.category === 'funding' && t.status === 'successful');
  const paystackFunding = successfulFundings
    .filter(t => t.gateway === 'paystack')
    .reduce((sum, t) => sum + t.amount, 0);
  const manualFunding = successfulFundings
    .filter(t => t.gateway === 'manual_transfer')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalFunding = paystackFunding + manualFunding;

  // 2. Service Sales
  const telecomSales = telecomOrders
    .filter(o => o.status === 'successful')
    .reduce((sum, o) => sum + (o.amount || 0), 0);
  const telecomCost = telecomOrders
    .filter(o => o.status === 'successful')
    .reduce((sum, o) => sum + (o.cost_price || 0), 0);
  const telecomProfit = telecomSales - telecomCost;

  const idSales = verifications
    .filter(v => v.status === 'completed')
    .reduce((sum, v) => sum + (v.cost || 0), 0);
  const idCost = verifications
    .filter(v => v.status === 'completed')
    .reduce((sum, v) => sum + (v.provider_cost || v.cost * 0.75), 0);
  const idProfit = idSales - idCost;

  const totalServiceSales = telecomSales + idSales;
  const totalProviderCost = telecomCost + idCost;
  const grossProfit = telecomProfit + idProfit;

  // 3. Float In Circulation
  const totalCustomerFloat = db.data.users
    .filter(u => u.role === 'customer')
    .reduce((sum, u) => sum + u.wallet_balance, 0);

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    reports: {
      funding: {
        totalFunding,
        paystackFunding,
        manualFunding,
        fundingTransactionsCount: successfulFundings.length,
      },
      sales: {
        totalServiceSales,
        telecomSales,
        identityVerificationSales: idSales,
      },
      expenditure: {
        totalProviderExpenditure: totalProviderCost,
        telecomProviderCost: telecomCost,
        identityProviderCost: idCost,
      },
      profit: {
        grossProfit,
        profitMarginPercent: totalServiceSales > 0 ? Math.round((grossProfit / totalServiceSales) * 100) : 0,
      },
      float: {
        totalCustomerFloat,
        totalCustomers: db.data.users.filter(u => u.role === 'customer').length,
      },
    },
  });
});

// -------------------------------------------------------------
// 8. PAYSTACK DEDICATED VIRTUAL ACCOUNTS (DVA)
// -------------------------------------------------------------

// GET /api/wallet/virtual-account
walletRouter.get('/virtual-account', requireAuth, (req: any, res) => {
  const syncPending = req.query.sync === '1' || req.query.sync === 'true' || req.query.sync_pending === '1';
  const state = buildCustomerVirtualAccountState(req.user, syncPending);
  res.json(state);
});

// GET /api/wallet/virtual-account/banks
walletRouter.get('/virtual-account/banks', requireAuth, (_req: any, res) => {
  res.json({
    success: true,
    banks: NIGERIAN_DVA_BANKS,
  });
});

// POST /api/wallet/virtual-account/provision
walletRouter.post('/virtual-account/provision', requireAuth, (req: any, res) => {
  if (!requireVerifiedEmail(req, res)) return;
  try {
    const result = provisionCustomerVirtualAccount(req.user, req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to provision Paystack Dedicated Virtual Account right now.' });
  }
});

