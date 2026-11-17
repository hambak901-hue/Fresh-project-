/**
 * @file printing.ts
 * Express Development Mirror for HAMBAK TECH & SERVICES — Printing & Document Services Module.
 * Mirrors backend/controllers/PrintingController.php and backend/services/PrintingService.php
 * with identical request/response shapes, 15 order statuses, pricing engine, PIN verification,
 * dispatch guard, multipart upload support, RBAC enforcement, and internal-cost stripping.
 */

import { Router } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, verifyPin } from '../db/database.js';
import { parseToken, hasUserPermission, hasAnyUserPermission } from './auth.js';

export const printingRouter = Router();
export const adminPrintingRouter = Router();

export const PRINTING_ORDER_STATUSES = [
  'Pending Review',
  'Under Review',
  'Awaiting Quotation',
  'Quotation Sent',
  'Awaiting Payment',
  'Payment Confirmed',
  'Processing',
  'On Hold',
  'Ready for Collection',
  'Ready for Dispatch',
  'Out for Delivery',
  'Completed',
  'Rejected',
  'Cancelled',
  'Refunded',
] as const;

const UPLOAD_DIR = path.resolve(process.cwd(), 'server', 'db', 'printing_uploads');

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeUuid(): string {
  return crypto.randomUUID();
}

function requireAuthUser(req: any, res: any, next: any) {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required or session expired.' });
  }
  const user = db.findUserById(session.userId);
  if (!user || user.status === 'suspended') {
    return res.status(401).json({ error: 'Account unavailable or suspended.' });
  }
  req.user = user;
  next();
}

function requirePrintingRead(req: any, res: any, next: any) {
  requireAuthUser(req, res, () => {
    if (!hasAnyUserPermission(req.user, ['printing', 'printing_pricing'])) {
      return res.status(403).json({ error: 'Access denied. Printing module permission required.' });
    }
    next();
  });
}

function requirePrintingOps(req: any, res: any, next: any) {
  requireAuthUser(req, res, () => {
    if (!hasUserPermission(req.user, 'printing')) {
      return res.status(403).json({ error: "Access denied. Missing required 'printing' permission." });
    }
    next();
  });
}

function requirePrintingPricing(req: any, res: any, next: any) {
  requireAuthUser(req, res, () => {
    if (!hasUserPermission(req.user, 'printing_pricing')) {
      return res.status(403).json({ error: "Access denied. Missing required 'printing_pricing' permission." });
    }
    next();
  });
}

function getPrintingSettings() {
  const defaults = {
    office_collection_title: 'HambakTech Main Office Collection Centre',
    office_collection_address: 'HambakTech Services Hub, Sangotedo / Ajah Corridor, Lagos State, Nigeria',
    office_collection_hours: 'Monday – Saturday, 8:30 AM – 6:00 PM',
    printing_support_phone: '09127469686',
    printing_support_whatsapp: '09155104724',
    printing_support_email: 'support@hambaktech.com.ng',
    allow_deposit_default: false,
    default_deposit_percent: 50,
    max_upload_mb: 15,
    allowed_file_types: ['PDF', 'DOC', 'DOCX', 'JPG', 'JPEG', 'PNG', 'WEBP', 'TIFF', 'CDR', 'AI', 'PSD', 'ZIP'],
    collection_notice: 'Office collection is free (₦0 delivery fee). Wait for your "Ready for Collection" alert before coming.',
    delivery_notice: 'Paid delivery is available across Lagos LGAs & LCDAs. Delivery charges are billed separately from printing charges.',
  };
  return { ...defaults, ...(db.data.printing_settings || {}) };
}

function decodeCategory(cat: any, includeInternal: boolean = false) {
  const clone = { ...cat };
  clone.base_rate = Number(clone.base_rate ?? 0);
  clone.bw_rate = Number(clone.bw_rate ?? 0);
  clone.color_rate = Number(clone.color_rate ?? 0);
  clone.min_quantity = Math.max(1, Number(clone.min_quantity ?? 1));
  clone.urgent_fee_value = Number(clone.urgent_fee_value ?? 0);
  clone.requires_manual_quote = Boolean(clone.requires_manual_quote ?? true);
  clone.is_active = Boolean(clone.is_active ?? true);
  clone.display_order = Number(clone.display_order ?? 1);
  if (includeInternal) {
    clone.internal_cost_estimate = Number(clone.internal_cost_estimate ?? 0);
  } else {
    delete clone.internal_cost_estimate;
  }
  return clone;
}

function sanitizeOrderForCustomer(order: any) {
  const clean = {
    ...order,
    specs: order.specs || {},
    uploaded_files: Array.isArray(order.uploaded_files) ? order.uploaded_files : [],
    finishing_requirements: Array.isArray(order.finishing_requirements) ? order.finishing_requirements : [],
    quantity: Number(order.quantity ?? 1),
    width_ft: order.width_ft !== null && order.width_ft !== undefined ? Number(order.width_ft) : null,
    height_ft: order.height_ft !== null && order.height_ft !== undefined ? Number(order.height_ft) : null,
    sq_ft: order.sq_ft !== null && order.sq_ft !== undefined ? Number(order.sq_ft) : null,
    estimated_printing_charge: Number(order.estimated_printing_charge ?? 0),
    printing_charge: Number(order.printing_charge ?? 0),
    finishing_charge: Number(order.finishing_charge ?? 0),
    urgent_charge: Number(order.urgent_charge ?? 0),
    discount_amount: Number(order.discount_amount ?? 0),
    delivery_charge: Number(order.delivery_charge ?? 0),
    total_amount: Number(order.total_amount ?? 0),
    deposit_enabled: Boolean(order.deposit_enabled),
    deposit_percent: Number(order.deposit_percent ?? 50),
    deposit_amount: Number(order.deposit_amount ?? 0),
    required_initial_payment: Number(order.required_initial_payment ?? 0),
    amount_paid: Number(order.amount_paid ?? 0),
    balance_due: Number(order.balance_due ?? 0),
    is_urgent: Boolean(order.is_urgent),
    free_delivery_authorized: Boolean(order.free_delivery_authorized),
    dispatch_confirmed: Boolean(order.dispatch_confirmed),
  };
  delete clean.internal_production_cost;
  delete clean.internal_notes;
  delete clean.profit;
  delete clean.margin;
  delete clean.estimated_margin;
  return clean;
}

function formatOrderForAdmin(order: any) {
  const clean = sanitizeOrderForCustomer(order);
  const icost = Number(order.internal_production_cost ?? 0);
  clean.internal_production_cost = icost;
  clean.internal_notes = String(order.internal_notes ?? '');
  clean.estimated_margin = Number((clean.total_amount - icost).toFixed(2));
  return clean;
}

