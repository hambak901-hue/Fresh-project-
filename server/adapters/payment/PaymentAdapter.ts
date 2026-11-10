/**
 * @file PaymentAdapter.ts
 * Enterprise Payment Gateway Adapter Architecture for HambakTech Portal.
 * Supports:
 * 1. Paystack (Primary operational gateway - Initialization, Checkout Authorization, Verification, Webhook validation)
 * 2. Flutterwave (Prepared as Coming Soon adapter - Separate architecture ready for activation)
 * 3. Manual Bank Transfer (Moniepoint / Commercial Bank Desk)
 */

import crypto from 'crypto';
import { CREDENTIALS } from '../../config/credentials.js';
import { db } from '../../db/database.js';

export interface PaymentInitializationResult {
  success: boolean;
  reference: string;
  authorization_url?: string;
  access_code?: string;
  amount: number;
  currency: string;
  gateway: string;
  message: string;
  is_simulated?: boolean;
}

export interface PaymentVerificationResult {
  success: boolean;
  verified: boolean;
  reference: string;
  amount: number; // in Naira (not kobo)
  currency: string;
  gateway: string;
  customer_email: string;
  paid_at?: string;
  channel?: string;
  message: string;
  raw_response?: any;
}

export interface PaymentGatewayInterface {
  getId(): string;
  getName(): string;
  getStatus(): 'active' | 'coming_soon' | 'disabled';
  initializePayment(params: {
    email: string;
    amount: number; // in Naira
    reference: string;
    callback_url?: string;
    metadata?: any;
  }): Promise<PaymentInitializationResult>;
  verifyPayment(reference: string): Promise<PaymentVerificationResult>;
  validateWebhookSignature(rawBody: string | Buffer, signatureHeader: string): boolean;
}

/**
 * Paystack Payment Gateway Implementation
 * Official Docs: https://paystack.com/docs/
 */
export class PaystackAdapter implements PaymentGatewayInterface {
  private secretKey: string;
  private baseUrl = 'https://api.paystack.co';

  constructor(secretKey?: string) {
    this.secretKey = secretKey || CREDENTIALS.payments?.paystack?.secretKey || process.env.PAYSTACK_SECRET_KEY || '';
  }

  getId(): string {
    return 'paystack';
  }

  getName(): string {
    return 'Paystack Payment Gateway';
  }

  getStatus(): 'active' | 'coming_soon' | 'disabled' {
    return 'active';
  }

  /**
   * 1. Initialize Paystack Transaction
   * Endpoint: POST https://api.paystack.co/transaction/initialize
   * Amount sent in kobo (NGN * 100)
   */
  async initializePayment(params: {
    email: string;
    amount: number;
    reference: string;
    callback_url?: string;
    metadata?: any;
  }): Promise<PaymentInitializationResult> {
    const koboAmount = Math.round(params.amount * 100);

    const payload = {
      email: params.email,
      amount: koboAmount,
      reference: params.reference,
      callback_url: params.callback_url || `${process.env.APP_URL || 'https://hambaktech.com.ng'}/customer/wallet?payment_ref=${params.reference}`,
      currency: 'NGN',
      metadata: {
        ...params.metadata,
        custom_fields: [
          {
            display_name: 'Customer Email',
            variable_name: 'customer_email',
            value: params.email,
          },
          {
            display_name: 'Service Portal',
            variable_name: 'portal',
            value: 'HambakTech Enterprise',
          },
        ],
      },
    };

    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const latency = Date.now() - start;
      const data: any = await res.json().catch(() => ({}));

      if (typeof db.logProviderCall === 'function') {
        db.logProviderCall('paystack', '/transaction/initialize', 'POST', res.status, payload, data, latency, params.reference);
      }

      if (res.ok && data.status && data.data?.authorization_url) {
        return {
          success: true,
          reference: params.reference,
          authorization_url: data.data.authorization_url,
          access_code: data.data.access_code,
          amount: params.amount,
          currency: 'NGN',
          gateway: 'paystack',
          message: 'Paystack authorization URL generated successfully',
        };
      }
    } catch (err: any) {
      console.warn('Paystack live initialization error:', err.message);
      return {
        success: false,
        reference: params.reference,
        amount: params.amount,
        currency: 'NGN',
        gateway: 'paystack',
        message: err.message || 'Paystack live payment initialization failed.',
      };
    }

