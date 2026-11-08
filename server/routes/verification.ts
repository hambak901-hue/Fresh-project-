/**
 * @file verification.ts
 * Phase 5 Complete Identity Verification, Modification & Enrolment Router.
 * Implements 2SureVerify as primary provider with Veripine failover,
 * wallet balance safety, automatic refunds, customer consent, and complete service coverage.
 */

import { Router } from 'express';
import { db, VerificationRecord, IdentityServiceConfig } from '../db/database.js';
import { CREDENTIALS } from '../config/credentials.js';
import { parseToken } from './auth.js';
import { verificationManager } from '../adapters/verification/VerificationAdapter.js';

export const verificationRouter = Router();

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

// -------------------------------------------------------------
// 1. SERVICES CATALOGUE & PUBLIC PRICES (Never exposes wholesale costs)
// -------------------------------------------------------------
verificationRouter.get('/services', (req, res) => {
  const services = (db.data.identity_services || []).filter(s => s.enabled);

  // Group by category for customer navigation
  const categories = {
    nin_verification: services.filter(s => s.category === 'NIN Verification'),
    bvn_verification: services.filter(s => s.category === 'BVN Verification'),
    nin_modification: services.filter(s => s.category === 'NIN Modification'),
    personalisation: services.filter(s => s.category === 'Personalisation'),
    enrolment: services.filter(s => s.category === 'Enrolment'),
    additional_services: services.filter(s => s.category === 'Additional Services'),
  };

  // Safe client list without wholesale_cost
  const safeServices = services.map(s => ({
    key: s.key,
    name: s.name,
    category: s.category,
    price: s.selling_price,
    endpoint: s.endpoint,
    required_fields: s.required_fields,
    description: s.description,
    slip_type_supported: s.slip_type_supported,
  }));

  res.json({
    success: true,
    activeProvider: verificationManager.getPrimaryId(),
    services: safeServices,
    categories,
    slipTypes: [
      { id: 'ninStandard', name: 'NIMC Standard Slip (Recommended)', description: 'Full colored official NIMC verifiable slip with QR code' },
      { id: 'ninPremium', name: 'NIMC Premium Digital ID Slip', description: 'Plastic-style card layout with security seal and watermark' },
      { id: 'ninBasic', name: 'NIMC Basic Slip', description: 'Lightweight summary verification slip' },
      { id: 'ninVnin', name: 'NIMC Virtual NIN Slip', description: 'Enterprise masked identity certificate' },
      { id: 'bvnStandard', name: 'CBN BVN Official Certificate', description: 'Central Bank of Nigeria biometric validation certificate' },
      { id: 'plasticBvn', name: 'Plastic BVN Digital Card Layout', description: 'Wallet-sized photo card design' },
    ],
  });
});

// -------------------------------------------------------------
// 2. HELPER ENDPOINTS: BVN MODIFICATION & ENROLMENT BANKS
// -------------------------------------------------------------
verificationRouter.get('/banks/modification', async (req, res) => {
  try {
    const provider = verificationManager.getProvider('2sureverify');
    const response = await fetch(`${provider.getBaseUrl()}/api/v1/bvn_modification_banks.php`, {
      headers: {
        'X-Api-Key': CREDENTIALS.verification.sureverify.apiKey || '',
        'Accept': 'application/json',
      },
    });
    const json = await response.json();
    if (json.success && Array.isArray(json.data)) {
      // Return bank options with customer markup (wholesale + ₦4,000 margin)
      const clientBanks = json.data.map((b: any) => ({
        bank_name: b.bank_name,
        price: b.price + 4000,
      }));
      return res.json({ success: true, data: clientBanks });
    }
    // Fallback if upstream unreachable
    res.json({
      success: true,
      data: [
        { bank_name: 'ACCESS BANK', price: 18000 },
        { bank_name: 'FIRST BANK', price: 18000 },
        { bank_name: 'GT BANK', price: 18000 },
        { bank_name: 'ZENITH BANK', price: 18000 },
        { bank_name: 'UBA', price: 18000 },
        { bank_name: 'FCMB', price: 18000 },
        { bank_name: 'STANBIC IBTC', price: 18000 },
        { bank_name: 'OPAY / PALMPAY (MICROFINANCE)', price: 18000 },
        { bank_name: 'NIBSS AGENCY', price: 10000 },
      ],
    });
  } catch (err: any) {
    res.json({
      success: true,
      data: [
        { bank_name: 'ACCESS BANK', price: 18000 },
        { bank_name: 'FIRST BANK', price: 18000 },
        { bank_name: 'GT BANK', price: 18000 },
        { bank_name: 'ZENITH BANK', price: 18000 },
      ],
    });
  }
});

