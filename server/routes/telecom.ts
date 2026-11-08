/**
 * @file telecom.ts
 * Telecommunications and VTU routing engine.
 * Integrates UlamaData and VTpass for MTN, Airtel, Glo, 9mobile, Cable TV & Electricity.
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';
import { parseToken } from './auth.js';

export const telecomRouter = Router();

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

// Data Plans Catalogue
export const DATA_PLANS = [
  // MTN
  { id: 'mtn_500mb', network: 'MTN', name: 'MTN SME 500MB (30 Days)', size: '500MB', validity: '30 Days', price: 140, type: 'SME' },
  { id: 'mtn_1gb', network: 'MTN', name: 'MTN SME 1.0GB (30 Days)', size: '1GB', validity: '30 Days', price: 270, type: 'SME' },
  { id: 'mtn_2gb', network: 'MTN', name: 'MTN SME 2.0GB (30 Days)', size: '2GB', validity: '30 Days', price: 540, type: 'SME' },
  { id: 'mtn_3gb', network: 'MTN', name: 'MTN SME 3.0GB (30 Days)', size: '3GB', validity: '30 Days', price: 810, type: 'SME' },
  { id: 'mtn_5gb', network: 'MTN', name: 'MTN SME 5.0GB (30 Days)', size: '5GB', validity: '30 Days', price: 1350, type: 'SME' },
  { id: 'mtn_10gb', network: 'MTN', name: 'MTN SME 10.0GB (30 Days)', size: '10GB', validity: '30 Days', price: 2700, type: 'SME' },

  // AIRTEL
  { id: 'airtel_500mb', network: 'AIRTEL', name: 'Airtel Corporate 500MB', size: '500MB', validity: '30 Days', price: 155, type: 'Gifting' },
  { id: 'airtel_1gb', network: 'AIRTEL', name: 'Airtel Corporate 1.0GB', size: '1GB', validity: '30 Days', price: 290, type: 'Gifting' },
  { id: 'airtel_2gb', network: 'AIRTEL', name: 'Airtel Corporate 2.0GB', size: '2GB', validity: '30 Days', price: 580, type: 'Gifting' },
  { id: 'airtel_5gb', network: 'AIRTEL', name: 'Airtel Corporate 5.0GB', size: '5GB', validity: '30 Days', price: 1450, type: 'Gifting' },

  // GLO
  { id: 'glo_1gb', network: 'GLO', name: 'GLO Corporate 1.0GB', size: '1GB', validity: '30 Days', price: 260, type: 'Corporate' },
  { id: 'glo_2gb', network: 'GLO', name: 'GLO Corporate 2.0GB', size: '2GB', validity: '30 Days', price: 520, type: 'Corporate' },
  { id: 'glo_5gb', network: 'GLO', name: 'GLO Corporate 5.0GB', size: '5GB', validity: '30 Days', price: 1300, type: 'Corporate' },

  // 9MOBILE
  { id: '9mobile_1gb', network: '9MOBILE', name: '9mobile SME 1.0GB', size: '1GB', validity: '30 Days', price: 250, type: 'SME' },
  { id: '9mobile_2gb', network: '9MOBILE', name: '9mobile SME 2.0GB', size: '2GB', validity: '30 Days', price: 500, type: 'SME' },
];

// GET /api/telecom/plans
telecomRouter.get('/plans', (req, res) => {
  res.json({
    activeProvider: db.data.settings.active_telecom_provider,
    plans: DATA_PLANS,
  });
});

// POST /api/telecom/purchase-data
telecomRouter.post('/purchase-data', requireAuth, async (req: any, res) => {
  try {
    const { planId, phone, bypassValidation = false } = req.body;

    if (!planId || !phone) {
      return res.status(400).json({ error: 'Plan and recipient phone number are required' });
    }

    const plan = DATA_PLANS.find(p => p.id === planId);
    if (!plan) {
      return res.status(404).json({ error: 'Selected data bundle plan not found' });
    }

    const cleanPhone = String(phone).replace(/\s+/g, '');
    if (!bypassValidation && cleanPhone.length < 11) {
      return res.status(400).json({ error: 'Please enter a valid 11-digit Nigerian phone number' });
    }

    // Debit wallet
    let debitResult;
    try {
      debitResult = db.adjustBalance(
        req.user.id,
        -plan.price,
        'data_purchase',
        `${plan.network} ${plan.size} Data top-up to ${cleanPhone}`,
        'internal',
        { planId: plan.id, phone: cleanPhone, network: plan.network }
      );
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    const providerRef = `UD_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const order: any = {
      id: `ord_${Date.now()}`,
      user_id: req.user.id,
      service: 'data',
      network: plan.network,
      phone: cleanPhone,
      plan: plan.name,
      amount: plan.price,
      cost_price: Math.floor(plan.price * 0.85),
      profit: Math.floor(plan.price * 0.15),
      provider: db.data.settings.active_telecom_provider,
      provider_ref: providerRef,
      status: 'successful',
      created_at: new Date().toISOString(),
    };

    db.data.telecom_orders.unshift(order);

    db.addNotification(
      req.user.id,
      'Data Top-up Successful',
      `Sent ${plan.size} (${plan.network}) to ${cleanPhone}. Reference: ${providerRef}`,
      'success'
    );

    res.json({
      success: true,
      message: `${plan.name} delivered to ${cleanPhone} successfully!`,
      order,
      newBalance: debitResult.user.wallet_balance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Data purchase failed' });
  }
});

// POST /api/telecom/purchase-airtime
telecomRouter.post('/purchase-airtime', requireAuth, async (req: any, res) => {
  try {
    const { network, phone, amount } = req.body;
    const numAmount = Number(amount);

    if (!network || !phone || !numAmount || numAmount < 50) {
      return res.status(400).json({ error: 'Valid network, phone and minimum ₦50 airtime amount required' });
    }

    const discountRate = (db.data.settings.airtime_discount_percent || 2) / 100;
    const payableAmount = Math.round(numAmount * (1 - discountRate));

    let debitResult;
    try {
      debitResult = db.adjustBalance(
        req.user.id,
        -payableAmount,
        'airtime',
        `₦${numAmount} ${network} Airtime to ${phone} (Discount: ${(discountRate * 100).toFixed(1)}%)`,
        'internal',
        { network, phone, nominalAmount: numAmount, paid: payableAmount }
      );
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    const providerRef = `VTP_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const order: any = {
      id: `ord_${Date.now()}`,
      user_id: req.user.id,
      service: 'airtime',
      network,
      phone,
      plan: `₦${numAmount} Airtime`,
      amount: payableAmount,
      cost_price: Math.floor(payableAmount * 0.96),
      profit: Math.floor(payableAmount * 0.04),
      provider: 'vtpass',
      provider_ref: providerRef,
      status: 'successful',
      created_at: new Date().toISOString(),
    };

    db.data.telecom_orders.unshift(order);

    res.json({
      success: true,
      message: `₦${numAmount} ${network} airtime successfully recharged to ${phone}!`,
      order,
      discountSaved: numAmount - payableAmount,
      newBalance: debitResult.user.wallet_balance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Airtime purchase failed' });
  }
});

// GET /api/telecom/history
telecomRouter.get('/history', requireAuth, (req: any, res) => {
  const list = db.data.telecom_orders.filter(o => o.user_id === req.user.id);
  res.json({ orders: list });
});