function calculateEstimate(category: any, input: any, zone?: any) {
  const cat = decodeCategory(category, false);
  const quantity = Math.max(1, Math.floor(Number(input.quantity ?? 1)));
  const minQty = Math.max(1, Number(cat.min_quantity ?? 1));
  if (quantity < minQty) {
    throw new Error(`Minimum quantity for ${cat.name} is ${minQty}.`);
  }

  let colorMode = String(input.color_mode ?? 'bw').trim().toLowerCase();
  if (!['bw', 'color', 'mixed', 'full_color'].includes(colorMode)) {
    colorMode = 'bw';
  }

  let unitRate =
    colorMode === 'bw'
      ? Number(cat.bw_rate > 0 ? cat.bw_rate : cat.base_rate)
      : Number(cat.color_rate > 0 ? cat.color_rate : cat.base_rate);

  const paperSize = String(input.paper_size ?? '').trim();
  const sizeRates = cat.size_rates && typeof cat.size_rates === 'object' ? cat.size_rates : {};
  const sizeMultiplier =
    paperSize && sizeRates[paperSize] !== undefined
      ? Math.max(0.1, Number(sizeRates[paperSize]))
      : 1.0;

  const method = String(cat.measurement_method ?? 'per_page');
  const widthFt = Math.max(0, Number(input.width_ft ?? 0));
  const heightFt = Math.max(0, Number(input.height_ft ?? 0));
  const pageCount = Math.max(1, Math.floor(Number(input.page_count ?? 1)));

  let sqFt = 0;
  let linearFt = 0;
  let effectiveUnits = quantity;
  let manualQuoteRequired = Boolean(cat.requires_manual_quote ?? true);

  if (method === 'per_sq_ft') {
    const w = widthFt > 0 ? widthFt : 1;
    const h = heightFt > 0 ? heightFt : 1;
    sqFt = Number((w * h).toFixed(2));
    effectiveUnits = sqFt * quantity;
  } else if (method === 'per_linear_ft') {
    linearFt = Math.max(1, Math.max(widthFt, heightFt));
    sqFt = widthFt > 0 && heightFt > 0 ? Number((widthFt * heightFt).toFixed(2)) : linearFt;
    effectiveUnits = linearFt * quantity;
  } else if (method === 'per_page' || method === 'per_copy') {
    effectiveUnits = pageCount * quantity;
  } else if (method === 'manual' || cat.pricing_mode === 'custom_quote') {
    effectiveUnits = quantity;
    unitRate = 0;
    manualQuoteRequired = true;
  }

  const grossPrintingCharge = Number((effectiveUnits * unitRate * sizeMultiplier).toFixed(2));

  let bulkPercent = 0;
  let bulkLabel: string | null = null;
  const tiers = Array.isArray(cat.bulk_discounts) ? cat.bulk_discounts : [];
  for (const tier of tiers) {
    const tierMin = Number(tier.min_qty ?? 0);
    const tierPct = Number(tier.discount_percent ?? 0);
    if (tierMin > 0 && effectiveUnits >= tierMin && tierPct > bulkPercent) {
      bulkPercent = tierPct;
      bulkLabel = tier.label || `${tierMin}+ units: ${tierPct}% off`;
    }
  }

  const discountAmount = Number((grossPrintingCharge * (bulkPercent / 100)).toFixed(2));
  const printingCharge = Math.max(0, Number((grossPrintingCharge - discountAmount).toFixed(2)));

  let finishingCharge = 0;
  const selectedCodes = Array.isArray(input.finishing_requirements) ? input.finishing_requirements : [];
  const finOptions = Array.isArray(cat.finishing_options) ? cat.finishing_options : [];
  const matchedFinishing: Array<{ code: string; label: string; fee: number }> = [];
  for (const opt of finOptions) {
    const code = String(opt.code ?? '');
    if (code && selectedCodes.includes(code)) {
      const fee = Number(opt.fee ?? 0);
      finishingCharge += fee;
      matchedFinishing.push({ code, label: String(opt.label ?? code), fee });
    }
  }
  finishingCharge = Number(finishingCharge.toFixed(2));

  const isUrgent = Boolean(input.is_urgent);
  let urgentCharge = 0;
  if (isUrgent && grossPrintingCharge > 0) {
    const uType = String(cat.urgent_fee_type ?? 'percent');
    const uVal = Number(cat.urgent_fee_value ?? 0);
    urgentCharge =
      uType === 'flat'
        ? Number(uVal.toFixed(2))
        : Number(((printingCharge + finishingCharge) * (uVal / 100)).toFixed(2));
  }

  const printingSubtotal = Number((printingCharge + finishingCharge + urgentCharge).toFixed(2));

  const collectionMethod = input.collection_method === 'paid_delivery' ? 'paid_delivery' : 'office_collection';
  let deliveryCharge = 0;
  let deliveryManualQuote = false;
  let freeDeliveryQualified = false;

  if (collectionMethod === 'paid_delivery') {
    if (zone) {
      const zMode = String(zone.pricing_mode ?? 'fixed');
      if (zMode === 'free') {
        deliveryCharge = 0;
        freeDeliveryQualified = true;
      } else if (zMode === 'manual_quote') {
        deliveryCharge = 0;
        deliveryManualQuote = true;
      } else {
        deliveryCharge = Number(zone.fixed_fee ?? 0);
        const freeMin = Number(zone.free_delivery_min_order ?? 0);
        if (zone.free_delivery_enabled && freeMin > 0 && printingSubtotal >= freeMin) {
          deliveryCharge = 0;
          freeDeliveryQualified = true;
        }
      }
    } else {
      deliveryManualQuote = true;
    }
  }

  const totalEstimate = Number((printingSubtotal + deliveryCharge).toFixed(2));

  return {
    category_key: cat.category_key,
    category_name: cat.name,
    measurement_method: method,
    unit_label: cat.unit_label || 'unit',
    quantity,
    page_count: pageCount,
    width_ft: widthFt,
    height_ft: heightFt,
    sq_ft: sqFt,
    linear_ft: linearFt,
    effective_units: Number(effectiveUnits.toFixed(2)),
    unit_rate: unitRate,
    size_multiplier: sizeMultiplier,
    gross_printing_charge: grossPrintingCharge,
    discount_percent: bulkPercent,
    discount_label: bulkLabel,
    discount_amount: discountAmount,
    printing_charge: printingCharge,
    finishing_items: matchedFinishing,
    finishing_charge: finishingCharge,
    is_urgent: isUrgent,
    urgent_charge: urgentCharge,
    printing_subtotal: printingSubtotal,
    collection_method: collectionMethod,
    delivery_charge: deliveryCharge,
    delivery_manual_quote: deliveryManualQuote,
    free_delivery_qualified: freeDeliveryQualified,
    total_estimate: totalEstimate,
    manual_quote_required: manualQuoteRequired,
  };
}

function recordHistory(orderId: string, fromStatus: string | null, toStatus: string, actor: any, note = '') {
  if (!db.data.printing_order_history) db.data.printing_order_history = [];
  db.data.printing_order_history.push({
    id: makeUuid(),
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    actor_id: actor?.id || null,
    actor_name: actor?.full_name || actor?.email || 'System',
    actor_role: actor?.role || 'system',
    note: note || null,
    created_at: nowIso(),
  });
}

function notifyCustomerLifecycle(order: any, title: string, message: string, type: 'info' | 'success' | 'warning' | 'alert' = 'info') {
  const userId = order?.user_id;
  const ref = order?.order_reference || '';
  if (!userId) return;
  const link = `#printing?order=${encodeURIComponent(ref)}`;

  const notif = db.addNotification(userId, title, `[${ref}] ${message}`, type);
  (notif as any).action_link = link;

  db.addCustomerMessage({
    user_id: userId,
    title: `${title} (${ref})`,
    category: 'service',
    body: message,
    read: false,
    reference: ref,
    action_label: 'View Order',
    action_link: link,
  });
}

function notifyPrintingAdmins(title: string, message: string, orderRef = '') {
  const link = orderRef ? `#printing?order=${encodeURIComponent(orderRef)}` : '#printing';
  for (const adm of db.data.users) {
    if ((adm.role === 'superadmin' || adm.role === 'admin' || adm.role === 'staff') && adm.status === 'active' && hasUserPermission(adm, 'printing')) {
      const notif = db.addNotification(adm.id, title, message, 'alert');
      (notif as any).action_link = link;
    }
  }
}

function assertDispatchAuthorized(order: any): void {
  const total = Number(order.total_amount ?? 0);
  const paid = Number(order.amount_paid ?? 0);
  const depositEnabled = Boolean(order.deposit_enabled);
  const requiredInit = depositEnabled
    ? Number(order.deposit_amount ?? order.required_initial_payment ?? total)
    : total;

  if (total <= 0) {
    throw new Error('Cannot confirm dispatch before a quotation amount is prepared.');
  }
  if (paid + 0.01 < requiredInit) {
    throw new Error('Dispatch blocked: Required printing payment has not been confirmed yet.');
  }
  if (order.collection_method === 'paid_delivery') {
    const deliveryFee = Number(order.delivery_charge ?? 0);
    if (deliveryFee > 0 && !order.free_delivery_authorized && order.delivery_payment_status !== 'paid') {
      if (paid + 0.01 < total) {
        throw new Error('Dispatch blocked: Delivery charges must be paid or free delivery authorized before dispatch.');
      }
    }
  }
  if (!order.dispatch_confirmed) {
    throw new Error('Dispatch confirmation must be recorded before setting status to Out for Delivery.');
  }
}

function applyConfirmedPayment(order: any, amountPaidNow: number, scope: string, actor: any, historyNote: string) {
  const total = Number(order.total_amount ?? 0);
  const newPaid = Number((Number(order.amount_paid ?? 0) + amountPaidNow).toFixed(2));
  const newBalance = Math.max(0, Number((total - newPaid).toFixed(2)));
  const depositEnabled = Boolean(order.deposit_enabled);
  const reqInitial = depositEnabled ? Number(order.deposit_amount ?? total) : total;

  let payStatus = 'partially_paid';
  if (newBalance <= 0.01) {
    payStatus = 'paid';
  } else if (depositEnabled && newPaid + 0.01 >= reqInitial) {
    payStatus = 'deposit_paid';
  }

  let delPayStatus = order.delivery_payment_status || 'not_applicable';
  if (order.collection_method === 'paid_delivery') {
    if (order.free_delivery_authorized || Number(order.delivery_charge ?? 0) <= 0) {
      delPayStatus = 'free_authorized';
    } else if (newBalance <= 0.01 || scope === 'delivery') {
      delPayStatus = 'paid';
    }
  }

  const oldStatus = order.status;
  let newStatus = oldStatus;
  if (['Quotation Sent', 'Awaiting Payment'].includes(oldStatus) && (payStatus === 'paid' || payStatus === 'deposit_paid')) {
    newStatus = 'Payment Confirmed';
  }

  order.amount_paid = newPaid;
  order.balance_due = newBalance;
  order.payment_status = payStatus;
  order.delivery_payment_status = delPayStatus;
  order.status = newStatus;
  order.quote_decision = 'approved';
  order.updated_at = nowIso();

  recordHistory(order.id, oldStatus, newStatus, actor, historyNote);
  db.saveDatabase();

  notifyCustomerLifecycle(
    order,
    'Printing Payment Confirmed',
    `Payment of ₦${amountPaidNow.toLocaleString()} confirmed.${newBalance > 0 ? ` Remaining balance: ₦${newBalance.toLocaleString()}.` : ' Your order is paid in full and ready for production.'}`,
    'success'
  );
  notifyPrintingAdmins(
    `Payment Confirmed: ${order.order_reference}`,
    `₦${amountPaidNow.toLocaleString()} confirmed for ${order.customer_name} (${order.order_reference}).`,
    order.order_reference
  );

  return order;
}