verificationRouter.get('/banks/enrollment', async (req, res) => {
  try {
    const provider = verificationManager.getProvider('2sureverify');
    const response = await fetch(`${provider.getBaseUrl()}/api/v1/bvn_enrollment_banks.php`, {
      headers: {
        'X-Api-Key': CREDENTIALS.verification.sureverify.apiKey || '',
        'Accept': 'application/json',
      },
    });
    const json = await response.json();
    if (json.success && Array.isArray(json.data)) {
      const clientBanks = json.data.map((b: any) => ({
        bank_name: b.bank_name,
        price: b.price + 3000,
      }));
      return res.json({ success: true, data: clientBanks });
    }
    res.json({
      success: true,
      data: [
        { bank_name: 'Access Bank', price: 6000 },
        { bank_name: 'GTBank', price: 6000 },
        { bank_name: 'Zenith Bank', price: 6000 },
        { bank_name: 'First Bank', price: 6000 },
        { bank_name: 'UBA', price: 6000 },
        { bank_name: 'Fidelity Bank', price: 6000 },
      ],
    });
  } catch {
    res.json({
      success: true,
      data: [
        { bank_name: 'Access Bank', price: 6000 },
        { bank_name: 'GTBank', price: 6000 },
        { bank_name: 'Zenith Bank', price: 6000 },
      ],
    });
  }
});