    return {
      success: false,
      reference: params.reference,
      amount: params.amount,
      currency: 'NGN',
      gateway: 'paystack',
      message: 'Paystack live payment initialization failed. Valid credentials required.',
    };
  }

  /**
   * 2. Verify Paystack Transaction
   * Endpoint: GET https://api.paystack.co/transaction/verify/:reference
   */
  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      });

      const latency = Date.now() - start;
      const data: any = await res.json().catch(() => ({}));

      if (typeof db.logProviderCall === 'function') {
        db.logProviderCall('paystack', `/transaction/verify/${reference}`, 'GET', res.status, null, data, latency, reference);
      }

      if (res.ok && data.status && data.data) {
        const item = data.data;
        const verified = item.status === 'success';
        const nairaAmount = item.amount ? item.amount / 100 : 0;

        return {
          success: true,
          verified,
          reference,
          amount: nairaAmount,
          currency: item.currency || 'NGN',
          gateway: 'paystack',
          customer_email: item.customer?.email || '',
          paid_at: item.paid_at,
          channel: item.channel,
          message: item.gateway_response || 'Paystack verification processed',
          raw_response: item,
        };
      }

      return {
        success: false,
        verified: false,
        reference,
        amount: 0,
        currency: 'NGN',
        gateway: 'paystack',
        customer_email: '',
        message: data.message || 'Transaction reference could not be verified on Paystack gateway',
      };
    } catch (err: any) {
      console.warn('Paystack remote verification error:', err.message);
      return {
        success: false,
        verified: false,
        reference,
        amount: 0,
        currency: 'NGN',
        gateway: 'paystack',
        customer_email: '',
        message: err.message || 'Paystack network verification failed',
      };
    }
  }

  /**
   * 3. Validate Webhook Signature
   * Paystack signs all webhooks with HMAC SHA512 using your secret key in `x-paystack-signature`
   */
  validateWebhookSignature(rawBody: string | Buffer, signatureHeader: string): boolean {
    if (!signatureHeader || !this.secretKey) return false;
    try {
      const hash = crypto
        .createHmac('sha512', this.secretKey)
        .update(rawBody)
        .digest('hex');
      return hash === signatureHeader;
    } catch {
      return false;
    }
  }
}

/**
 * Flutterwave Gateway Adapter (Live & Activated)
 * Official Docs: https://developer.flutterwave.com/docs/quickstart
 */
export class FlutterwaveAdapter implements PaymentGatewayInterface {
  private secretKey: string;
  private publicKey: string;
  private secretHash: string;
  private baseUrl = 'https://api.flutterwave.com/v3';

  constructor() {
    this.secretKey = CREDENTIALS.payments?.flutterwave?.secretKey || process.env.FLUTTERWAVE_SECRET_KEY || '';
    this.publicKey = CREDENTIALS.payments?.flutterwave?.clientId || process.env.FLUTTERWAVE_PUBLIC_KEY || '';
    this.secretHash = process.env.FLW_SECRET_HASH || 'HambakTech_FLW_Webhook_Secure_Key';
  }

  getId(): string {
    return 'flutterwave';
  }

  getName(): string {
    return 'Flutterwave Payment Gateway';
  }

  getStatus(): 'active' | 'coming_soon' | 'disabled' {
    return 'active';
  }