function parseMultipartBuffer(rawBuffer: Buffer, contentType: string): { filename: string; mimeType: string; buffer: Buffer } | null {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let pos = rawBuffer.indexOf(boundaryBuf);
  if (pos === -1) return null;

  while (pos !== -1) {
    const nextPos = rawBuffer.indexOf(boundaryBuf, pos + boundaryBuf.length);
    if (nextPos === -1) break;

    let partStart = pos + boundaryBuf.length;
    if (rawBuffer[partStart] === 13 && rawBuffer[partStart + 1] === 10) partStart += 2;
    const part = rawBuffer.subarray(partStart, nextPos);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headersStr = part.subarray(0, headerEnd).toString('utf8');
      const filenameMatch = headersStr.match(/filename="([^"]+)"/i);
      if (filenameMatch) {
        const ctMatch = headersStr.match(/Content-Type:\s*([^\r\n;]+)/i);
        let bodyEnd = part.length;
        if (part[bodyEnd - 2] === 13 && part[bodyEnd - 1] === 10) bodyEnd -= 2;
        return {
          filename: filenameMatch[1],
          mimeType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
          buffer: part.subarray(headerEnd + 4, bodyEnd),
        };
      }
    }
    pos = nextPos;
  }
  return null;
}

// ============================================================================
// A. CUSTOMER ENDPOINTS (/api/printing/*)
// ============================================================================

printingRouter.get('/catalog', requireAuthUser, (req, res) => {
  const categories = (db.data.printing_categories || [])
    .filter((c: any) => c.is_active !== false)
    .sort((a: any, b: any) => Number(a.display_order ?? 1) - Number(b.display_order ?? 1))
    .map((c: any) => decodeCategory(c, false));

  const zones = (db.data.printing_delivery_zones || [])
    .filter((z: any) => z.is_active !== false)
    .sort((a: any, b: any) => Number(a.display_order ?? 1) - Number(b.display_order ?? 1));

  const bankDetails = {
    bank: (db.data.settings as any)?.bank_name || 'Moniepoint MFB',
    accountNumber: (db.data.settings as any)?.bank_account_number || '5210471634',
    accountName: (db.data.settings as any)?.bank_account_name || 'Hambaktech_Services',
  };

  res.json({
    success: true,
    categories,
    delivery_zones: zones,
    settings: getPrintingSettings(),
    statuses: PRINTING_ORDER_STATUSES,
    bank_details: bankDetails,
  });
});

printingRouter.post('/estimate', requireAuthUser, (req, res) => {
  const body = req.body || {};
  const catKey = String(body.category_key || '').trim();
  if (!catKey) return res.status(422).json({ error: 'Service category is required.' });

  const category = (db.data.printing_categories || []).find(
    (c: any) => c.category_key === catKey && c.is_active !== false
  );
  if (!category) {
    return res.status(404).json({ error: 'Selected printing service category is unavailable or inactive.' });
  }

  const zone = body.delivery_zone_id
    ? (db.data.printing_delivery_zones || []).find((z: any) => z.id === body.delivery_zone_id && z.is_active !== false)
    : undefined;

  try {
    const est = calculateEstimate(category, body, zone);
    res.json({ success: true, ...est });
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

printingRouter.post(
  '/upload',
  requireAuthUser,
  express.raw({ type: 'multipart/form-data', limit: '25mb' }),
  (req: any, res) => {
    const settings = getPrintingSettings();
    const maxBytes = Math.max(2, Number(settings.max_upload_mb ?? 15)) * 1024 * 1024;
    const allowedExts = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'cdr', 'ai', 'psd', 'zip']);
    const blockedMimes = new Set(['application/x-php', 'text/x-php', 'application/x-httpd-php', 'text/html', 'application/javascript', 'text/javascript']);

    let filename = '';
    let mimeType = 'application/octet-stream';
    let fileBuffer: Buffer | null = null;

    if (Buffer.isBuffer(req.body)) {
      const parsed = parseMultipartBuffer(req.body, String(req.headers['content-type'] || ''));
      if (!parsed) {
        return res.status(422).json({ error: 'Please choose a valid printing document or design file.' });
      }
      filename = parsed.filename;
      mimeType = parsed.mimeType;
      fileBuffer = parsed.buffer;
    } else if (req.body && req.body.fileData && req.body.fileName) {
      filename = String(req.body.fileName);
      mimeType = String(req.body.mimeType || 'application/octet-stream');
      const b64 = String(req.body.fileData).replace(/^data:[^;]+;base64,/, '');
      fileBuffer = Buffer.from(b64, 'base64');
    } else {
      return res.status(422).json({ error: 'Please choose a valid printing document or design file.' });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(422).json({ error: 'Uploaded file is empty.' });
    }
    if (fileBuffer.length > maxBytes) {
      return res.status(422).json({ error: `Uploaded file exceeds maximum allowed size of ${settings.max_upload_mb}MB.` });
    }

    const ext = path.extname(filename).replace('.', '').toLowerCase();
    if (!ext || !allowedExts.has(ext)) {
      return res.status(422).json({ error: 'Unsupported file format. Accepted: PDF, DOCX, JPG, PNG, WEBP, TIFF, CDR, AI, PSD, ZIP.' });
    }
    if (blockedMimes.has(mimeType.toLowerCase())) {
      return res.status(422).json({ error: 'Executable or script files are blocked for security.' });
    }

    ensureUploadDir();
    const docId = makeUuid();
    const storedName = `prt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const destPath = path.join(UPLOAD_DIR, storedName);
    fs.writeFileSync(destPath, fileBuffer);

    const fileUrl = `/api/printing/files/${docId}`;
    if (!db.data.uploaded_documents) db.data.uploaded_documents = [];
    db.data.uploaded_documents.unshift({
      id: docId,
      user_id: req.user.id,
      document_type: 'printing_artwork',
      original_name: path.basename(filename).slice(0, 250),
      stored_name: storedName,
      mime_type: mimeType,
      file_size: fileBuffer.length,
      file_path: destPath,
      file_url: fileUrl,
      created_at: nowIso(),
    });
    db.saveDatabase();

    res.status(201).json({
      success: true,
      message: 'File uploaded securely.',
      id: docId,
      file_name: path.basename(filename),
      file_url: fileUrl,
      mime_type: mimeType,
      file_size: fileBuffer.length,
    });
  }
);

printingRouter.get('/files/:id', requireAuthUser, (req: any, res) => {
  const doc = (db.data.uploaded_documents || []).find((d: any) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Printing file not found.' });

  const isStaff = hasAnyUserPermission(req.user, ['printing', 'printing_pricing']);
  if (doc.user_id !== req.user.id && !isStaff) {
    return res.status(403).json({ error: 'You do not have permission to view this file.' });
  }

  if (!doc.file_path || !fs.existsSync(doc.file_path)) {
    return res.status(404).json({ error: 'Uploaded file not found in server storage.' });
  }

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(doc.original_name || 'file')}"`);
  fs.createReadStream(doc.file_path).pipe(res);
});

printingRouter.get('/orders', requireAuthUser, (req: any, res) => {
  const statusFilter = String(req.query.status || '').trim();
  let orders = (db.data.printing_orders || []).filter((o: any) => o.user_id === req.user.id);
  if (statusFilter && statusFilter !== 'all') {
    orders = orders.filter((o: any) => o.status === statusFilter);
  }
  orders = [...orders]
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(sanitizeOrderForCustomer);

  res.json({ success: true, orders });
});

printingRouter.get('/orders/:id', requireAuthUser, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const order = (db.data.printing_orders || []).find(
    (o: any) => (o.id === id || o.order_reference === id) && o.user_id === req.user.id
  );
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const history = (db.data.printing_order_history || []).filter((h: any) => h.order_id === order.id);
  const messages = (db.data.printing_order_messages || [])
    .filter((m: any) => m.order_id === order.id && !m.is_internal);
  const payments = (db.data.printing_payments || [])
    .filter((p: any) => p.order_id === order.id)
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

  res.json({
    success: true,
    order: sanitizeOrderForCustomer(order),
    history,
    messages,
    payments,
  });
});