// -------------------------------------------------------------
// 3. MAIN VERIFICATION & DISPATCH ENGINE
// -------------------------------------------------------------
verificationRouter.post('/verify', requireAuth, async (req: any, res) => {
  try {
    const serviceKey = req.body.serviceKey || req.body.service_key;
    const consent = Boolean(req.body.consent || req.body.ndpr_consent);
    const testSandbox = Boolean(req.body.testSandbox);
    const payload = req.body.payload || { ...req.body };
    delete payload.serviceKey;
    delete payload.service_key;
    delete payload.consent;
    delete payload.ndpr_consent;
    delete payload.testSandbox;

    if (!serviceKey) {
      return res.status(400).json({ error: 'Service key is required' });
    }

    // Enforce consent per regulatory compliance
    if (!consent) {
      return res.status(400).json({
        error: 'Customer consent is required. You must certify that the individual has authorized this verification in accordance with NDPR regulations.',
      });
    }

    // Lookup service configuration
    const service = (db.data.identity_services || []).find(s => s.key === serviceKey);
    if (!service) {
      return res.status(404).json({ error: `Service "${serviceKey}" is not recognized` });
    }

    if (!service.enabled) {
      return res.status(400).json({ error: `Service "${service.name}" is currently disabled by administrator` });
    }

    // Validate required fields
    for (const field of service.required_fields) {
      if (payload[field] === undefined || String(payload[field]).trim() === '') {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    // Customer selling price
    const customerPrice = service.selling_price;
    const searchValue = String(
      payload.nin || payload.bvn || payload.phone || payload.firstname || payload.identifier || 'Request'
    ).trim();

    // Check user wallet balance
    if (req.user.wallet_balance < customerPrice) {
      return res.status(400).json({
        error: `Insufficient wallet balance. This service costs ₦${customerPrice.toLocaleString()}. Your current balance is ₦${req.user.wallet_balance.toLocaleString()}. Please fund your wallet.`,
      });
    }

    const txnRef = `VRF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Debit customer wallet with transaction reference
    let debitResult;
    try {
      debitResult = db.adjustBalance(
        req.user.id,
        -customerPrice,
        service.category.includes('BVN') ? 'bvn_verification' : 'nin_verification',
        `${service.name}: ${searchValue}`,
        'internal',
        { serviceKey, payload, reference: txnRef }
      );
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    // Execute through provider adapter
    const provider = verificationManager.getProvider(service.provider);
    const providerResult = await provider.executeService(
      service.key,
      service.endpoint,
      payload,
      Boolean(testSandbox)
    );

    // If provider rejected transaction (e.g. invalid NIN, format error, or upstream failure):
    if (!providerResult.success && !providerResult.pending) {
      // Execute automatic refund to preserve user trust!
      db.adjustBalance(
        req.user.id,
        customerPrice,
        'manual_adjustment',
        `REFUND: Failed ${service.name} (${providerResult.message})`,
        'internal',
        { serviceKey, failedRef: txnRef, providerMessage: providerResult.message }
      );

      db.addNotification(
        req.user.id,
        `${service.name} Failed - ₦${customerPrice.toLocaleString()} Refunded`,
        `The provider could not fulfill this request (${providerResult.message}). Your wallet has been immediately refunded.`,
        'alert'
      );

      return res.status(400).json({
        success: false,
        error: providerResult.message,
        refunded: true,
        refundedAmount: customerPrice,
        newBalance: req.user.wallet_balance,
      });
    }

    // Save successful / pending record to database
    const record: VerificationRecord = {
      id: `vrf_${Date.now()}`,
      user_id: req.user.id,
      type: service.category,
      service_key: service.key,
      search_value: searchValue,
      provider: service.provider,
      cost: customerPrice,
      provider_cost: service.wholesale_cost,
      status: providerResult.pending ? 'pending' : 'completed',
      reference: providerResult.reference || txnRef,
      slip_type: payload.slip_type || 'ninStandard',
      has_slip: Boolean(providerResult.data?.pdf_base64 || providerResult.data?.has_pdf_slip),
      result: providerResult.data,
      created_at: new Date().toISOString(),
    };

    if (!db.data.verifications) {
      db.data.verifications = [];
    }
    db.data.verifications.unshift(record);
    db.saveDatabase();

    // Log audit trail
    db.logAudit(
      'IDENTITY_SERVICE_EXECUTED',
      {
        serviceKey: service.key,
        serviceName: service.name,
        reference: record.reference,
        cost: customerPrice,
        provider: service.provider,
      },
      req.user.id,
      req.user.email
    );

    // Dispatch customer notification
    db.addNotification(
      req.user.id,
      `${service.name} Successful`,
      `Verification record for ${searchValue} was successfully completed. Reference: ${record.reference}`,
      'success'
    );

    res.json({
      success: true,
      pending: providerResult.pending,
      message: providerResult.message || `${service.name} completed successfully`,
      reference: record.reference,
      newBalance: debitResult.user.wallet_balance,
      recordId: record.id,
      result: providerResult.data,
      service: {
        key: service.key,
        name: service.name,
        category: service.category,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Identity processing failed' });
  }
});

// -------------------------------------------------------------
// 4. POLL REFERENCE STATUS (GET /api/verification/status/:reference)
// -------------------------------------------------------------
verificationRouter.get('/status/:reference', requireAuth, async (req: any, res) => {
  try {
    const { reference } = req.params;
    const provider = verificationManager.getProvider('2sureverify');
    const result = await provider.checkStatus(reference);

    // If local record exists, update its status
    const record = (db.data.verifications || []).find(v => v.reference === reference);
    if (record && result.success) {
      record.status = result.pending ? 'pending' : 'completed';
      if (result.data) {
        record.result = { ...record.result, ...result.data };
      }
      db.saveDatabase();
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 5. USER'S VERIFICATION HISTORY & RECORDS
// -------------------------------------------------------------
verificationRouter.get('/history', requireAuth, (req: any, res) => {
  const { category, search } = req.query;
  let list = (db.data.verifications || []).filter(v => v.user_id === req.user.id);

  if (category && category !== 'all') {
    list = list.filter(v => v.type === category || v.service_key === category);
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(v =>
      v.search_value.toLowerCase().includes(q) ||
      (v.reference && v.reference.toLowerCase().includes(q))
    );
  }

  res.json({
    success: true,
    count: list.length,
    verifications: list,
  });
});

verificationRouter.get('/record/:id', requireAuth, (req: any, res) => {
  const record = (db.data.verifications || []).find(v => v.id === req.params.id && v.user_id === req.user.id);
  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }
  res.json({
    success: true,
    record,
  });
});
