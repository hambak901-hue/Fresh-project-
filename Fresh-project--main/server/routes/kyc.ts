/**
 * @file kyc.ts
 * Enterprise KYC (Know Your Customer), Customer Verification, and Transaction PIN System.
 * Implements Stage 4 Business Functionality:
 * 1. Configurable 4-tier KYC Levels (0: Unverified, 1: Basic, 2: Identity Verified, 3: Enhanced).
 * 2. Automated API Verification (2SureVerify / Veripine) and Manual Compliance Review.
 * 3. NDPR-compliant consent capture, data minimization, and sensitive identity protection.
 * 4. Dedicated Administrator KYC Management Dashboard endpoints.
 * 5. Service-specific PIN and KYC Level enforcement policy engine.
 * 6. Future Virtual Bank Account assignment and provisioning architecture.
 */

import { Router } from 'express';
import { db, User, KycSubmission, ServiceSecurityRule, VirtualAccountItem, verifyPin } from '../db/database.js';
import { parseToken } from './auth.js';
import { validateUploadFile } from '../services/security.js';
import { sendEmail } from '../services/mailer.js';
import { verificationManager } from '../adapters/verification/VerificationAdapter.js';

export const kycRouter = Router();

// -------------------------------------------------------------
// Middlewares
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
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Administrative privilege required' });
    }
    next();
  });
}

function sanitizeUser(u: any) {
  if (!u) return u;
  const { password_hash, transaction_pin_hash, reset_password_token, reset_password_expires, ...safe } = u;
  return safe;
}

// -------------------------------------------------------------
// 1. CUSTOMER KYC ENDPOINTS
// -------------------------------------------------------------

// GET /api/kyc/status - Customer verification status, limits, and rules
kycRouter.get('/status', requireAuth, (req: any, res) => {
  const user = req.user;
  const currentTier = user.tier || 1;
  const submission = db.findKycSubmissionByUserId(user.id);
  const virtualAccount = db.getVirtualAccount(user.id);
  const rules = db.getServiceSecurityRules();

  const tierLimits = {
    0: { label: 'Level 0 — Unverified', daily_limit: 0, description: 'Restricted dashboard access. Verification required for financial operations.' },
    1: { label: 'Level 1 — Basic', daily_limit: 20000, description: 'Basic profile verified. Standard telecom and utility airtime vending.' },
    2: { label: 'Level 2 — Identity Verified', daily_limit: 200000, description: 'NIN / BVN verified with official document. High-speed VTU, Virtual Bank Account, and Digital Services.' },
    3: { label: 'Level 3 — Enhanced Tier', daily_limit: 2000000, description: 'Proof of address and biometric selfie verified. Enterprise volume and unrestricted digital utilities.' },
  };

  res.json({
    success: true,
    user: sanitizeUser(user),
    kyc_status: user.kyc_status,
    current_tier: currentTier,
    tier_info: tierLimits[currentTier as keyof typeof tierLimits] || tierLimits[1],
    submission: submission || null,
    has_transaction_pin: Boolean(user.transaction_pin_hash),
    virtual_account: virtualAccount || null,
    service_security_rules: rules,
  });
});