printingRouter.post('/orders', requireAuthUser, (req: any, res) => {
  const body = req.body || {};
  const catKey = String(body.category_key || '').trim();
  if (!catKey) return res.status(422).json({ error: 'Printing service category is required.' });

  const category = (db.data.printing_categories || []).find(
    (c: any) => c.category_key === catKey && c.is_active !== false
  );
  if (!category) return res.status(404).json({ error: 'Selected printing category is not available.' });

  const collectionMethod = body.collection_method === 'paid_delivery' ? 'paid_delivery' : 'office_collection';
  const recipientName = String(body.delivery_recipient_name || '').trim();
  const recipientPhone = String(body.delivery_recipient_phone || '').trim();
  let deliveryDest = String(body.delivery_destination || '').trim();
  const deliveryLga = String(body.delivery_lga_lcda || '').trim();
  const deliveryTown = String(body.delivery_town || '').trim();
  const deliveryAddress = String(body.delivery_address || '').trim();
  const deliveryLandmark = String(body.delivery_landmark || '').trim();
  const zoneId = String(body.delivery_zone_id || '').trim();

  let zone: any = null;
  if (collectionMethod === 'paid_delivery') {
    if (!recipientName || !recipientPhone || !deliveryLga || !deliveryTown || !deliveryAddress || !deliveryLandmark) {
      return res.status(422).json({
        error: 'For Paid Delivery, recipient name, phone, Lagos LGA/LCDA, town, full street address, and nearby landmark are required.',
      });
    }
    if (zoneId) {
      zone = (db.data.printing_delivery_zones || []).find((z: any) => z.id === zoneId && z.is_active !== false) || null;
      if (zone && !deliveryDest) {
        deliveryDest = zone.destination_group;
      }
    }
    if (!deliveryDest) deliveryDest = deliveryLga;
  }

  let est: any;
  try {
    est = calculateEstimate(category, body, zone);
  } catch (err: any) {
    return res.status(422).json({ error: err.message });
  }

  let serviceTitle = String(body.service_title || '').trim();
  if (!serviceTitle) {
    const purpose = String(
      body.document_purpose || body.banner_purpose || body.card_audience || body.photo_type || body.custom_item_type || ''
    ).trim();
    serviceTitle = purpose ? `${category.name} — ${purpose}` : category.name;
  }

  let colorMode = String(body.color_mode || 'bw').trim().toLowerCase();
  if (!['bw', 'color', 'mixed', 'full_color'].includes(colorMode)) colorMode = 'bw';

  const specs: Record<string, any> = {
    ...(typeof body.specs === 'object' && body.specs ? body.specs : {}),
    page_count: Number(body.page_count ?? body.specs?.page_count ?? 1),
    measurement_method: est.measurement_method,
  };
  for (const k of ['document_purpose', 'paper_weight', 'banner_purpose', 'card_audience', 'double_sided', 'photo_type', 'paper_finish', 'custom_item_type']) {
    if (body[k]) specs[k] = body[k];
  }

  const orderId = makeUuid();
  const orderRef = `PRT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const internalCostEst = Number((Number(category.internal_cost_estimate ?? 0) * Math.max(1, est.effective_units)).toFixed(2));
  const now = nowIso();

  const order = {
    id: orderId,
    order_reference: orderRef,
    user_id: req.user.id,
    customer_name: String(body.customer_name || req.user.full_name || 'Customer').trim(),
    customer_email: String(body.customer_email || req.user.email || '').trim(),
    customer_phone: String(body.customer_phone || req.user.phone_number || '').trim(),
    category_key: category.category_key,
    category_name: category.name,
    service_title: serviceTitle,
    status: 'Pending Review',
    specs,
    uploaded_files: Array.isArray(body.uploaded_files) ? body.uploaded_files : [],
    quantity: est.quantity,
    color_mode: colorMode,
    paper_size: String(body.paper_size || '').trim() || null,
    width_ft: est.width_ft > 0 ? est.width_ft : null,
    height_ft: est.height_ft > 0 ? est.height_ft : null,
    sq_ft: est.sq_ft > 0 ? est.sq_ft : null,
    finishing_requirements: Array.isArray(body.finishing_requirements) ? body.finishing_requirements : [],
    is_urgent: est.is_urgent,
    special_instructions: String(body.special_instructions || '').trim() || null,
    estimated_printing_charge: est.printing_subtotal,
    printing_charge: est.printing_charge,
    finishing_charge: est.finishing_charge,
    urgent_charge: est.urgent_charge,
    discount_amount: est.discount_amount,
    delivery_charge: est.delivery_charge,
    total_amount: est.total_estimate,
    deposit_enabled: false,
    deposit_percent: 50,
    deposit_amount: 0,
    required_initial_payment: est.total_estimate,
    amount_paid: 0,
    balance_due: est.total_estimate,
    payment_status: 'unpaid',
    delivery_payment_status: collectionMethod === 'paid_delivery' ? 'pending' : 'not_applicable',
    collection_method: collectionMethod,
    delivery_zone_id: zone ? zone.id : zoneId || null,
    delivery_recipient_name: recipientName || null,
    delivery_recipient_phone: recipientPhone || null,
    delivery_destination: deliveryDest || null,
    delivery_lga_lcda: deliveryLga || null,
    delivery_town: deliveryTown || null,
    delivery_address: deliveryAddress || null,
    delivery_landmark: deliveryLandmark || null,
    free_delivery_authorized: false,
    dispatch_confirmed: false,
    quote_notes: null,
    quote_decision: null,
    assigned_staff_id: null,
    assigned_staff_name: null,
    tracking_note: null,
    internal_production_cost: internalCostEst,
    internal_notes: '',
    created_at: now,
    updated_at: now,
  };

  if (!db.data.printing_orders) db.data.printing_orders = [];
  db.data.printing_orders.unshift(order);
  recordHistory(orderId, null, 'Pending Review', req.user, 'Printing request submitted by customer for manual review and quotation.');
  db.saveDatabase();

  notifyCustomerLifecycle(
    order,
    'Printing Request Received',
    `Your printing request (${serviceTitle}, Qty: ${est.quantity}) has been received and queued for review. Our printing desk will prepare and send your official quotation shortly.`,
    'info'
  );
  notifyPrintingAdmins(
    `New Printing Request: ${orderRef}`,
    `${order.customer_name} submitted a ${category.name} request (${serviceTitle}, Qty: ${est.quantity}). Review & send quotation.`,
    orderRef
  );

  res.status(201).json({
    success: true,
    message: 'Printing request submitted successfully! You will be notified once your quotation is ready.',
    order: sanitizeOrderForCustomer(order),
    estimate: est,
  });
});

printingRouter.post('/orders/:id/quote-response', requireAuthUser, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const decision = String(req.body?.decision || '').trim().toLowerCase();
  const reason = String(req.body?.reason || '').trim();

  if (!['approve', 'approved', 'decline', 'declined'].includes(decision)) {
    return res.status(422).json({ error: 'Quote decision must be approve or decline.' });
  }

  const order = (db.data.printing_orders || []).find(
    (o: any) => (o.id === id || o.order_reference === id) && o.user_id === req.user.id
  );
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  if (order.status !== 'Quotation Sent') {
    return res.status(409).json({
      error: `Only orders in 'Quotation Sent' status can be approved or declined (current: ${order.status}).`,
    });
  }

  const isApprove = decision.startsWith('approve');
  const prevStatus = order.status;
  const newStatus = isApprove ? 'Awaiting Payment' : 'Cancelled';

  order.status = newStatus;
  order.quote_decision = isApprove ? 'approved' : 'declined';
  order.quote_responded_at = nowIso();
  order.quote_decline_reason = isApprove ? null : reason || 'Declined by customer';
  order.updated_at = nowIso();

  recordHistory(
    order.id,
    prevStatus,
    newStatus,
    req.user,
    isApprove ? 'Customer approved quotation and proceeded to payment.' : `Customer declined quotation: ${reason || 'No reason stated.'}`
  );
  db.saveDatabase();

  if (isApprove) {
    notifyCustomerLifecycle(
      order,
      'Quotation Approved — Awaiting Payment',
      `You approved the quotation for ₦${Number(order.total_amount).toLocaleString()}. Complete payment via wallet, card, or bank transfer to begin production.`,
      'success'
    );
    notifyPrintingAdmins(
      `Quote Approved: ${order.order_reference}`,
      `${order.customer_name} approved quotation of ₦${Number(order.total_amount).toLocaleString()}.`,
      order.order_reference
    );
  } else {
    notifyPrintingAdmins(
      `Quote Declined: ${order.order_reference}`,
      `${order.customer_name} declined the quotation. Reason: ${reason || 'None given'}`,
      order.order_reference
    );
  }

  res.json({
    success: true,
    message: isApprove ? 'Quotation approved. Please complete your payment.' : 'Quotation declined.',
    order: sanitizeOrderForCustomer(order),
  });
});

printingRouter.post('/orders/:id/pay', requireAuthUser, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const body = req.body || {};

  const order = (db.data.printing_orders || []).find(
    (o: any) => (o.id === id || o.order_reference === id) && o.user_id === req.user.id
  );
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const payableStatuses = [
    'Quotation Sent',
    'Awaiting Payment',
    'Payment Confirmed',
    'Processing',
    'On Hold',
    'Ready for Collection',
    'Ready for Dispatch',
  ];
  if (!payableStatuses.includes(order.status)) {
    return res.status(409).json({ error: `Order is currently in '${order.status}' and cannot accept payment.` });
  }

  const total = Number(order.total_amount ?? 0);
  const alreadyPaid = Number(order.amount_paid ?? 0);
  const balanceDue = Math.max(0, Number((total - alreadyPaid).toFixed(2)));
  if (total <= 0 || balanceDue <= 0.01) {
    return res.status(409).json({ error: 'This order has already been fully paid or has no finalized quotation amount.' });
  }

  let scope = String(body.payment_scope || 'full').trim().toLowerCase();
  if (!['full', 'deposit', 'balance', 'delivery'].includes(scope)) scope = 'full';

  let amountToPay = balanceDue;
  if (scope === 'deposit') {
    if (!order.deposit_enabled || alreadyPaid > 0) {
      return res.status(422).json({
        error: 'Deposit payment is either not enabled for this quotation or an initial payment has already been made.',
      });
    }
    let depAmt = Number(order.deposit_amount ?? 0);
    if (depAmt <= 0 || depAmt >= total) {
      depAmt = Number((total * (Number(order.deposit_percent ?? 50) / 100)).toFixed(2));
    }
    amountToPay = Math.min(balanceDue, depAmt);
  } else if (scope === 'delivery') {
    const delCharge = Number(order.delivery_charge ?? 0);
    if (delCharge <= 0 || order.free_delivery_authorized || order.delivery_payment_status === 'paid') {
      return res.status(422).json({ error: 'No separate pending delivery fee is due on this order.' });
    }
    amountToPay = Math.min(balanceDue, delCharge);
  }

  const gateway = String(body.gateway || 'wallet').trim().toLowerCase();
  if (!['wallet', 'paystack', 'flutterwave', 'manual_transfer'].includes(gateway)) {
    return res.status(422).json({ error: 'Unsupported payment method. Use wallet, paystack, flutterwave, or manual_transfer.' });
  }

  const payRef = `PRTPAY_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const paymentId = makeUuid();
  if (!db.data.printing_payments) db.data.printing_payments = [];

  if (gateway === 'wallet') {
    if (req.user.transaction_pin_hash) {
      const pin = String(body.transaction_pin ?? body.pin ?? '').trim();
      if (!pin) {
        return res.status(400).json({ error: 'Transaction PIN is required for wallet payment.' });
      }
      if (!verifyPin(pin, req.user.transaction_pin_hash)) {
        return res.status(401).json({ error: 'Incorrect transaction PIN.' });
      }
    } else if (req.user.role === 'customer' || req.user.role === 'agent') {
      return res.status(403).json({
        error: 'Please configure your 4-digit Transaction PIN in Security Settings before paying from wallet.',
        code: 'PIN_SETUP_REQUIRED',
        requires_pin_setup: true,
      });
    }

    let walletRes: any;
    try {
      walletRes = db.adjustBalance(
        req.user.id,
        -amountToPay,
        'printing',
        `Printing payment (${scope}) for ${order.order_reference}`,
        'internal',
        { order_id: order.id, order_reference: order.order_reference, scope, reference: payRef }
      );
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    db.data.printing_payments.unshift({
      id: paymentId,
      order_id: order.id,
      user_id: req.user.id,
      reference: payRef,
      payment_scope: scope,
      gateway: 'wallet',
      amount: amountToPay,
      status: 'confirmed',
      payer_name: req.user.full_name || req.user.email,
      remarks: 'Instant wallet settlement',
      confirmed_by: req.user.id,
      confirmed_by_name: 'Wallet Automated Settlement',
      confirmed_at: nowIso(),
      created_at: nowIso(),
    });

    const updatedOrder = applyConfirmedPayment(order, amountToPay, scope, req.user, `Wallet payment confirmed (${payRef})`);
    return res.json({
      success: true,
      message: 'Printing payment confirmed from wallet!',
      payment_id: paymentId,
      reference: payRef,
      status: 'confirmed',
      wallet_balance: walletRes.user.wallet_balance,
      order: sanitizeOrderForCustomer(updatedOrder),
    });
  }

  if (gateway === 'manual_transfer') {
    const payerName = String(body.payer_name || req.user.full_name || 'Customer').trim();
    const bankRef = String(body.bank_reference || body.reference || payRef).trim();
    const proofUrl = String(body.proof_url || '').trim();
    const remarks = String(body.remarks || 'Manual bank transfer for printing order').trim();

    db.data.printing_payments.unshift({
      id: paymentId,
      order_id: order.id,
      user_id: req.user.id,
      reference: payRef,
      payment_scope: scope,
      gateway: 'manual_transfer',
      amount: amountToPay,
      status: 'pending',
      proof_url: proofUrl || null,
      payer_name: payerName,
      bank_reference: bankRef,
      remarks,
      created_at: nowIso(),
    });

    if (order.status === 'Quotation Sent') {
      order.status = 'Awaiting Payment';
      order.quote_decision = 'approved';
      order.quote_responded_at = nowIso();
      recordHistory(order.id, 'Quotation Sent', 'Awaiting Payment', req.user, 'Manual transfer proof submitted by customer.');
    }
    db.saveDatabase();

    notifyPrintingAdmins(
      `Printing Transfer Proof: ${order.order_reference}`,
      `${payerName} submitted ₦${amountToPay.toLocaleString()} bank transfer proof (${payRef}) awaiting confirmation.`,
      order.order_reference
    );

    return res.json({
      success: true,
      message: 'Bank transfer proof submitted! Our finance/printing team will confirm shortly.',
      payment_id: paymentId,
      reference: payRef,
      status: 'pending',
      amount: amountToPay,
    });
  }

  // Paystack / Flutterwave dev sandbox checkout initialization
  db.data.printing_payments.unshift({
    id: paymentId,
    order_id: order.id,
    user_id: req.user.id,
    reference: payRef,
    payment_scope: scope,
    gateway,
    amount: amountToPay,
    status: 'pending',
    payer_name: req.user.full_name || req.user.email,
    created_at: nowIso(),
  });
  db.saveDatabase();

  const checkoutUrl = `/#printing?printing_order=${encodeURIComponent(order.id)}&gateway=${gateway}&reference=${payRef}`;
  return res.json({
    success: true,
    message: 'Payment gateway checkout initialized.',
    payment_id: paymentId,
    reference: payRef,
    amount: amountToPay,
    gateway,
    authorization_url: checkoutUrl,
    link: checkoutUrl,
  });
});

printingRouter.post('/orders/:id/pay/verify', requireAuthUser, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const reference = String(req.body?.reference || '').trim();
  if (!reference) return res.status(422).json({ error: 'Payment reference is required.' });

  const order = (db.data.printing_orders || []).find(
    (o: any) => (o.id === id || o.order_reference === id) && o.user_id === req.user.id
  );
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const payment = (db.data.printing_payments || []).find(
    (p: any) => p.reference === reference && p.order_id === order.id
  );
  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

  if (payment.status === 'confirmed') {
    return res.json({
      success: true,
      already_confirmed: true,
      message: 'Payment already verified.',
      order: sanitizeOrderForCustomer(order),
    });
  }

  payment.status = 'confirmed';
  payment.confirmed_by = req.user.id;
  payment.confirmed_by_name = `${String(payment.gateway).toUpperCase()} Gateway`;
  payment.confirmed_at = nowIso();

  const updated = applyConfirmedPayment(order, Number(payment.amount), payment.payment_scope, req.user, `${payment.gateway} payment verified (${reference})`);
  res.json({
    success: true,
    message: 'Payment verified and confirmed!',
    order: sanitizeOrderForCustomer(updated),
  });
});