  async initializePayment(params: {
    email: string;
    amount: number;
    reference: string;
    callback_url?: string;
    metadata?: any;
  }): Promise<PaymentInitializationResult> {
    if (!this.secretKey) {
      return {
        success: false,
        reference: params.reference,
        amount: params.amount,
        currency: 'NGN',
        gateway: 'flutterwave',
        message: 'Flutterwave Secret Key is not configured. Please supply FLUTTERWAVE_SECRET_KEY.',
      };
    }

    const payload = {
      tx_ref: params.reference,
      amount: String(params.amount),
      currency: 'NGN',
      redirect_url: params.callback_url || `${process.env.APP_URL || 'https://hambaktech.com.ng'}/customer/wallet?payment_ref=${params.reference}`,
      payment_options: 'card,ussd,banktransfer,account',
      meta: {
        ...params.metadata,
        platform: 'HambakTech Enterprise',
        service: 'Wallet Funding',
      },
      customer: {
        email: params.email,
        name: params.metadata?.customer_name || 'HambakTech Customer',
      },
      customizations: {
        title: 'HambakTech Wallet Top-Up',
        description: 'Official wallet funding for telecommunications and NIMC verification',
        logo: 'https://hambaktech.com.ng/logo.svg',
      },
    };

    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const latency = Date.now() - start;
      const data: any = await res.json().catch(() => ({}));

      if (typeof db.logProviderCall === 'function') {
        db.logProviderCall('flutterwave', '/payments', 'POST', res.status, payload, data, latency, params.reference);
      }

      if (res.ok && data.status === 'success' && data.data?.link) {
        return {
          success: true,
          reference: params.reference,
          authorization_url: data.data.link,
          amount: params.amount,
          currency: 'NGN',
          gateway: 'flutterwave',
          message: 'Flutterwave hosted payment link generated successfully',
        };
      }

      const msg = data.message || `Flutterwave payment initialization failed (HTTP ${res.status})`;
      return {
        success: false,
        reference: params.reference,
        amount: params.amount,
        currency: 'NGN',
        gateway: 'flutterwave',
        message: msg,
      };
    } catch (err: any) {
      console.warn('Flutterwave live initialization error:', err.message);
      return {
        success: false,
        reference: params.reference,
        amount: params.amount,
        currency: 'NGN',
        gateway: 'flutterwave',
        message: err.message || 'Flutterwave network communication failure.',
      };
    }
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    if (!this.secretKey) {
      return {
        success: false,
        verified: false,
        reference,
        amount: 0,
        currency: 'NGN',
        gateway: 'flutterwave',
        customer_email: '',
        message: 'Flutterwave Secret Key is not configured.',
      };
    }

    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      const latency = Date.now() - start;
      const data: any = await res.json().catch(() => ({}));

      if (typeof db.logProviderCall === 'function') {
        db.logProviderCall('flutterwave', `/transactions/verify_by_reference?tx_ref=${reference}`, 'GET', res.status, null, data, latency, reference);
      }

      if (res.ok && data.status === 'success' && data.data) {
        const item = data.data;
        const verified = item.status === 'successful';
        const nairaAmount = parseFloat(item.amount || '0');

        return {
          success: true,
          verified,
          reference,
          amount: nairaAmount,
          currency: item.currency || 'NGN',
          gateway: 'flutterwave',
          customer_email: item.customer?.email || '',
          paid_at: item.created_at,
          channel: item.payment_type,
          message: data.message || 'Flutterwave verification processed',
          raw_response: item,
        };
      }

      return {
        success: false,
        verified: false,
        reference,
        amount: 0,
        currency: 'NGN',
        gateway: 'flutterwave',
        customer_email: '',
        message: data.message || 'Transaction reference could not be verified on Flutterwave gateway',
      };
    } catch (err: any) {
      return {
        success: false,
        verified: false,
        reference,
        amount: 0,
        currency: 'NGN',
        gateway: 'flutterwave',
        customer_email: '',
        message: err.message || 'Flutterwave verification communication error',
      };
    }
  }

  validateWebhookSignature(rawBody: string | Buffer, signatureHeader: string): boolean {
    if (!signatureHeader) return false;
    // Flutterwave sends secret hash configured in dashboard webhook settings in the `verif-hash` header
    return signatureHeader === this.secretHash || (!!this.secretKey && signatureHeader === this.secretKey);
  }
}

/**
 * Gateway Manager Singleton
 */
export class PaymentManager {
  private gateways: Map<string, PaymentGatewayInterface> = new Map();
  private activeGatewayId = 'paystack';

  constructor() {
    const paystack = new PaystackAdapter();
    const flutterwave = new FlutterwaveAdapter();
    this.gateways.set(paystack.getId(), paystack);
    this.gateways.set(flutterwave.getId(), flutterwave);
  }

  getGateway(id: string): PaymentGatewayInterface {
    return this.gateways.get(id) || this.gateways.get('paystack')!;
  }

  getActiveGateway(): PaymentGatewayInterface {
    return this.getGateway(this.activeGatewayId);
  }

  setActiveGateway(id: string): void {
    if (this.gateways.has(id)) {
      this.activeGatewayId = id;
    }
  }

  getAllGateways(): Array<{
    id: string;
    name: string;
    status: 'active' | 'coming_soon' | 'disabled';
    is_active: boolean;
  }> {
    return Array.from(this.gateways.values()).map(g => ({
      id: g.getId(),
      name: g.getName(),
      status: g.getStatus(),
      is_active: g.getId() === this.activeGatewayId,
    }));
  }
}

export const paymentManager = new PaymentManager();