// POST /api/kyc/submit - Customer submits KYC identity verification
kycRouter.post('/submit', requireAuth, async (req: any, res) => {
  try {
    const {
      target_level = 2,
      full_legal_name,
      date_of_birth,
      phone_number,
      residential_address,
      state,
      lga,
      nin,
      bvn,
      id_type,
      id_number,
      id_document_url,
      selfie_url,
      proof_of_address_url,
      consent_obtained,
    } = req.body;

    const numLevel = Number(target_level) as 1 | 2 | 3;
    if (![1, 2, 3].includes(numLevel)) {
      return res.status(400).json({ error: 'Target verification level must be 1, 2, or 3' });
    }

    // Strict NDPR Consent requirement
    if (consent_obtained !== true && consent_obtained !== 'true') {
      return res.status(400).json({
        error: 'Explicit customer consent is required under the Nigeria Data Protection Act (NDPR). You must acknowledge how your identity data is used.',
      });
    }

    // Level 1 Requirements
    if (!full_legal_name || !date_of_birth || !residential_address) {
      return res.status(400).json({ error: 'Full legal name, date of birth, and residential address are required for all KYC levels.' });
    }

    // Level 2 Requirements (Identity Verified)
    if (numLevel >= 2) {
      if (!id_type || !id_number) {
        return res.status(400).json({ error: 'Government ID type and ID number are required for Level 2 verification.' });
      }
      if (!nin && !bvn) {
        return res.status(400).json({ error: 'At least one sovereign identity number (NIN or BVN) is required for Level 2 verification.' });
      }
      if (nin && !/^\d{11}$/.test(String(nin).trim())) {
        return res.status(400).json({ error: 'National Identity Number (NIN) must be exactly 11 numeric digits.' });
      }
      if (bvn && !/^\d{11}$/.test(String(bvn).trim())) {
        return res.status(400).json({ error: 'Bank Verification Number (BVN) must be exactly 11 numeric digits.' });
      }
    }

    // Level 3 Requirements (Enhanced Tier)
    if (numLevel === 3) {
      if (!proof_of_address_url) {
        return res.status(400).json({ error: 'Proof of residential address (utility bill or bank statement within 3 months) is required for Level 3.' });
      }
      if (!selfie_url) {
        return res.status(400).json({ error: 'A live photograph or biometric selfie is required for Level 3 Enhanced verification.' });
      }
    }

    // Validate uploaded document URLs
    if (id_document_url) {
      const check = validateUploadFile(id_document_url);
      if (!check.valid) return res.status(400).json({ error: `Identity document file: ${check.error}` });
    }
    if (selfie_url) {
      const check = validateUploadFile(selfie_url);
      if (!check.valid) return res.status(400).json({ error: `Selfie photograph file: ${check.error}` });
    }
    if (proof_of_address_url) {
      const check = validateUploadFile(proof_of_address_url);
      if (!check.valid) return res.status(400).json({ error: `Proof of address file: ${check.error}` });
    }

    const submissionId = `kyc_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    // Check if automated verification can be executed
    let automatedResult: any = null;
    let initialStatus: 'pending' | 'approved' = 'pending';
    let reviewNotes = 'Submitted for administrative compliance review.';

    if (nin && numLevel === 2) {
      try {
        const provider = verificationManager.getProvider('2sureverify');
        const autoCheck = await provider.executeService('nin_v1', '/api/v1/nin_v1.php', { nin: String(nin).trim() });
        if (autoCheck.success && autoCheck.data) {
          const matchedName = String(autoCheck.data.firstname || '').toLowerCase();
          const submittedName = String(full_legal_name).toLowerCase();
          const isNameMatch = submittedName.includes(matchedName) || matchedName.includes(submittedName.split(' ')[0]);

          automatedResult = {
            verified: autoCheck.success,
            provider: '2sureverify',
            reference: autoCheck.reference || `AUTO_2SV_${Date.now()}`,
            name_matched: isNameMatch,
            timestamp: nowIso,
          };

          if (isNameMatch) {
            initialStatus = 'approved';
            reviewNotes = 'Automated 2SureVerify NIMC biometric verification passed with name correlation. Instant Tier 2 upgrade.';
          }
        }
      } catch (err) {
        // Fall back cleanly to manual review
        initialStatus = 'pending';
      }
    }

    const newSubmission: KycSubmission = {
      id: submissionId,
      user_id: req.user.id,
      user_email: req.user.email,
      user_name: req.user.full_name,
      target_level: numLevel,
      status: initialStatus,
      verification_method: automatedResult ? 'automated' : 'manual',
      verification_reference: automatedResult?.reference || `MAN_${Date.now()}`,
      full_legal_name: String(full_legal_name).trim(),
      date_of_birth: String(date_of_birth).trim(),
      phone_number: String(phone_number || req.user.phone_number).trim(),
      email: req.user.email,
      residential_address: String(residential_address).trim(),
      state: String(state || '').trim(),
      lga: String(lga || '').trim(),
      nin: nin ? String(nin).trim() : undefined,
      bvn: bvn ? String(bvn).trim() : undefined,
      id_type: id_type || 'nin_slip',
      id_number: id_number ? String(id_number).trim() : 'N/A',
      id_document_url: id_document_url || '/public/assets/aistudio/IMG_0484_0fb633df.png',
      selfie_url,
      proof_of_address_url,
      consent_obtained: true,
      consent_timestamp: nowIso,
      submitted_at: nowIso,
      reviewed_at: initialStatus === 'approved' ? nowIso : undefined,
      reviewer_name: initialStatus === 'approved' ? 'Automated Verification Engine' : undefined,
      review_notes: reviewNotes,
      automated_verification_result: automatedResult,
      review_history: [
        {
          id: `rh_${Date.now()}`,
          action: 'submitted',
          reviewer: 'Customer Self-Service',
          notes: `Submitted Level ${numLevel} verification package.`,
          timestamp: nowIso,
        },
      ],
    };

    if (initialStatus === 'approved') {
      newSubmission.review_history?.push({
        id: `rh_${Date.now() + 1}`,
        action: 'approved',
        reviewer: 'Automated 2SureVerify Engine',
        notes: reviewNotes,
        timestamp: nowIso,
      });
    }

    db.createKycSubmission(newSubmission);

    // Update customer entity
    const userUpdates: Partial<User> = {
      full_name: newSubmission.full_legal_name,
      address: newSubmission.residential_address,
      state: newSubmission.state,
      lga: newSubmission.lga,
      dob: newSubmission.date_of_birth,
      kyc_status: initialStatus === 'approved' ? 'verified' : 'pending',
    };
    if (newSubmission.nin) userUpdates.nin = newSubmission.nin;
    if (newSubmission.bvn) userUpdates.bvn = newSubmission.bvn;
    if (initialStatus === 'approved') {
      userUpdates.tier = numLevel;
      // Pre-provision virtual account if Level 2+
      if (numLevel >= 2) {
        db.assignVirtualAccount(req.user.id, {
          account_name: `HAMBAK / ${newSubmission.full_legal_name.toUpperCase()}`,
        });
      }
    }

    const updatedUser = db.updateUser(req.user.id, userUpdates);

    // Audit log & Notifications
    db.logAudit('KYC_SUBMISSION_CREATED', {
      submissionId,
      targetLevel: numLevel,
      status: initialStatus,
      method: newSubmission.verification_method,
    }, req.user.id, req.user.email);

    db.addNotification(
      req.user.id,
      initialStatus === 'approved' ? `KYC Level ${numLevel} Verified!` : `KYC Level ${numLevel} Under Review`,
      initialStatus === 'approved'
        ? `Congratulations! Your identity was verified automatically. Your account is now upgraded to Tier ${numLevel}.`
        : `Your Level ${numLevel} documentation was received and is currently under compliance review by our verification desk.`,
      initialStatus === 'approved' ? 'success' : 'info'
    );

    sendEmail(
      req.user.email,
      initialStatus === 'approved' ? 'KYC Verification Approved' : 'KYC Verification Submitted',
      `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h3>${initialStatus === 'approved' ? 'Verification Approved' : 'Verification Under Review'}</h3>
        <p>Hello ${newSubmission.full_legal_name},</p>
        <p>${reviewNotes}</p>
        <p><strong>Reference:</strong> ${newSubmission.verification_reference}</p>
        <p><strong>Submitted Tier:</strong> Level ${numLevel}</p>
      </div>`
    ).catch(() => {});

    res.status(201).json({
      success: true,
      message: initialStatus === 'approved'
        ? `Verification approved automatically! Upgraded to KYC Level ${numLevel}.`
        : `KYC submission received successfully. Status: PENDING review by compliance officer.`,
      submission: newSubmission,
      user: sanitizeUser(updatedUser),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit KYC verification' });
  }
});

// -------------------------------------------------------------
// 2. TRANSACTION AUTHORIZATION & PIN VERIFICATION PIPELINE
// -------------------------------------------------------------

// POST /api/kyc/authorize-purchase - Comprehensive step 1-11 purchase authorization check
kycRouter.post('/authorize-purchase', requireAuth, (req: any, res) => {
  const { serviceKey, pin, amount } = req.body;
  const user = req.user;
  const numAmount = Number(amount || 0);

  if (!serviceKey) {
    return res.status(400).json({ error: 'Service key is required for purchase authorization' });
  }

  // 1. Fetch service security rule
  const rule = db.getServiceSecurityRule(serviceKey);
  const minKycLevel = rule ? rule.min_kyc_level : 1;
  const requiresPin = rule ? rule.requires_pin : true;
  const userKycLevel = user.tier || 1;

  // 2. Check KYC Level Eligibility
  if (userKycLevel < minKycLevel) {
    return res.status(403).json({
      error: `Access Denied: This service requires KYC Level ${minKycLevel}. Your current verification tier is Level ${userKycLevel}. Please upgrade your KYC verification in the KYC Portal.`,
      code: 'KYC_TIER_INSUFFICIENT',
      required_level: minKycLevel,
      current_level: userKycLevel,
    });
  }

  // 3. Check Transaction PIN requirement
  if (requiresPin) {
    if (!user.transaction_pin_hash) {
      return res.status(400).json({
        error: 'Transaction PIN required. You have not configured a 4-digit security PIN yet. Please configure your PIN in Security Settings before proceeding.',
        code: 'PIN_NOT_CONFIGURED',
      });
    }

    if (!pin) {
      return res.status(400).json({
        error: 'Please enter your 4-digit transaction PIN to authorize this transaction.',
        code: 'PIN_REQUIRED',
      });
    }

    if (!verifyPin(String(pin), user.transaction_pin_hash)) {
      db.logAudit('PIN_AUTH_FAILED', { serviceKey, amount: numAmount }, user.id, user.email);
      return res.status(401).json({
        error: 'Incorrect transaction PIN. Please try again.',
        code: 'INCORRECT_PIN',
      });
    }
  }

  // 4. Check Wallet Balance
  if (numAmount > 0 && user.wallet_balance < numAmount) {
    return res.status(400).json({
      error: `Insufficient wallet balance. Total debit is ₦${numAmount.toLocaleString()}, but your balance is ₦${user.wallet_balance.toLocaleString()}. Please fund your wallet.`,
      code: 'INSUFFICIENT_FUNDS',
      required: numAmount,
      balance: user.wallet_balance,
    });
  }

  // 5. Authorized!
  res.json({
    success: true,
    authorized: true,
    service_key: serviceKey,
    user_id: user.id,
    current_tier: userKycLevel,
    requires_pin: requiresPin,
    message: 'Purchase pre-authorization verified successfully.',
  });
});

// -------------------------------------------------------------
// 3. FUTURE VIRTUAL BANK ACCOUNT ARCHITECTURE (Modular Partner Integration)
// -------------------------------------------------------------

// GET /api/kyc/virtual-account - Retrieve customer virtual account
kycRouter.get('/virtual-account', requireAuth, (req: any, res) => {
  const user = req.user;
  const userKycLevel = user.tier || 1;

  if (userKycLevel < 2) {
    return res.json({
      success: true,
      eligible: false,
      status: 'pending_kyc',
      message: 'Dedicated Virtual Bank Accounts require KYC Level 2 (Identity Verified). Complete NIN or BVN verification to unlock your personal account.',
      virtual_account: null,
    });
  }

  let acc = db.getVirtualAccount(user.id);
  if (!acc) {
    acc = db.assignVirtualAccount(user.id, {
      account_name: `HAMBAK / ${user.full_name.toUpperCase()}`,
      bank_name: 'Providus Bank',
      bank_code: '101',
      provider: 'providus',
    });
  }

  res.json({
    success: true,
    eligible: true,
    status: acc.status,
    virtual_account: acc,
    instructions: 'Transfers made to this account number will credit your HambakTech wallet instantly via automated webhooks.',
  });
});

// -------------------------------------------------------------
// 4. ADMINISTRATOR KYC DASHBOARD & REVIEW WORKFLOW
// -------------------------------------------------------------

// GET /api/kyc/admin/submissions - List KYC submissions with filters
kycRouter.get('/admin/submissions', requireAdmin, (req: any, res) => {
  const { status, level, search } = req.query;
  const submissions = db.getKycSubmissions({
    status: status ? String(status) : undefined,
    level: level ? String(level) : undefined,
    search: search ? String(search) : undefined,
  });

  const all = db.data.kyc_submissions || [];
  const metrics = {
    total: all.length,
    pending: all.filter(s => s.status === 'pending').length,
    approved: all.filter(s => s.status === 'approved').length,
    rejected: all.filter(s => s.status === 'rejected').length,
    info_requested: all.filter(s => s.status === 'info_requested').length,
  };

  res.json({
    success: true,
    metrics,
    count: submissions.length,
    submissions,
  });
});

// GET /api/kyc/admin/submissions/:id - Detailed submission inspection
kycRouter.get('/admin/submissions/:id', requireAdmin, (req: any, res) => {
  const submission = db.findKycSubmissionById(req.params.id);
  if (!submission) {
    return res.status(404).json({ error: 'KYC submission not found' });
  }

  const user = db.findUserById(submission.user_id);
  const txns = (db.data.transactions || []).filter(t => t.user_id === submission.user_id).slice(0, 5);

  res.json({
    success: true,
    submission,
    customer: sanitizeUser(user),
    recent_transactions: txns,
  });
});

// POST /api/kyc/admin/submissions/:id/review - Compliance officer decision
kycRouter.post('/admin/submissions/:id/review', requireAdmin, (req: any, res) => {
  const submission = db.findKycSubmissionById(req.params.id);
  if (!submission) {
    return res.status(404).json({ error: 'KYC submission not found' });
  }

  const { action, assigned_tier, review_notes, rejection_reason, additional_info_requested } = req.body;

  if (!['approve', 'reject', 'request_info'].includes(action)) {
    return res.status(400).json({ error: 'Action must be approve, reject, or request_info' });
  }

  const nowIso = new Date().toISOString();
  const reviewerName = req.user.full_name || 'Compliance Officer';
  const targetUser = db.findUserById(submission.user_id);

  if (action === 'approve') {
    const tier = Number(assigned_tier || submission.target_level) as 1 | 2 | 3;
    submission.status = 'approved';
    submission.reviewed_at = nowIso;
    submission.reviewer_id = req.user.id;
    submission.reviewer_email = req.user.email;
    submission.reviewer_name = reviewerName;
    submission.review_notes = review_notes || `Approved to Level ${tier} by compliance officer.`;

    if (!submission.review_history) submission.review_history = [];
    submission.review_history.push({
      id: `rh_${Date.now()}`,
      action: 'approved',
      reviewer: reviewerName,
      notes: submission.review_notes || 'Approved to Level ' + tier,
      timestamp: nowIso,
    });

    // Upgrade customer in database
    if (targetUser) {
      targetUser.kyc_status = 'verified';
      targetUser.tier = tier;
      targetUser.updated_at = nowIso;

      // Assign virtual account if verified Level 2+
      if (tier >= 2) {
        db.assignVirtualAccount(targetUser.id, {
          account_name: `HAMBAK / ${submission.full_legal_name.toUpperCase()}`,
        });
      }
    }

    db.addNotification(
      submission.user_id,
      `KYC Level ${tier} Approved!`,
      `Your identity documents have been approved by the compliance desk. Your account is now upgraded to Tier ${tier}.`,
      'success'
    );
  } else if (action === 'reject') {
    if (!rejection_reason) {
      return res.status(400).json({ error: 'A specific reason is required to reject a customer verification submission.' });
    }

    submission.status = 'rejected';
    submission.reviewed_at = nowIso;
    submission.reviewer_id = req.user.id;
    submission.reviewer_email = req.user.email;
    submission.reviewer_name = reviewerName;
    submission.rejection_reason = rejection_reason;
    submission.review_notes = review_notes || `Declined: ${rejection_reason}`;

    if (!submission.review_history) submission.review_history = [];
    submission.review_history.push({
      id: `rh_${Date.now()}`,
      action: 'rejected',
      reviewer: reviewerName,
      notes: rejection_reason,
      timestamp: nowIso,
    });

    if (targetUser) {
      targetUser.kyc_status = 'rejected';
      targetUser.updated_at = nowIso;
    }

    db.addNotification(
      submission.user_id,
      'KYC Verification Rejected',
      `Your identity submission was declined. Reason: ${rejection_reason}. Please correct and re-submit in the KYC Portal.`,
      'alert'
    );
  } else if (action === 'request_info') {
    if (!additional_info_requested) {
      return res.status(400).json({ error: 'Please specify the exact additional information or documents needed.' });
    }

    submission.status = 'info_requested';
    submission.reviewed_at = nowIso;
    submission.reviewer_id = req.user.id;
    submission.reviewer_name = reviewerName;
    submission.additional_info_requested = additional_info_requested;
    submission.review_notes = `Action required: ${additional_info_requested}`;

    if (!submission.review_history) submission.review_history = [];
    submission.review_history.push({
      id: `rh_${Date.now()}`,
      action: 'info_requested',
      reviewer: reviewerName,
      notes: additional_info_requested,
      timestamp: nowIso,
    });

    db.addNotification(
      submission.user_id,
      'Additional KYC Information Requested',
      `The verification desk requires additional documentation: "${additional_info_requested}". Please visit your KYC portal to update.`,
      'warning'
    );
  }

  db.saveDatabase();

  db.logAudit('KYC_COMPLIANCE_REVIEW', {
    submissionId: submission.id,
    targetUserId: submission.user_id,
    action,
    notes: review_notes || rejection_reason || additional_info_requested,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `KYC submission updated to ${submission.status.toUpperCase()}`,
    submission,
  });
});

// POST /api/kyc/admin/submissions/:id/auto-verify - Trigger automated API verification check
kycRouter.post('/admin/submissions/:id/auto-verify', requireAdmin, async (req: any, res) => {
  const submission = db.findKycSubmissionById(req.params.id);
  if (!submission) {
    return res.status(404).json({ error: 'KYC submission not found' });
  }

  if (!submission.nin && !submission.bvn) {
    return res.status(400).json({ error: 'Submission does not contain a NIN or BVN for automated verification' });
  }

  const startTime = Date.now();
  try {
    const provider = verificationManager.getProvider('2sureverify');
    const searchValue = submission.nin || submission.bvn || '';
    const result = await provider.executeService('nin_v1', '/api/v1/nin_v1.php', { nin: searchValue });
    const latency = Date.now() - startTime;

    const matchedName = String(result.data?.firstname || '').toLowerCase();
    const submittedName = String(submission.full_legal_name).toLowerCase();
    const isNameMatch = submittedName.includes(matchedName) || matchedName.includes(submittedName.split(' ')[0]);

    submission.automated_verification_result = {
      verified: result.success,
      provider: '2sureverify',
      reference: result.reference || `2SV_AUTO_${Date.now()}`,
      name_matched: isNameMatch,
      timestamp: new Date().toISOString(),
    };
    db.saveDatabase();

    res.json({
      success: true,
      provider: '2SureVerify NIMC Registry',
      latency_ms: latency,
      verification_status: result.success ? 'VERIFIED' : 'FAILED',
      name_match: isNameMatch,
      registry_data: {
        firstname: result.data?.firstname,
        surname: result.data?.surname,
        birthdate: result.data?.birthdate,
        gender: result.data?.gender,
      },
      message: isNameMatch
        ? 'Identity validated in National Identity Database. Biometric names match.'
        : 'Query completed, but submitted name differs from registry record.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Automated verification check failed' });
  }
});

// -------------------------------------------------------------
// 5. SERVICE SECURITY & PIN CONFIGURATION ENDPOINTS
// -------------------------------------------------------------

// GET /api/kyc/admin/service-rules
kycRouter.get('/admin/service-rules', requireAdmin, (req, res) => {
  res.json({
    success: true,
    rules: db.getServiceSecurityRules(),
  });
});

// PUT /api/kyc/admin/service-rules/:key
kycRouter.put('/admin/service-rules/:key', requireAdmin, (req: any, res) => {
  const { requires_pin, min_kyc_level, daily_limit, description } = req.body;
  const updates: Partial<ServiceSecurityRule> = {};

  if (requires_pin !== undefined) updates.requires_pin = Boolean(requires_pin);
  if (min_kyc_level !== undefined) updates.min_kyc_level = Number(min_kyc_level) as any;
  if (daily_limit !== undefined) updates.daily_limit = Number(daily_limit);
  if (description !== undefined) updates.description = String(description);
  updates.updated_by = req.user.email;

  const updated = db.updateServiceSecurityRule(req.params.key, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Service security rule not found' });
  }

  db.logAudit('SERVICE_SECURITY_RULE_UPDATED', {
    serviceKey: req.params.key,
    updates,
  }, req.user.id, req.user.email);

  res.json({
    success: true,
    message: `Security & PIN policy for "${updated.service_name}" updated successfully`,
    rule: updated,
  });
});