printingRouter.post('/orders/:id/cancel', requireAuthUser, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const reason = String(req.body?.reason || 'Cancelled by customer').trim();

  const order = (db.data.printing_orders || []).find(
    (o: any) => (o.id === id || o.order_reference === id) && o.user_id === req.user.id
  );
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const nonCancellable = ['Processing', 'Ready for Collection', 'Ready for Dispatch', 'Out for Delivery', 'Completed', 'Cancelled', 'Refunded'];
  if (nonCancellable.includes(order.status)) {
    return res.status(409).json({ error: `Cannot cancel an order in '${order.status}' status.` });
  }

  const prev = order.status;
  order.status = 'Cancelled';
  order.updated_at = nowIso();
  recordHistory(order.id, prev, 'Cancelled', req.user, reason);
  db.saveDatabase();

  notifyPrintingAdmins(
    `Printing Order Cancelled: ${order.order_reference}`,
    `${order.customer_name} cancelled their printing order. Reason: ${reason}`,
    order.order_reference
  );

  res.json({
    success: true,
    message: 'Order cancelled.',
    order: sanitizeOrderForCustomer(order),
  });
});

printingRouter.post('/orders/:id/messages', requireAuthUser, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const message = String(req.body?.message || '').trim();
  const attachmentUrl = String(req.body?.attachment_url || '').trim();
  if (!message) return res.status(422).json({ error: 'Message cannot be empty.' });

  const order = (db.data.printing_orders || []).find(
    (o: any) => (o.id === id || o.order_reference === id) && o.user_id === req.user.id
  );
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const msg = {
    id: makeUuid(),
    order_id: order.id,
    sender_id: req.user.id,
    sender_name: req.user.full_name || req.user.email,
    sender_role: 'customer',
    message,
    attachment_url: attachmentUrl || null,
    is_internal: false,
    created_at: nowIso(),
  };

  if (!db.data.printing_order_messages) db.data.printing_order_messages = [];
  db.data.printing_order_messages.push(msg);
  db.saveDatabase();

  notifyPrintingAdmins(`Message on ${order.order_reference}`, `${order.customer_name}: ${message}`, order.order_reference);

  res.status(201).json({
    success: true,
    message: 'Message sent to printing desk.',
    item: msg,
  });
});

// ============================================================================
// B. ADMIN & AUTHORISED STAFF ENDPOINTS (/api/admin/printing/*)
// ============================================================================

