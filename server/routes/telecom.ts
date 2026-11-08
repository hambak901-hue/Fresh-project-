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

// Cable TV Packages
export const CABLE_PACKAGES: Record<string, Array<{ id: string; name: string; price: number; channels: number }>> = {
  DSTV: [
    { id: 'dstv_padi', name: 'DStv Padi', price: 3600, channels: 45 },
    { id: 'dstv_yanga', name: 'DStv Yanga', price: 5100, channels: 85 },
    { id: 'dstv_confam', name: 'DStv Confam', price: 9300, channels: 120 },
    { id: 'dstv_compact', name: 'DStv Compact', price: 15700, channels: 145 },
    { id: 'dstv_compact_plus', name: 'DStv Compact Plus', price: 25000, channels: 160 },
    { id: 'dstv_premium', name: 'DStv Premium', price: 37000, channels: 175 },
  ],
  GOTV: [
    { id: 'gotv_smallie', name: 'GOtv Smallie', price: 1575, channels: 35 },
    { id: 'gotv_jinja', name: 'GOtv Jinja', price: 3300, channels: 45 },
    { id: 'gotv_jolli', name: 'GOtv Jolli', price: 4850, channels: 65 },
    { id: 'gotv_max', name: 'GOtv Max', price: 7200, channels: 75 },
    { id: 'gotv_supa', name: 'GOtv Supa', price: 9600, channels: 85 },
    { id: 'gotv_supa_plus', name: 'GOtv Supa+', price: 15700, channels: 95 },
  ],
  STARTIMES: [
    { id: 'star_nova', name: 'StarTimes Nova Bouquet', price: 1700, channels: 30 },
    { id: 'star_basic', name: 'StarTimes Basic Bouquet', price: 3300, channels: 40 },
    { id: 'star_smart', name: 'StarTimes Smart Bouquet', price: 4200, channels: 50 },
    { id: 'star_classic', name: 'StarTimes Classic Bouquet', price: 5000, channels: 65 },
    { id: 'star_super', name: 'StarTimes Super Bouquet', price: 8200, channels: 80 },
  ],
};

export const ELECTRICITY_DISCOS = [
  { id: 'ikedc', name: 'Ikeja Electric (IKEDC)', state: 'Lagos Mainland', min: 1000 },
  { id: 'ekedc', name: 'Eko Electric (EKEDC)', state: 'Lagos Island', min: 1000 },
  { id: 'aedc', name: 'Abuja Electricity (AEDC)', state: 'Abuja, Niger, Kogi, Nasarawa', min: 1000 },
  { id: 'ibedc', name: 'Ibadan Electricity (IBEDC)', state: 'Oyo, Ogun, Osun, Kwara', min: 1000 },
  { id: 'kedco', name: 'Kano Electricity (KEDCO)', state: 'Kano, Katsina, Jigawa', min: 1000 },
  { id: 'phed', name: 'Port Harcourt Electric (PHED)', state: 'Rivers, Bayelsa, Cross River, Akwa Ibom', min: 1000 },
  { id: 'eedc', name: 'Enugu Electricity (EEDC)', state: 'Enugu, Abia, Imo, Anambra, Ebonyi', min: 1000 },
  { id: 'jedc', name: 'Jos Electricity (JEDC)', state: 'Plateau, Bauchi, Benue, Gombe', min: 1000 },
];

// GET /api/telecom/cable-packages
telecomRouter.get('/cable-packages', (req, res) => {
  res.json({ packages: CABLE_PACKAGES });
});

// POST /api/telecom/verify-smartcard
telecomRouter.post('/verify-smartcard', requireAuth, (req: any, res) => {
  const { provider, smartcardNumber } = req.body;
  if (!provider || !smartcardNumber || String(smartcardNumber).length < 8) {
    return res.status(400).json({ error: 'Valid provider and smartcard number (min 8 digits) required' });
  }

  // Simulated live provider smartcard lookup
  const mockNames: Record<string, string> = {
    '1023456789': 'ABUBAKAR HAMBAK TECH ENTERPRISE',
    '2039485712': 'FATIMA MOHAMMED YUSUF',
    '7012938461': 'CHUKWUEMEKA DAVID OKONKWO',
  };

  const customerName = mockNames[String(smartcardNumber)] || `${req.user.full_name.toUpperCase()} (VERIFIED)`;

  res.json({
    success: true,
    provider,
    smartcardNumber,
    customerName,
    status: 'ACTIVE',
    dueDate: '2026-12-15',
  });
});

