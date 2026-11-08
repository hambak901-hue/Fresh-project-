/**
 * @file wallet.ts
 * Wallet management, balance inquiries, funding, and ledger transactions.
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { parseToken } from './auth.js';

export const walletRouter = Router();

// Middleware to extract user
function requireAuth(req: any, res: any, next: any) {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist' });
  }
  req.user = user;
  next();
}

// GET /api/wallet/summary
walletRouter.get('/summary', requireAuth, (req: any, res) => {
  const user = req.user;
  const userTxns = db.data.transactions.filter(t => t.user_id === user.id);
  const totalSpent = userTxns
    .filter(t => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalFunded = userTxns
    .filter(t => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  res.json({
    balance: user.wallet_balance,
    currency: 'NGN',
    totalSpent,
    totalFunded,
    transactionCount: userTxns.length,
    recentTransactions: userTxns.slice(0, 10),
    bankDetails: {
      accountName: db.data.settings.bank_transfer_account_name,
      bank: db.data.settings.bank_transfer_bank,
      accountNumber: db.data.settings.bank_transfer_account_number,
    },
  });
});

// POST /api/wallet/fund (Simulated & gateway webhook ready)
walletRouter.post('/fund', requireAuth, (req: any, res) => {
  const { amount, gateway, reference } = req.body;
  const numAmount = Number(amount);

  if (!numAmount || numAmount < 100) {
    return res.status(400).json({ error: 'Minimum funding amount is ₦100' });
  }

  const selectedGateway = gateway || 'flutterwave';
  const ref = reference || `FLW_TXN_${Date.now()}`;

  const { user, transaction } = db.adjustBalance(
    req.user.id,
    numAmount,
    'funding',
    `Wallet credited with ₦${numAmount.toLocaleString()} via ${selectedGateway}`,
    selectedGateway,
    { reference: ref, gateway: selectedGateway }
  );

  db.addNotification(
    user.id,
    'Wallet Credited',
    `Your wallet was successfully credited with ₦${numAmount.toLocaleString()}. Current balance: ₦${user.wallet_balance.toLocaleString()}.`,
    'success'
  );

  res.json({
    success: true,
    message: `Wallet credited with ₦${numAmount.toLocaleString()}`,
    balance: user.wallet_balance,
    transaction,
  });
});

// GET /api/wallet/transactions
walletRouter.get('/transactions', requireAuth, (req: any, res) => {
  const userTxns = db.data.transactions.filter(t => t.user_id === req.user.id);
  res.json({
    transactions: userTxns,
  });
});