adminPrintingRouter.get('/metrics', requirePrintingRead, (req, res) => {
  const orders = db.data.printing_orders || [];
  const byStatus: Record<string, number> = {};
  for (const st of PRINTING_ORDER_STATUSES) byStatus[st] = 0;

  let totalRevenue = 0;
  let totalCollected = 0;
  let totalDeliveryFees = 0;
  let totalInternalCost = 0;
  let pendingCollection = 0;
  let pendingDispatch = 0;
  let activeProduction = 0;

  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    if (!['Rejected', 'Cancelled', 'Refunded'].includes(o.status)) {
      totalRevenue += Number(o.total_amount ?? 0);
      totalCollected += Number(o.amount_paid ?? 0);
      totalDeliveryFees += Number(o.delivery_charge ?? 0);
      totalInternalCost += Number(o.internal_production_cost ?? 0);
    }
    if (o.status === 'Ready for Collection') pendingCollection++;
    if (o.status === 'Ready for Dispatch') pendingDispatch++;
    if (['Payment Confirmed', 'Processing'].includes(o.status)) activeProduction++;
  }

  const pendingPayments = (db.data.printing_payments || []).filter((p: any) => p.status === 'pending');

  res.json({
    success: true,
    total_orders: orders.length,
    pending_requests: (byStatus['Pending Review'] ?? 0) + (byStatus['Under Review'] ?? 0) + (byStatus['Awaiting Quotation'] ?? 0),
    quotations_pending_customer: byStatus['Quotation Sent'] ?? 0,
    awaiting_payment: byStatus['Awaiting Payment'] ?? 0,
    active_production: activeProduction,
    ready_for_collection: pendingCollection,
    ready_for_dispatch: pendingDispatch,
    completed_orders: byStatus['Completed'] ?? 0,
    pending_payment_verifications: pendingPayments.length,
    pending_payment_volume: pendingPayments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0),
    total_quoted_revenue: Number(totalRevenue.toFixed(2)),
    total_collected: Number(totalCollected.toFixed(2)),
    total_delivery_revenue: Number(totalDeliveryFees.toFixed(2)),
    total_internal_cost: Number(totalInternalCost.toFixed(2)),
    estimated_gross_profit: Number((totalRevenue - totalInternalCost).toFixed(2)),
    status_counts: byStatus,
  });
});

adminPrintingRouter.get('/orders', requirePrintingOps, (req, res) => {
  const { status, category_key, assigned_staff_id, search } = req.query;
  let list = [...(db.data.printing_orders || [])];

  if (status && status !== 'all') list = list.filter((o: any) => o.status === status);
  if (category_key && category_key !== 'all') list = list.filter((o: any) => o.category_key === category_key);
  if (assigned_staff_id && assigned_staff_id !== 'all') list = list.filter((o: any) => o.assigned_staff_id === assigned_staff_id);
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter((o: any) =>
      String(o.order_reference || '').toLowerCase().includes(q) ||
      String(o.customer_name || '').toLowerCase().includes(q) ||
      String(o.customer_email || '').toLowerCase().includes(q) ||
      String(o.service_title || '').toLowerCase().includes(q)
    );
  }

  list.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  res.json({ success: true, orders: list.slice(0, 300).map(formatOrderForAdmin) });
});

adminPrintingRouter.get('/orders/:id', requirePrintingOps, (req, res) => {
  const id = String(req.params.id || '').trim();
  const order = (db.data.printing_orders || []).find((o: any) => o.id === id || o.order_reference === id);
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const history = (db.data.printing_order_history || []).filter((h: any) => h.order_id === order.id);
  const messages = (db.data.printing_order_messages || []).filter((m: any) => m.order_id === order.id);
  const payments = (db.data.printing_payments || [])
    .filter((p: any) => p.order_id === order.id)
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

  res.json({
    success: true,
    order: formatOrderForAdmin(order),
    history,
    messages,
    payments,
  });
});

adminPrintingRouter.post('/orders/:id/quote', requirePrintingOps, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const body = req.body || {};
  const order = (db.data.printing_orders || []).find((o: any) => o.id === id || o.order_reference === id);
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const printingCharge = Math.max(0, Number(body.printing_charge ?? order.printing_charge ?? 0));
  const finishingCharge = Math.max(0, Number(body.finishing_charge ?? order.finishing_charge ?? 0));
  const urgentCharge = Math.max(0, Number(body.urgent_charge ?? order.urgent_charge ?? 0));
  const discountAmount = Math.max(0, Number(body.discount_amount ?? order.discount_amount ?? 0));
  const freeDeliveryAuth = Boolean(body.free_delivery_authorized);
  const deliveryCharge =
    order.collection_method === 'office_collection' || freeDeliveryAuth
      ? 0
      : Math.max(0, Number(body.delivery_charge ?? order.delivery_charge ?? 0));

  const totalAmount = Math.max(0, Number(((printingCharge + finishingCharge + urgentCharge + deliveryCharge) - discountAmount).toFixed(2)));
  if (totalAmount <= 0) {
    return res.status(422).json({ error: 'Quotation total amount must be greater than ₦0.00.' });
  }

  const depositEnabled = Boolean(body.deposit_enabled);
  const depositPercent = Math.max(10, Math.min(90, Number(body.deposit_percent ?? 50)));
  const depositAmount = depositEnabled
    ? Math.max(1, Math.min(totalAmount, Number(body.deposit_amount ?? Number((totalAmount * (depositPercent / 100)).toFixed(2)))))
    : totalAmount;
  const reqInitial = depositEnabled ? depositAmount : totalAmount;
  const amountPaid = Number(order.amount_paid ?? 0);
  const balanceDue = Math.max(0, Number((totalAmount - amountPaid).toFixed(2)));
  const internalCost = body.internal_production_cost !== undefined
    ? Math.max(0, Number(body.internal_production_cost))
    : Number(order.internal_production_cost ?? 0);

  const prevStatus = order.status;
  order.status = 'Quotation Sent';
  order.printing_charge = printingCharge;
  order.finishing_charge = finishingCharge;
  order.urgent_charge = urgentCharge;
  order.discount_amount = discountAmount;
  order.delivery_charge = deliveryCharge;
  order.free_delivery_authorized = freeDeliveryAuth;
  order.delivery_payment_status =
    order.collection_method === 'office_collection'
      ? 'not_applicable'
      : freeDeliveryAuth || deliveryCharge <= 0
        ? 'free_authorized'
        : balanceDue <= 0
          ? 'paid'
          : 'pending';
  order.total_amount = totalAmount;
  order.deposit_enabled = depositEnabled;
  order.deposit_percent = depositPercent;
  order.deposit_amount = depositAmount;
  order.required_initial_payment = reqInitial;
  order.balance_due = balanceDue;
  order.quote_notes = body.quote_notes ? String(body.quote_notes).trim() : null;
  order.quote_sent_at = nowIso();
  order.quote_decision = 'pending';
  order.internal_production_cost = internalCost;
  order.due_date = body.due_date || null;
  order.updated_at = nowIso();

  recordHistory(
    order.id,
    prevStatus,
    'Quotation Sent',
    req.user,
    `Official quotation sent: Total ₦${totalAmount.toLocaleString()}${depositEnabled ? ` (Deposit option: ₦${depositAmount.toLocaleString()})` : ''}`
  );
  db.saveDatabase();

  notifyCustomerLifecycle(
    order,
    'Printing Quotation Ready',
    `Your quotation for "${order.service_title}" is ready: Total ₦${totalAmount.toLocaleString()} (Printing/Finishing: ₦${(printingCharge + finishingCharge + urgentCharge - discountAmount).toLocaleString()}, Delivery: ₦${deliveryCharge.toLocaleString()}).${depositEnabled ? ` Deposit option enabled: ₦${depositAmount.toLocaleString()}.` : ''} Review and approve on your dashboard.`,
    'info'
  );

  res.json({
    success: true,
    message: 'Quotation prepared and sent to customer.',
    order: formatOrderForAdmin(order),
  });
});