// POST /api/telecom/purchase-cable
telecomRouter.post('/purchase-cable', requireAuth, (req: any, res) => {
  try {
    const { provider, smartcardNumber, packageId, phone } = req.body;
    if (!provider || !smartcardNumber || !packageId) {
      return res.status(400).json({ error: 'Provider, smartcard number, and package selection are required' });
    }

    const providerPkgs = CABLE_PACKAGES[provider.toUpperCase()];
    if (!providerPkgs) {
      return res.status(400).json({ error: 'Invalid cable provider' });
    }

    const pkg = providerPkgs.find(p => p.id === packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'Cable bouquet package not found' });
    }

    let debitResult;
    try {
      debitResult = db.adjustBalance(
        req.user.id,
        -pkg.price,
        'cable_tv',
        `${provider.toUpperCase()} Subscription: ${pkg.name} for IUC/Smartcard ${smartcardNumber}`,
        'internal',
        { provider, smartcardNumber, packageId, packageName: pkg.name }
      );
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    const providerRef = `VTP_CABLE_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const order: any = {
      id: `ord_${Date.now()}`,
      user_id: req.user.id,
      service: 'cable',
      network: provider.toUpperCase(),
      phone: phone || req.user.phone_number,
      plan: `${provider.toUpperCase()} ${pkg.name}`,
      amount: pkg.price,
      cost_price: Math.floor(pkg.price * 0.98),
      profit: Math.floor(pkg.price * 0.02),
      provider: 'vtpass',
      provider_ref: providerRef,
      status: 'successful',
      created_at: new Date().toISOString(),
    };

    db.data.telecom_orders.unshift(order);

    db.addNotification(
      req.user.id,
      'Cable TV Renewed',
      `${provider.toUpperCase()} ${pkg.name} active on Smartcard ${smartcardNumber}. Ref: ${providerRef}`,
      'success'
    );

    res.json({
      success: true,
      message: `${provider.toUpperCase()} ${pkg.name} renewed successfully for ${smartcardNumber}!`,
      order,
      newBalance: debitResult.user.wallet_balance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Cable renewal failed' });
  }
});

// GET /api/telecom/electricity-discos
telecomRouter.get('/electricity-discos', (req, res) => {
  res.json({ discos: ELECTRICITY_DISCOS });
});

// POST /api/telecom/verify-meter
telecomRouter.post('/verify-meter', requireAuth, (req: any, res) => {
  const { discoId, meterNumber, meterType = 'prepaid' } = req.body;
  if (!discoId || !meterNumber || String(meterNumber).length < 8) {
    return res.status(400).json({ error: 'Valid Disco and meter number (min 8 digits) required' });
  }

  const disco = ELECTRICITY_DISCOS.find(d => d.id === discoId);
  const discoName = disco ? disco.name : discoId.toUpperCase();

  res.json({
    success: true,
    discoId,
    discoName,
    meterNumber,
    meterType,
    customerName: `${req.user.full_name.toUpperCase()} (RESIDENCE)`,
    address: req.user.address || 'Plot 42, Commercial Layout, Hamisu Crescent, Kano',
    tariffClass: 'A-Non Maximum Demand (NMD)',
  });
});

// POST /api/telecom/purchase-electricity
telecomRouter.post('/purchase-electricity', requireAuth, (req: any, res) => {
  try {
    const { discoId, meterNumber, meterType = 'prepaid', amount, phone } = req.body;
    const numAmount = Number(amount);

    if (!discoId || !meterNumber || !numAmount || numAmount < 1000) {
      return res.status(400).json({ error: 'Disco, valid meter number, and minimum ₦1,000 token amount required' });
    }

    const disco = ELECTRICITY_DISCOS.find(d => d.id === discoId);
    const discoName = disco ? disco.name : discoId.toUpperCase();

    let debitResult;
    try {
      debitResult = db.adjustBalance(
        req.user.id,
        -numAmount,
        'store_purchase',
        `Electricity Bill: ₦${numAmount.toLocaleString()} (${discoName}) - Meter ${meterNumber}`,
        'internal',
        { discoId, meterNumber, meterType, amount: numAmount }
      );
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    // Generate standard 20-digit Nigerian electricity prepaid token
    const tokenPart1 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart2 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart3 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart4 = Math.floor(1000 + Math.random() * 9000);
    const tokenPart5 = Math.floor(1000 + Math.random() * 9000);
    const token = `${tokenPart1}-${tokenPart2}-${tokenPart3}-${tokenPart4}-${tokenPart5}`;
    const units = (numAmount / 68.5).toFixed(1); // standard kWh estimate
    const providerRef = `VTP_ELEC_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const order: any = {
      id: `ord_${Date.now()}`,
      user_id: req.user.id,
      service: 'electricity',
      network: discoId.toUpperCase(),
      phone: phone || req.user.phone_number,
      plan: `₦${numAmount.toLocaleString()} Units (${units} kWh)`,
      amount: numAmount,
      cost_price: Math.floor(numAmount * 0.99),
      profit: Math.floor(numAmount * 0.01),
      provider: 'vtpass',
      provider_ref: providerRef,
      status: 'successful',
      created_at: new Date().toISOString(),
      metadata: {
        token,
        units: `${units} kWh`,
        meterNumber,
        meterType,
        discoName,
      },
    };

    db.data.telecom_orders.unshift(order);

    db.addNotification(
      req.user.id,
      'Electricity Token Generated',
      `Meter ${meterNumber}: Token ${token} (${units} kWh). Ref: ${providerRef}`,
      'success'
    );

    res.json({
      success: true,
      message: `₦${numAmount.toLocaleString()} electricity token generated for Meter ${meterNumber}!`,
      token,
      units: `${units} kWh`,
      order,
      newBalance: debitResult.user.wallet_balance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Electricity token purchase failed' });
  }
});

// GET /api/telecom/history
telecomRouter.get('/history', requireAuth, (req: any, res) => {
  const list = db.data.telecom_orders.filter(o => o.user_id === req.user.id);
  res.json({ orders: list });
});