adminPrintingRouter.post('/orders/:id/status', requirePrintingOps, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const newStatus = String(req.body?.status || '').trim();
  const note = String(req.body?.note || '').trim();
  const trackingNote = String(req.body?.tracking_note || '').trim();
  const refundToWallet = Boolean(req.body?.refund_to_wallet);

  if (!PRINTING_ORDER_STATUSES.includes(newStatus as any)) {
    return res.status(422).json({ error: 'Invalid printing order status selected.' });
  }

  const order = (db.data.printing_orders || []).find((o: any) => o.id === id || o.order_reference === id);
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  if (newStatus === 'Out for Delivery') {
    try {
      assertDispatchAuthorized(order);
    } catch (err: any) {
      return res.status(409).json({ error: err.message });
    }
  }

  const prev = order.status;
  order.status = newStatus;
  if (trackingNote) order.tracking_note = trackingNote;
  if (newStatus === 'Completed') order.completed_at = nowIso();

  if (newStatus === 'Refunded') {
    const paid = Number(order.amount_paid ?? 0);
    if (paid > 0 && refundToWallet && order.payment_status !== 'refunded') {
      const refRef = `PRT_REF_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      db.adjustBalance(
        order.user_id,
        paid,
        'printing_refund',
        `Printing refund for ${order.order_reference}`,
        'internal',
        { order_id: order.id, refunded_by: req.user.id, reference: refRef }
      );
      for (const p of db.data.printing_payments || []) {
        if (p.order_id === order.id && p.status === 'confirmed') p.status = 'refunded';
      }
    }
    order.payment_status = 'refunded';
  }

  order.updated_at = nowIso();
  recordHistory(order.id, prev, newStatus, req.user, note || `Status updated to ${newStatus}`);
  db.saveDatabase();

  const notifMap: Record<string, [string, string, 'info' | 'success' | 'warning' | 'alert']> = {
    'Under Review': ['Printing Review Started', 'Our printing team is reviewing your files and job specifications.', 'info'],
    'Awaiting Quotation': ['Quotation Being Prepared', 'Your job specs are verified and your quotation is being prepared.', 'info'],
    'Payment Confirmed': ['Payment Confirmed', 'Your payment has been confirmed. Job is queued for production.', 'success'],
    'Processing': ['Printing Production Started', 'Your printing job is now actively in production.', 'info'],
    'On Hold': ['Printing Job On Hold', note || 'Your job has been placed on hold pending clarification.', 'warning'],
    'Ready for Collection': ['Ready for Office Collection', 'Great news! Your print job is complete and ready for collection at our main office.', 'success'],
    'Ready for Dispatch': ['Ready for Delivery Dispatch', 'Your print job is packaged and queued for Lagos dispatch.', 'success'],
    'Out for Delivery': ['Order Out for Delivery', trackingNote || 'Your printing order is out for delivery to your Lagos address.', 'info'],
    'Completed': ['Printing Order Completed', 'Your printing order has been marked Completed. Thank you for choosing HambakTech!', 'success'],
    'Rejected': ['Printing Request Rejected', note || 'Your printing request could not be processed.', 'alert'],
    'Cancelled': ['Printing Order Cancelled', note || 'Your printing order has been cancelled.', 'warning'],
    'Refunded': ['Printing Payment Refunded', note || 'A refund has been processed for your printing order.', 'info'],
  };
  if (notifMap[newStatus]) {
    const [t, m, tp] = notifMap[newStatus];
    notifyCustomerLifecycle(order, t, m, tp);
  }

  res.json({
    success: true,
    message: `Order status updated to ${newStatus}.`,
    order: formatOrderForAdmin(order),
  });
});

adminPrintingRouter.post('/orders/:id/assign', requirePrintingOps, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const staffId = String(req.body?.staff_id || '').trim();

  const order = (db.data.printing_orders || []).find((o: any) => o.id === id || o.order_reference === id);
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  let staff: any = null;
  if (staffId) {
    staff = db.data.users.find(
      (u) => u.id === staffId && (u.role === 'admin' || u.role === 'staff' || u.role === 'superadmin') && u.status === 'active'
    );
    if (!staff) return res.status(404).json({ error: 'Selected active staff member not found.' });
  }

  order.assigned_staff_id = staff ? staff.id : null;
  order.assigned_staff_name = staff ? staff.full_name : null;
  order.updated_at = nowIso();
  recordHistory(order.id, order.status, order.status, req.user, staff ? `Assigned printing job to ${staff.full_name}` : 'Unassigned staff from job');
  db.saveDatabase();

  if (staff && staff.id !== req.user.id) {
    db.addNotification(
      staff.id,
      `Printing Job Assigned: ${order.order_reference}`,
      `You have been assigned ${order.order_reference} (${order.service_title}) by ${req.user.full_name}.`,
      'info'
    );
  }

  res.json({ success: true, message: 'Staff assignment updated.', order: formatOrderForAdmin(order) });
});

adminPrintingRouter.post('/orders/:id/confirm-dispatch', requirePrintingOps, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const trackingNote = String(req.body?.tracking_note || 'Dispatched from HambakTech Printing Desk').trim();
  const moveToOut = req.body?.mark_out_for_delivery !== undefined ? Boolean(req.body.mark_out_for_delivery) : true;

  const order = (db.data.printing_orders || []).find((o: any) => o.id === id || o.order_reference === id);
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  try {
    assertDispatchAuthorized({ ...order, dispatch_confirmed: true });
  } catch (err: any) {
    return res.status(409).json({ error: err.message });
  }

  const prev = order.status;
  const targetStatus = moveToOut ? 'Out for Delivery' : prev;
  order.dispatch_confirmed = true;
  order.dispatch_confirmed_by = req.user.id;
  order.dispatch_confirmed_by_name = req.user.full_name || req.user.email;
  order.dispatch_confirmed_at = nowIso();
  order.tracking_note = trackingNote;
  order.status = targetStatus;
  order.updated_at = nowIso();

  recordHistory(order.id, prev, targetStatus, req.user, `Dispatch confirmed: ${trackingNote}`);
  db.saveDatabase();

  notifyCustomerLifecycle(
    order,
    moveToOut ? 'Printing Order Out for Delivery' : 'Dispatch Confirmed',
    `${trackingNote}. Destination: ${order.delivery_lga_lcda || 'Lagos'}`,
    'info'
  );

  res.json({ success: true, message: 'Dispatch confirmed.', order: formatOrderForAdmin(order) });
});

adminPrintingRouter.post('/orders/:id/payments', requirePrintingOps, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const body = req.body || {};

  const order = (db.data.printing_orders || []).find((o: any) => o.id === id || o.order_reference === id);
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const amount = Number(Number(body.amount ?? 0).toFixed(2));
  let scope = String(body.payment_scope || 'full').trim().toLowerCase();
  let gateway = String(body.gateway || 'manual_transfer').trim().toLowerCase();
  const remarks = String(body.remarks || 'Recorded by admin').trim();

  if (amount <= 0) return res.status(422).json({ error: 'Payment amount must be greater than zero.' });
  if (!['full', 'deposit', 'balance', 'delivery'].includes(scope)) scope = 'full';
  if (!['wallet', 'paystack', 'flutterwave', 'manual_transfer', 'cash', 'pos'].includes(gateway)) gateway = 'cash';

  const payId = makeUuid();
  const ref = String(body.reference || '').trim() || `PRTADM_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

  if (!db.data.printing_payments) db.data.printing_payments = [];
  db.data.printing_payments.unshift({
    id: payId,
    order_id: order.id,
    user_id: order.user_id,
    reference: ref,
    payment_scope: scope,
    gateway,
    amount,
    status: 'confirmed',
    payer_name: order.customer_name,
    bank_reference: ref,
    remarks,
    confirmed_by: req.user.id,
    confirmed_by_name: req.user.full_name || req.user.email,
    confirmed_at: nowIso(),
    created_at: nowIso(),
  });

  const updated = applyConfirmedPayment(order, amount, scope, req.user, `Admin confirmed ${gateway} payment (${ref})`);
  res.json({ success: true, message: 'Payment recorded and confirmed.', order: formatOrderForAdmin(updated) });
});

adminPrintingRouter.get('/payments', requirePrintingOps, (req, res) => {
  const ordersById = new Map((db.data.printing_orders || []).map((o: any) => [o.id, o]));
  const payments = (db.data.printing_payments || [])
    .map((p: any) => {
      const ord: any = ordersById.get(p.order_id);
      return {
        ...p,
        order_reference: ord?.order_reference || '',
        customer_name: ord?.customer_name || p.payer_name || '',
        customer_email: ord?.customer_email || '',
        service_title: ord?.service_title || '',
      };
    })
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 250);

  res.json({ success: true, payments });
});

adminPrintingRouter.post('/payments/:pid/review', requirePrintingOps, (req: any, res) => {
  const pid = String(req.params.pid || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  const remarks = String(req.body?.remarks || '').trim();

  if (!['confirm', 'approve', 'reject'].includes(action)) {
    return res.status(422).json({ error: 'Action must be confirm or reject.' });
  }

  const payment = (db.data.printing_payments || []).find((p: any) => p.id === pid);
  if (!payment) return res.status(404).json({ error: 'Printing payment record not found.' });
  if (payment.status !== 'pending') return res.status(409).json({ error: `Payment is already '${payment.status}'.` });

  const order = (db.data.printing_orders || []).find((o: any) => o.id === payment.order_id);
  if (!order) return res.status(404).json({ error: 'Associated printing order not found.' });

  if (action === 'reject') {
    payment.status = 'rejected';
    payment.remarks = remarks || 'Transfer could not be verified.';
    payment.confirmed_by = req.user.id;
    payment.confirmed_by_name = req.user.full_name || req.user.email;
    payment.confirmed_at = nowIso();
    db.saveDatabase();

    notifyCustomerLifecycle(
      order,
      'Printing Payment Rejected',
      `Your payment proof (${payment.reference}) of ₦${Number(payment.amount).toLocaleString()} was rejected. Reason: ${remarks || 'Unverified transfer'}`,
      'alert'
    );
    return res.json({ success: true, message: 'Payment rejected.' });
  }

  payment.status = 'confirmed';
  payment.remarks = remarks || 'Verified & confirmed by finance/printing desk';
  payment.confirmed_by = req.user.id;
  payment.confirmed_by_name = req.user.full_name || req.user.email;
  payment.confirmed_at = nowIso();

  const updated = applyConfirmedPayment(order, Number(payment.amount), payment.payment_scope, req.user, `Confirmed transfer payment (${payment.reference})`);
  res.json({ success: true, message: 'Printing payment confirmed!', order: formatOrderForAdmin(updated) });
});

adminPrintingRouter.post('/orders/:id/messages', requirePrintingOps, (req: any, res) => {
  const id = String(req.params.id || '').trim();
  const message = String(req.body?.message || '').trim();
  const isInternal = Boolean(req.body?.is_internal);
  if (!message) return res.status(422).json({ error: 'Message cannot be empty.' });

  const order = (db.data.printing_orders || []).find((o: any) => o.id === id || o.order_reference === id);
  if (!order) return res.status(404).json({ error: 'Printing order not found.' });

  const msg = {
    id: makeUuid(),
    order_id: order.id,
    sender_id: req.user.id,
    sender_name: req.user.full_name || req.user.email,
    sender_role: req.user.role || 'admin',
    message,
    is_internal: isInternal,
    created_at: nowIso(),
  };

  if (!db.data.printing_order_messages) db.data.printing_order_messages = [];
  db.data.printing_order_messages.push(msg);
  db.saveDatabase();

  if (!isInternal) {
    notifyCustomerLifecycle(order, 'New Message from Printing Desk', message, 'info');
  }

  res.status(201).json({
    success: true,
    message: isInternal ? 'Internal note added.' : 'Reply sent to customer.',
    item: msg,
  });
});

adminPrintingRouter.get('/reports', requirePrintingOps, (req, res) => {
  const orders = (db.data.printing_orders || []).filter((o: any) => !['Rejected', 'Cancelled', 'Refunded'].includes(o.status));
  const catMap = new Map<string, any>();
  for (const o of orders) {
    const entry = catMap.get(o.category_key) || {
      category_key: o.category_key,
      category_name: o.category_name,
      order_count: 0,
      quoted_total: 0,
      collected_total: 0,
      delivery_total: 0,
      internal_cost_total: 0,
      margin: 0,
    };
    entry.order_count++;
    entry.quoted_total += Number(o.total_amount ?? 0);
    entry.collected_total += Number(o.amount_paid ?? 0);
    entry.delivery_total += Number(o.delivery_charge ?? 0);
    entry.internal_cost_total += Number(o.internal_production_cost ?? 0);
    entry.margin = Number((entry.quoted_total - entry.internal_cost_total).toFixed(2));
    catMap.set(o.category_key, entry);
  }

  const staffMap = new Map<string, any>();
  for (const o of db.data.printing_orders || []) {
    const sName = o.assigned_staff_name || 'Unassigned';
    const sEntry = staffMap.get(sName) || { staff_name: sName, total_jobs: 0, completed_jobs: 0 };
    sEntry.total_jobs++;
    if (o.status === 'Completed') sEntry.completed_jobs++;
    staffMap.set(sName, sEntry);
  }

  res.json({
    success: true,
    by_category: Array.from(catMap.values()),
    by_staff: Array.from(staffMap.values()),
  });
});

adminPrintingRouter.get('/staff-list', requirePrintingOps, (req, res) => {
  const staff = db.data.users
    .filter((u) => (u.role === 'superadmin' || u.role === 'admin' || u.role === 'staff') && u.status === 'active' && hasUserPermission(u, 'printing'))
    .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role }));
  res.json({ success: true, staff });
});

// Pricing & Category Config (printing_pricing)
adminPrintingRouter.get('/categories', requirePrintingRead, (req, res) => {
  const cats = [...(db.data.printing_categories || [])]
    .sort((a: any, b: any) => Number(a.display_order ?? 1) - Number(b.display_order ?? 1))
    .map((c: any) => decodeCategory(c, true));
  res.json({ success: true, categories: cats });
});

function handleSaveCategory(req: any, res: any) {
  const id = String(req.params.id || req.body?.id || '').trim();
  const body = req.body || {};
  if (!db.data.printing_categories) db.data.printing_categories = [];

  const idx = id
    ? db.data.printing_categories.findIndex((c: any) => c.id === id || c.category_key === id)
    : -1;
  const existing = idx !== -1 ? db.data.printing_categories[idx] : null;

  if (!existing && !body.name) {
    return res.status(422).json({ error: 'Category name is required.' });
  }

  const catId = existing ? existing.id : makeUuid();
  const catKey = existing
    ? existing.category_key
    : String(body.category_key || String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '_')).trim();

  const updated = {
    ...(existing || {}),
    id: catId,
    category_key: catKey,
    name: String(body.name ?? existing?.name ?? '').trim(),
    description: String(body.description ?? existing?.description ?? '').trim(),
    icon: String(body.icon ?? existing?.icon ?? 'Printer').trim(),
    pricing_mode: String(body.pricing_mode ?? existing?.pricing_mode ?? 'per_page'),
    measurement_method: String(body.measurement_method ?? existing?.measurement_method ?? 'per_page'),
    unit_label: String(body.unit_label ?? existing?.unit_label ?? 'unit'),
    base_rate: Math.max(0, Number(body.base_rate ?? existing?.base_rate ?? 0)),
    bw_rate: Math.max(0, Number(body.bw_rate ?? existing?.bw_rate ?? 0)),
    color_rate: Math.max(0, Number(body.color_rate ?? existing?.color_rate ?? 0)),
    min_quantity: Math.max(1, Math.floor(Number(body.min_quantity ?? existing?.min_quantity ?? 1))),
    urgent_fee_type: ['flat', 'percent'].includes(body.urgent_fee_type ?? existing?.urgent_fee_type)
      ? (body.urgent_fee_type ?? existing?.urgent_fee_type)
      : 'percent',
    urgent_fee_value: Math.max(0, Number(body.urgent_fee_value ?? existing?.urgent_fee_value ?? 25)),
    paper_sizes: body.paper_sizes ?? existing?.paper_sizes ?? [],
    size_rates: body.size_rates ?? existing?.size_rates ?? {},
    finishing_options: body.finishing_options ?? existing?.finishing_options ?? [],
    bulk_discounts: body.bulk_discounts ?? existing?.bulk_discounts ?? [],
    field_schema: body.field_schema ?? existing?.field_schema ?? [],
    requires_manual_quote: body.requires_manual_quote !== undefined ? Boolean(body.requires_manual_quote) : Boolean(existing?.requires_manual_quote ?? true),
    internal_cost_estimate: Math.max(0, Number(body.internal_cost_estimate ?? existing?.internal_cost_estimate ?? 0)),
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : Boolean(existing?.is_active ?? true),
    display_order: Number(body.display_order ?? existing?.display_order ?? 10),
    updated_at: nowIso(),
  };

  if (idx !== -1) db.data.printing_categories[idx] = updated;
  else db.data.printing_categories.push(updated);

  db.logAudit('PRINTING_CATEGORY_UPDATED', { category_key: catKey }, req.user.id, req.user.email);
  db.saveDatabase();

  res.json({ success: true, message: 'Printing service pricing saved.', category: decodeCategory(updated, true) });
}

adminPrintingRouter.post('/categories', requirePrintingPricing, handleSaveCategory);
adminPrintingRouter.put('/categories/:id', requirePrintingPricing, handleSaveCategory);

// Delivery Zones (printing_pricing)
adminPrintingRouter.get('/delivery-zones', requirePrintingRead, (req, res) => {
  const zones = [...(db.data.printing_delivery_zones || [])].sort(
    (a: any, b: any) => Number(a.display_order ?? 1) - Number(b.display_order ?? 1)
  );
  res.json({ success: true, zones });
});

function handleSaveZone(req: any, res: any) {
  const id = String(req.params.id || req.body?.id || '').trim();
  const body = req.body || {};
  if (!db.data.printing_delivery_zones) db.data.printing_delivery_zones = [];

  const idx = id ? db.data.printing_delivery_zones.findIndex((z: any) => z.id === id) : -1;
  const existing = idx !== -1 ? db.data.printing_delivery_zones[idx] : null;

  if (!existing && (!body.destination_group || !body.lga_lcda)) {
    return res.status(422).json({ error: 'Destination group and Lagos LGA/LCDA are required.' });
  }

  const pMode = ['fixed', 'manual_quote', 'free'].includes(body.pricing_mode ?? existing?.pricing_mode)
    ? (body.pricing_mode ?? existing?.pricing_mode)
    : 'fixed';

  const updated = {
    ...(existing || {}),
    id: existing ? existing.id : makeUuid(),
    zone_key: existing ? existing.zone_key : String(body.zone_key || `zone_${crypto.randomBytes(4).toString('hex')}`),
    destination_group: String(body.destination_group ?? existing?.destination_group ?? '').trim(),
    lga_lcda: String(body.lga_lcda ?? existing?.lga_lcda ?? '').trim(),
    towns_covered: String(body.towns_covered ?? existing?.towns_covered ?? '').trim(),
    pricing_mode: pMode,
    fixed_fee: Math.max(0, Number(body.fixed_fee ?? existing?.fixed_fee ?? 0)),
    free_delivery_enabled: body.free_delivery_enabled !== undefined ? Boolean(body.free_delivery_enabled) : Boolean(existing?.free_delivery_enabled),
    free_delivery_min_order: Math.max(0, Number(body.free_delivery_min_order ?? existing?.free_delivery_min_order ?? 0)),
    estimated_eta: String(body.estimated_eta ?? existing?.estimated_eta ?? 'Same Day / Next Business Day').trim(),
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : Boolean(existing?.is_active ?? true),
    display_order: Number(body.display_order ?? existing?.display_order ?? 10),
    updated_at: nowIso(),
  };

  if (idx !== -1) db.data.printing_delivery_zones[idx] = updated;
  else db.data.printing_delivery_zones.push(updated);

  db.saveDatabase();
  res.json({ success: true, message: 'Delivery zone saved.', zone: updated });
}

adminPrintingRouter.post('/delivery-zones', requirePrintingPricing, handleSaveZone);
adminPrintingRouter.put('/delivery-zones/:id', requirePrintingPricing, handleSaveZone);

adminPrintingRouter.get('/settings', requirePrintingRead, (req, res) => {
  res.json({ success: true, settings: getPrintingSettings() });
});

adminPrintingRouter.put('/settings', requirePrintingPricing, (req: any, res) => {
  const current = getPrintingSettings();
  const next = { ...current };
  for (const key of Object.keys(current)) {
    if (req.body && req.body[key] !== undefined) {
      (next as any)[key] = req.body[key];
    }
  }
  next.default_deposit_percent = Math.max(10, Math.min(90, Number(next.default_deposit_percent ?? 50)));
  next.max_upload_mb = Math.max(2, Math.min(50, Number(next.max_upload_mb ?? 15)));
  db.data.printing_settings = next;
  db.saveDatabase();

  res.json({ success: true, message: 'Printing module settings saved.', settings: next });
});
