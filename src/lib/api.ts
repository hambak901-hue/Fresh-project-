/**
 * @file api.ts
 * Frontend HTTP client for HambakTech server APIs.
 */

import { User, Transaction, VerificationRecord, TelecomOrder, SystemStatusResponse, KycSubmission, ServiceSecurityRule, VirtualAccountItem, ActivityFootprint, FootprintStats, AdminCreateCustomerPayload } from '../types';

const TOKEN_KEY = 'hambaktech_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  statusCode?: number;
  isTimeout: boolean;
  isNetworkError: boolean;
  isEmptyResponse: boolean;
  payload?: any;

  constructor(
    message: string,
    opts?: {
      statusCode?: number;
      isTimeout?: boolean;
      isNetworkError?: boolean;
      isEmptyResponse?: boolean;
      payload?: any;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = opts?.statusCode;
    this.isTimeout = Boolean(opts?.isTimeout);
    this.isNetworkError = Boolean(opts?.isNetworkError);
    this.isEmptyResponse = Boolean(opts?.isEmptyResponse);
    this.payload = opts?.payload;
  }
}

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

async function request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token && token !== 'undefined' && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const { timeoutMs = 30000, signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timerId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  let rawText = '';

  try {
    response = await fetch(endpoint, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    rawText = await response.text();
  } catch (err: any) {
    if (timedOut || err?.name === 'AbortError') {
      throw new ApiError(
        'Request timed out while waiting for a response from the server. We will check your saved verification status before retrying.',
        { isTimeout: true }
      );
    }
    throw new ApiError(
      err?.message || 'Network connection interrupted while contacting the server.',
      { isNetworkError: true }
    );
  } finally {
    window.clearTimeout(timerId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  if (!rawText.trim()) {
    throw new ApiError(
      response.ok
        ? 'Empty response received from server. Checking saved verification status...'
        : `Request failed with status ${response.status}`,
      { statusCode: response.status, isEmptyResponse: true }
    );
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new ApiError(
      response.ok
        ? 'Received a malformed response from the server. Checking saved verification status...'
        : `Request failed with status ${response.status}`,
      { statusCode: response.status }
    );
  }

  if (!response.ok) {
    if (
      response.status === 403 &&
      (data?.code === 'PIN_SETUP_REQUIRED' || data?.requires_pin_setup || data?.data?.requires_pin_setup) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent('hambak:pin-setup-required', { detail: data }));
    }
    throw new ApiError(
      data?.error || data?.message || `Request failed with status ${response.status}`,
      { statusCode: response.status, payload: data }
    );
  }

  // Handle both flat responses ({ token, user }) and wrapped responses ({ success: true, data: { token, user } })
  if (data && typeof data === 'object') {
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      return {
        ...data.data,
        ...data,
        data: data.data,
      } as T;
    }
  }

  return data as T;
}

export const api = {
  // Auth
  async login(
    email: string,
    password: string
  ): Promise<{
    success: boolean;
    token?: string;
    user?: User;
    mfa_required?: boolean;
    challenge?: import('../types').MfaChallengeResponse;
    pin_policy?: import('../types').PinPolicy;
  }> {
    const res = await request<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.mfa_required || res.data?.mfa_required) {
      return {
        success: true,
        mfa_required: true,
        challenge: res.challenge || res.data?.challenge,
      };
    }
    const token = res.token || res.data?.token || '';
    const user = res.user || res.data?.user;
    if (token && token !== 'undefined') {
      setStoredToken(token);
    }
    return { success: true, token, user, pin_policy: res.pin_policy || res.data?.pin_policy };
  },

  async verifyMfaChallenge(challengeToken: string, code: string): Promise<{
    success: boolean;
    token: string;
    user: User;
    pin_policy?: import('../types').PinPolicy;
  }> {
    const res = await request<any>('/api/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge_token: challengeToken, code }),
    });
    const token = res.token || res.data?.token || '';
    const user = res.user || res.data?.user;
    if (token && token !== 'undefined') {
      setStoredToken(token);
    }
    return { success: true, token, user, pin_policy: res.pin_policy || res.data?.pin_policy };
  },

  async register(data: {
    email: string;
    password: string;
    full_name: string;
    phone_number: string;
    date_of_birth?: string;
    residential_address?: string;
    state?: string;
    lga?: string;
    id_type?: string;
    id_number?: string;
    nin?: string;
    bvn?: string;
    consent_obtained?: boolean;
    agree_terms?: boolean;
    referral_code?: string;
    campaign_code?: string;
    [key: string]: any;
  }): Promise<{ success: boolean; token: string; user: User; pin_policy?: import('../types').PinPolicy }> {
    const res = await request<any>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const token = res.token || res.data?.token || '';
    const user = res.user || res.data?.user;
    if (token && token !== 'undefined') {
      setStoredToken(token);
    }
    return { success: true, token, user, pin_policy: res.pin_policy || res.data?.pin_policy };
  },

  async getMe(): Promise<{ success: boolean; user: User; pin_policy?: import('../types').PinPolicy }> {
    const res = await request<any>('/api/auth/me');
    const user = res.user || res.data?.user;
    return { success: true, user, pin_policy: res.pin_policy || res.data?.pin_policy };
  },

  async logout(): Promise<void> {
    const token = getStoredToken();
    try {
      if (token && token !== 'undefined' && token !== 'null') {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
      }
    } catch {
      // Clear local session cleanly even if network call fails
    } finally {
      clearStoredToken();
    }
  },

  async logoutAll(): Promise<{ success: boolean; message?: string }> {
    const res = await request<{ success: boolean; message?: string }>('/api/auth/logout-all', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    clearStoredToken();
    return res;
  },

  async getPinPolicy(): Promise<{
    success: boolean;
    pin_policy: import('../types').PinPolicy;
    has_transaction_pin?: boolean;
    pin_is_locked?: boolean;
    pin_locked_until?: string | null;
  }> {
    return request('/api/auth/pin-policy');
  },

  async setTransactionPin(pin: string, currentPin?: string): Promise<{
    success: boolean;
    message?: string;
    has_transaction_pin?: boolean;
  }> {
    return request('/api/auth/set-pin', {
      method: 'POST',
      body: JSON.stringify({ pin, current_pin: currentPin }),
    });
  },

  async requestPinResetOtp(): Promise<{
    success: boolean;
    message: string;
    expires_in_minutes?: number;
  }> {
    return request('/api/auth/pin/request-otp', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async confirmPinResetOtp(otpCode: string, newPin: string): Promise<{
    success: boolean;
    message: string;
    has_transaction_pin?: boolean;
  }> {
    return request('/api/auth/pin/reset-otp', {
      method: 'POST',
      body: JSON.stringify({ otp_code: otpCode, new_pin: newPin }),
    });
  },

  async listSessions(): Promise<{ success: boolean; sessions: import('../types').UserSessionItem[] }> {
    return request('/api/auth/sessions');
  },

  async revokeOwnSession(id: string): Promise<{ success: boolean; message?: string }> {
    return request(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getMfaStatus(): Promise<{
    success: boolean;
    mfa: import('../types').MfaStatus;
    policy: import('../types').MfaPolicy;
  }> {
    return request('/api/auth/mfa/status');
  },

  async beginTotpSetup(): Promise<{
    success: boolean;
    secret: string;
    otpauth_url: string;
    qr_url?: string;
    issuer?: string;
    message?: string;
  }> {
    return request('/api/auth/mfa/totp/setup', { method: 'POST', body: JSON.stringify({}) });
  },

  async confirmTotpSetup(code: string): Promise<{
    success: boolean;
    recovery_codes?: string[];
    message?: string;
  }> {
    return request('/api/auth/mfa/totp/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async setEmailMfa(enabled: boolean): Promise<{
    success: boolean;
    recovery_codes?: string[];
    message?: string;
  }> {
    return request('/api/auth/mfa/email', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },

  async disableMfa(password: string): Promise<{ success: boolean; message?: string }> {
    return request('/api/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async forgotPassword(email: string): Promise<{
    success: boolean;
    message: string;
    email?: string;
    token?: string;
    expires_in_minutes?: number;
    delivery?: any;
  }> {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async verifyOtp(email: string, otp_code: string): Promise<{
    success: boolean;
    message: string;
    valid?: boolean;
    email?: string;
    token?: string;
  }> {
    return request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp_code }),
    });
  },

  async resetPassword(data: {
    email: string;
    otp_code?: string;
    token?: string;
    new_password: string;
  }): Promise<{
    success: boolean;
    message: string;
    token?: string;
    user?: User;
  }> {
    const res = await request<any>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const token = res.token || res.data?.token || '';
    if (token && token !== 'undefined') {
      setStoredToken(token);
    }
    return res;
  },

  // System & Credentials Status
  async getSystemStatus(): Promise<SystemStatusResponse> {
    return request<SystemStatusResponse>('/api/system/status');
  },

  async testSmtp(toEmail?: string): Promise<{ connectionCheck: any; dispatchCheck: any }> {
    return request<{ connectionCheck: any; dispatchCheck: any }>('/api/system/test-smtp', {
      method: 'POST',
      body: JSON.stringify({ toEmail }),
    });
  },

  async getAuditLogs(): Promise<{ logs: any[] }> {
    return request<{ logs: any[] }>('/api/system/audit-logs');
  },

  // Wallet & Payment Gateways (Phase 7 Complete)
  async getWalletSummary(): Promise<{
    success: boolean;
    wallet_id: string;
    balance: number;
    currency: string;
    status: string;
    totalSpent: number;
    totalFunded: number;
    pendingFunding: number;
    transactionCount: number;
    recentTransactions: Transaction[];
    activeGateway: string;
    availableGateways: Array<{ id: string; name: string; status: string; is_active: boolean }>;
    bankDetails: { accountName: string; bank: string; accountNumber: string };
  }> {
    return request('/api/wallet/summary');
  },

  async getWalletStatement(params?: { startDate?: string; endDate?: string; category?: string; type?: string }): Promise<any> {
    const qs = new URLSearchParams(params as any).toString();
    return request(`/api/wallet/statement${qs ? `?${qs}` : ''}`);
  },

  async getWalletTransactions(params?: { page?: number; limit?: number; search?: string }): Promise<{
    success: boolean;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    transactions: Transaction[];
  }> {
    const qs = new URLSearchParams(params as any).toString();
    return request(`/api/wallet/transactions${qs ? `?${qs}` : ''}`);
  },

  async initializePaystack(amount: number, callbackUrl?: string): Promise<{
    success: boolean;
    message: string;
    authorization_url: string;
    access_code: string;
    reference: string;
    amount: number;
    is_simulated?: boolean;
  }> {
    return request('/api/wallet/paystack/initialize', {
      method: 'POST',
      body: JSON.stringify({ gateway: 'paystack', amount, callback_url: callbackUrl }),
    });
  },

  async verifyPaystackPayment(reference: string): Promise<{
    success: boolean;
    message: string;
    balance: number;
    transaction: Transaction;
    already_credited?: boolean;
  }> {
    return request('/api/wallet/paystack/verify', {
      method: 'POST',
      body: JSON.stringify({ reference, gateway: 'paystack' }),
    });
  },

  async initializeFlutterwave(amount: number, callbackUrl?: string): Promise<{
    success: boolean;
    message: string;
    authorization_url: string;
    reference: string;
    amount: number;
  }> {
    return request('/api/wallet/flutterwave/initialize', {
      method: 'POST',
      body: JSON.stringify({ gateway: 'flutterwave', amount, callback_url: callbackUrl }),
    });
  },

  async verifyFlutterwavePayment(reference: string): Promise<{
    success: boolean;
    message: string;
    balance: number;
    transaction: Transaction;
    already_credited?: boolean;
  }> {
    return request('/api/wallet/flutterwave/verify', {
      method: 'POST',
      body: JSON.stringify({ reference, gateway: 'flutterwave' }),
    });
  },

  async initializePayment(gateway: string, amount: number, callbackUrl?: string): Promise<{
    success: boolean;
    message: string;
    authorization_url: string;
    reference: string;
    amount: number;
    gateway: string;
  }> {
    return request('/api/wallet/fund/initiate', {
      method: 'POST',
      body: JSON.stringify({ gateway, amount, callback_url: callbackUrl }),
    });
  },

  async verifyFunding(reference: string, gateway?: string): Promise<{
    success: boolean;
    message: string;
    balance: number;
    transaction: Transaction;
    already_credited?: boolean;
  }> {
    return request('/api/wallet/fund/verify', {
      method: 'POST',
      body: JSON.stringify({ reference, gateway }),
    });
  },

  async reverseTransaction(transactionId: number, reason: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return request('/api/admin/transactions/reverse', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: transactionId, reason }),
    });
  },

  async updateBankSettings(bank: string, accountNumber: string, accountName: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return request('/api/admin/bank-settings', {
      method: 'POST',
      body: JSON.stringify({ bank, account_number: accountNumber, account_name: accountName }),
    });
  },

  async submitManualFunding(data: FormData | {
    amount: number;
    sender_name: string;
    bank_name: string;
    reference: string;
    payment_date?: string;
    payment_method?: string;
    remarks?: string;
    payment_proof_url?: string;
  }): Promise<{ success: boolean; message: string; transaction?: Transaction; id?: number }> {
    return request('/api/wallet/manual-funding', {
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
  },

  async getPaymentGateways(): Promise<{
    activeGateway: string;
    gateways: Array<{ id: string; name: string; status: 'active' | 'coming_soon' | 'disabled'; is_active: boolean }>;
  }> {
    return request('/api/wallet/gateways');
  },

  async switchPaymentGateway(gatewayId: string): Promise<{ success: boolean; message: string; activeGateway: string }> {
    return request('/api/wallet/admin/gateways/switch', {
      method: 'POST',
      body: JSON.stringify({ gatewayId }),
    });
  },

  async getAdminPendingFundings(): Promise<{ success: boolean; count: number; pending: any[] }> {
    return request('/api/wallet/admin/pending-fundings');
  },

  async approveAdminFunding(id: string): Promise<{ success: boolean; message: string; transaction: Transaction; userBalance: number }> {
    return request(`/api/wallet/admin/approve-funding/${id}`, {
      method: 'POST',
    });
  },

  async rejectAdminFunding(id: string, reason?: string): Promise<{ success: boolean; message: string; transaction: Transaction }> {
    return request(`/api/wallet/admin/reject-funding/${id}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async adminAdjustWalletBalance(data: {
    customerId: string;
    type: 'credit' | 'debit';
    amount: number;
    reason: string;
  }): Promise<{ success: boolean; message: string; newBalance: number; transaction: Transaction }> {
    return request('/api/wallet/admin/adjust-balance', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAdminFinancialReports(): Promise<{
    success: boolean;
    timestamp: string;
    reports: {
      funding: { totalFunding: number; paystackFunding: number; manualFunding: number; fundingTransactionsCount: number };
      sales: { totalServiceSales: number; telecomSales: number; identityVerificationSales: number };
      expenditure: { totalProviderExpenditure: number; telecomProviderCost: number; identityProviderCost: number };
      profit: { grossProfit: number; profitMarginPercent: number };
      float: { totalCustomerFloat: number; totalCustomers: number };
    };
  }> {
    return request('/api/wallet/admin/financial-reports');
  },

  // Verification (Identity API)
  async getVerificationServices(): Promise<{
    success: boolean;
    activeProvider: string;
    services: import('../types').IdentityService[];
    categories: Record<string, import('../types').IdentityService[]>;
    slipTypes: Array<{ id: string; template_id?: string; name: string; description: string; price?: number | null; is_recommended?: boolean; badge?: string | null }>;
    bvnSlipTypes?: Array<{ id: string; template_id?: string; name: string; description: string; price?: number | null; is_recommended?: boolean; badge?: string | null }>;
    slipTemplates?: import('../types').SlipTemplateItem[];
  }> {
    return request('/api/verification/services');
  },

  async executeIdentityService(
    serviceKey: string,
    payload: any,
    consent: boolean = true,
    idempotencyKey?: string,
    pin?: string
  ): Promise<{
    success: boolean;
    pending?: boolean;
    duplicate?: boolean;
    message: string;
    reference: string;
    newBalance: number;
    cost?: number;
    slip_type?: string;
    slip_name?: string | null;
    verified_at?: string;
    recordId: string;
    result: any;
    service: { key: string; name: string; category: string };
  }> {
    return request('/api/verification/verify', {
      method: 'POST',
      timeoutMs: 55000,
      body: JSON.stringify({
        serviceKey,
        payload,
        consent,
        pin: pin || payload?.pin,
        idempotency_key: idempotencyKey || payload?.idempotency_key,
      }),
    });
  },

  async recoverVerification(params: {
    idempotencyKey?: string;
    reference?: string;
  }): Promise<{
    success: boolean;
    found: boolean;
    status: 'completed' | 'pending' | 'failed' | 'not_found';
    record_status?: 'completed' | 'pending' | 'failed' | 'not_found';
    recordId?: string;
    reference?: string;
    slip_type?: string;
    slip_name?: string | null;
    has_original_pdf?: boolean;
    balance_after?: number;
    newBalance?: number;
    record: import('../types').VerificationRecord | null;
    result: any;
    message?: string;
  }> {
    const qs = new URLSearchParams();
    if (params.idempotencyKey) qs.set('idempotency_key', params.idempotencyKey);
    if (params.reference) qs.set('reference', params.reference);
    const res = await request<any>(`/api/verification/recover?${qs.toString()}`, { timeoutMs: 20000 });
    const resolvedStatus =
      res?.record_status ||
      res?.record?.status ||
      res?.data?.record_status ||
      res?.data?.status ||
      (res?.found ? 'pending' : 'not_found');
    return {
      ...res,
      status: resolvedStatus,
    };
  },

  async verifyIdentity(type: string, identifier: string): Promise<{ success: boolean; newBalance: number; result: any }> {
    const isBvn = String(type || '').toUpperCase() === 'BVN';
    return request('/api/verification/verify', {
      method: 'POST',
      timeoutMs: 55000,
      body: JSON.stringify({
        serviceKey: isBvn ? 'bvn_v1' : 'nin_v1',
        payload: isBvn
          ? { bvn: identifier, slip_type: 'bvnBasic' }
          : { nin: identifier, slip_type: 'ninStandard' },
        consent: true,
      }),
    });
  },

  async getBvnModificationBanks(): Promise<{ success: boolean; data: Array<{ bank_name: string; price: number }> }> {
    return request('/api/verification/banks/modification');
  },

  async getBvnEnrollmentBanks(): Promise<{ success: boolean; data: Array<{ bank_name: string; price: number }> }> {
    return request('/api/verification/banks/enrollment');
  },

  async pollVerificationStatus(reference: string): Promise<any> {
    return request(`/api/verification/status/${encodeURIComponent(reference)}`);
  },

  async getVerificationHistory(category?: string, search?: string): Promise<{ success: boolean; count: number; verifications: import('../types').VerificationRecord[] }> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    const qs = params.toString();
    return request(`/api/verification/history${qs ? `?${qs}` : ''}`);
  },

  async getVerificationRecord(id: string): Promise<{ success: boolean; has_original_pdf?: boolean; record: import('../types').VerificationRecord }> {
    return request(`/api/verification/record/${encodeURIComponent(id)}`);
  },

  // Telecom (Phase 6 Complete Ulamadata Integration)
  async getTelecomProviders(): Promise<{
    success: boolean;
    activeProvider: string;
    providers: import('../types').TelecomProviderStatus[];
    wallet_balance: number;
    message: string;
  }> {
    return request('/api/telecom/providers');
  },

  async switchTelecomProvider(providerId: string): Promise<{ success: boolean; message: string; activeProvider: string }> {
    return request('/api/telecom/providers/switch', {
      method: 'POST',
      body: JSON.stringify({ providerId }),
    });
  },

  async getTelecomPlans(network?: string): Promise<{
    activeProvider: string;
    plans: import('../types').TelecomPlanItem[];
    categories_by_network?: Record<string, string[]>;
    airtime_discount_percent?: number;
  }> {
    const qs = network ? `?network=${encodeURIComponent(network)}` : '';
    return request(`/api/telecom/plans${qs}`);
  },

  async validateTelecomPhone(network: string, phone: string): Promise<{
    success: boolean;
    valid: boolean;
    matches_network: boolean;
    formatted_phone: string;
    detected_network: string | null;
    selected_network: string;
    message: string;
  }> {
    return request('/api/telecom/validate-phone', {
      method: 'POST',
      body: JSON.stringify({ network, phone }),
    });
  },

  async purchaseData(
    planId: string,
    phone: string,
    network?: string,
    idempotencyKey?: string,
    transactionPin?: string
  ): Promise<{
    success: boolean;
    message: string;
    order: TelecomOrder;
    status?: string;
    reference?: string;
    newBalance: number;
    balance_after?: number;
    deduplicated?: boolean;
  }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return request('/api/telecom/purchase-data', {
      method: 'POST',
      headers,
      timeoutMs: 45000,
      body: JSON.stringify({
        planId,
        phone,
        network,
        transaction_pin: transactionPin,
        idempotency_key: idempotencyKey,
      }),
    });
  },

  async getAdminTelecomPlans(params?: { network?: string; category?: string }): Promise<{
    success: boolean;
    plans: import('../types').TelecomPlanItem[];
    categories_by_network: Record<string, string[]>;
    data_default_markup_percent: number;
    airtime_discount_percent: number;
    active_provider: string;
  }> {
    const qs = new URLSearchParams();
    if (params?.network && params.network !== 'ALL') qs.set('network', params.network);
    if (params?.category && params.category !== 'ALL') qs.set('category', params.category);
    const query = qs.toString();
    return request(`/api/admin/telecom/plans${query ? `?${query}` : ''}`);
  },

  async syncAdminTelecomPlans(recalculateUnlocked = false): Promise<{
    success: boolean;
    message: string;
    synced_count: number;
    preserved_overrides: number;
    total_fetched: number;
    categories_by_network?: Record<string, string[]>;
  }> {
    return request('/api/admin/telecom/plans/sync', {
      method: 'POST',
      timeoutMs: 45000,
      body: JSON.stringify({ recalculate_unlocked: recalculateUnlocked }),
    });
  },

  async updateAdminTelecomPlan(
    id: string,
    data: {
      pricing_mode?: string;
      fixed_price?: number | null;
      price?: number;
      markup_percent?: number | null;
      discount_percent?: number | null;
      is_active?: boolean;
    }
  ): Promise<{
    success: boolean;
    message: string;
    plan: import('../types').TelecomPlanItem;
  }> {
    return request(`/api/admin/telecom/plans/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async bulkUpdateAdminTelecomPricing(data: {
    network?: string;
    category?: string;
    pricing_mode: 'markup_percent' | 'discount_percent' | 'default_markup';
    value?: number;
    skip_fixed_overrides?: boolean;
    data_default_markup_percent?: number;
  }): Promise<{
    success: boolean;
    message: string;
    updated_count: number;
    skipped_fixed: number;
    data_default_markup_percent: number;
  }> {
    return request('/api/admin/telecom/plans/bulk-pricing', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async toggleAdminTelecomCategory(data: {
    network: string;
    category: string;
    is_active: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    network: string;
    category: string;
    is_active: boolean;
  }> {
    return request('/api/admin/telecom/category-status', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getAdminTelecomOrders(params?: { service?: string; status?: string; limit?: number }): Promise<{
    success: boolean;
    count: number;
    orders: TelecomOrder[];
  }> {
    const qs = new URLSearchParams();
    if (params?.service) qs.set('service', params.service);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request(`/api/admin/telecom/orders${query ? `?${query}` : ''}`);
  },

  async purchaseAirtime(
    network: string,
    phone: string,
    amount: number,
    transactionPin?: string
  ): Promise<{ success: boolean; message: string; order: TelecomOrder; discountSaved: number; newBalance: number }> {
    return request('/api/telecom/purchase-airtime', {
      method: 'POST',
      body: JSON.stringify({ network, phone, amount, transaction_pin: transactionPin }),
    });
  },

  async getAirtimePinDenominations(): Promise<{
    denominations: import('../types').AirtimePinDenomination[];
    has_in_stock?: boolean;
    catalogue_status?: string;
  }> {
    return request('/api/telecom/airtime-pins/denominations');
  },

  async purchaseAirtimePin(
    data: {
      denominationId?: string;
      network: string;
      denomination: number;
      quantity: number;
      businessName?: string;
      card_name?: string;
      transaction_pin: string;
      idempotency_key?: string;
    },
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    message: string;
    status?: string;
    reference?: string;
    incomplete_vouchers?: boolean;
    deduplicated?: boolean;
    vouchers?: import('../types').TelecomVoucherItem[];
    pins: import('../types').TelecomVoucherItem[];
    order: TelecomOrder;
    newBalance: number;
    balance_after?: number;
  }> {
    const ikey = idempotencyKey || data.idempotency_key;
    const headers: Record<string, string> = {};
    if (ikey) headers['X-Idempotency-Key'] = ikey;
    return request('/api/telecom/purchase-airtime-pin', {
      method: 'POST',
      headers,
      timeoutMs: 45000,
      body: JSON.stringify({
        ...data,
        card_name: data.card_name || data.businessName,
        idempotency_key: ikey,
      }),
    });
  },

  async getAirtimeSwapConfig(): Promise<{ configs: import('../types').AirtimeSwapConfigItem[] }> {
    return request('/api/telecom/airtime-swap/config');
  },

  async initiateAirtimeSwap(data: {
    network: string;
    phone: string;
    amount: number;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    transaction_pin?: string;
  }): Promise<{
    success: boolean;
    message: string;
    swapDetails: any;
    order: TelecomOrder;
  }> {
    return request('/api/telecom/airtime-swap', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getCablePackages(): Promise<{ packages: Record<string, import('../types').CablePackageItem[]>; rawList: import('../types').CablePackageItem[] }> {
    return request('/api/telecom/cable-packages');
  },

  async verifySmartcard(provider: string, smartcardNumber: string): Promise<{
    success: boolean;
    provider: string;
    smartcardNumber: string;
    customerName: string;
    dueDate: string;
    status: string;
    bouquet?: string;
  }> {
    return request('/api/telecom/verify-smartcard', {
      method: 'POST',
      body: JSON.stringify({ provider, smartcardNumber }),
    });
  },

  async purchaseCable(data: { provider: string; smartcardNumber: string; packageId: string; phone?: string; transaction_pin?: string }): Promise<{
    success: boolean;
    message: string;
    order: TelecomOrder;
    newBalance: number;
  }> {
    return request('/api/telecom/purchase-cable', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getDataPinDenominations(): Promise<{
    denominations: import('../types').DataPinDenomination[];
    available_for_purchase?: boolean;
    catalogue_status?: string;
  }> {
    return request('/api/telecom/data-pins/denominations');
  },

  async purchaseDataPin(
    data: {
      network: string;
      planId: string;
      quantity: number;
      businessName?: string;
      card_name?: string;
      transaction_pin: string;
      idempotency_key?: string;
    },
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    message: string;
    status?: string;
    reference?: string;
    incomplete_vouchers?: boolean;
    deduplicated?: boolean;
    vouchers?: import('../types').TelecomVoucherItem[];
    pins: import('../types').TelecomVoucherItem[];
    order: TelecomOrder;
    newBalance: number;
    balance_after?: number;
  }> {
    const ikey = idempotencyKey || data.idempotency_key;
    const headers: Record<string, string> = {};
    if (ikey) headers['X-Idempotency-Key'] = ikey;
    return request('/api/telecom/purchase-data-pin', {
      method: 'POST',
      headers,
      timeoutMs: 45000,
      body: JSON.stringify({
        ...data,
        card_name: data.card_name || data.businessName,
        idempotency_key: ikey,
      }),
    });
  },

  async sendBulkSms(data: { senderId: string; recipients: string[] | string; message: string; transaction_pin?: string }): Promise<{
    success: boolean;
    message: string;
    messageId: string;
    pages: number;
    recipientCount: number;
    order: TelecomOrder;
    newBalance: number;
  }> {
    return request('/api/telecom/send-bulksms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getElectricityDiscos(): Promise<{ discos: import('../types').ElectricityDiscoItem[] }> {
    return request('/api/telecom/electricity-discos');
  },

  async verifyMeter(discoId: string, meterNumber: string, meterType?: string): Promise<{
    success: boolean;
    discoId: string;
    discoName: string;
    meterNumber: string;
    meterType: string;
    customerName: string;
    address: string;
    tariffClass: string;
  }> {
    return request('/api/telecom/verify-meter', {
      method: 'POST',
      body: JSON.stringify({ discoId, meterNumber, meterType }),
    });
  },

  async purchaseElectricity(data: { discoId: string; meterNumber: string; meterType?: string; amount: number; phone?: string; transaction_pin?: string }): Promise<{
    success: boolean;
    message: string;
    token: string;
    units: string;
    order: TelecomOrder;
    newBalance: number;
  }> {
    return request('/api/telecom/purchase-electricity', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getExamPackages(): Promise<{ packages: import('../types').ExamPackageItem[] }> {
    return request('/api/telecom/exam-packages');
  },

  async purchaseExamPin(data: { examId: string; quantity: number; phone?: string; transaction_pin?: string }): Promise<{
    success: boolean;
    message: string;
    pins: Array<{ serial: string; pin: string; exam: string }>;
    order: TelecomOrder;
    newBalance: number;
  }> {
    return request('/api/telecom/purchase-exam-pin', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async verifyTelecomTransaction(reference: string): Promise<{
    success: boolean;
    result: any;
    order?: TelecomOrder;
    vouchers?: import('../types').TelecomVoucherItem[];
  }> {
    return request(`/api/telecom/verify/${encodeURIComponent(reference)}`);
  },

  async getTelecomOrderVouchers(orderId: string): Promise<{
    success: boolean;
    order: TelecomOrder;
    vouchers: import('../types').TelecomVoucherItem[];
    voucher_count: number;
  }> {
    return request(`/api/telecom/vouchers/${encodeURIComponent(orderId)}`);
  },

  async getAdminAirtimePins(network?: string): Promise<{
    success: boolean;
    denominations: import('../types').AirtimePinDenomination[];
    pin_default_markup_percent: number;
    active_provider: string;
  }> {
    const qs = network && network !== 'ALL' ? `?network=${encodeURIComponent(network)}` : '';
    return request(`/api/admin/telecom/airtime-pins${qs}`);
  },

  async syncAdminAirtimePins(recalculateUnlocked = false): Promise<{
    success: boolean;
    message: string;
    synced_count: number;
    inserted_count: number;
    updated_count: number;
    preserved_overrides: number;
  }> {
    return request('/api/admin/telecom/airtime-pins/sync', {
      method: 'POST',
      timeoutMs: 45000,
      body: JSON.stringify({ recalculate_unlocked: recalculateUnlocked }),
    });
  },

  async updateAdminAirtimePin(
    id: string,
    data: {
      pricing_mode?: string;
      fixed_price?: number | null;
      price?: number;
      markup_percent?: number | null;
      discount_percent?: number | null;
      max_quantity?: number;
      is_active?: boolean;
    }
  ): Promise<{
    success: boolean;
    message: string;
    denomination: import('../types').AirtimePinDenomination;
  }> {
    return request(`/api/admin/telecom/airtime-pins/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async bulkUpdateAdminAirtimePinPricing(data: {
    network?: string;
    pricing_mode: 'markup_percent' | 'discount_percent' | 'default_markup';
    value?: number;
    skip_fixed_overrides?: boolean;
    pin_default_markup_percent?: number;
  }): Promise<{
    success: boolean;
    message: string;
    updated_count: number;
    skipped_fixed: number;
    pin_default_markup_percent: number;
  }> {
    return request('/api/admin/telecom/airtime-pins/bulk-pricing', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAdminDataPins(network?: string): Promise<{
    success: boolean;
    denominations: import('../types').DataPinDenomination[];
    pin_default_markup_percent: number;
    catalogue_status?: string;
  }> {
    const qs = network && network !== 'ALL' ? `?network=${encodeURIComponent(network)}` : '';
    return request(`/api/admin/telecom/data-pins${qs}`);
  },

  async updateAdminDataPin(
    id: string,
    data: {
      pricing_mode?: string;
      fixed_price?: number | null;
      price?: number;
      markup_percent?: number | null;
      discount_percent?: number | null;
      max_quantity?: number;
      is_active?: boolean;
    }
  ): Promise<{
    success: boolean;
    message: string;
    denomination: import('../types').DataPinDenomination;
  }> {
    return request(`/api/admin/telecom/data-pins/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async bulkUpdateAdminDataPinPricing(data: {
    network?: string;
    pricing_mode: 'markup_percent' | 'discount_percent' | 'default_markup';
    value?: number;
    skip_fixed_overrides?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    updated_count: number;
    skipped_fixed: number;
  }> {
    return request('/api/admin/telecom/data-pins/bulk-pricing', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getTelecomHistory(service?: string, search?: string): Promise<{ success: boolean; count: number; orders: TelecomOrder[] }> {
    const params = new URLSearchParams();
    if (service) params.set('service', service);
    if (search) params.set('search', search);
    const qs = params.toString();
    return request(`/api/telecom/history${qs ? `?${qs}` : ''}`);
  },

  // cPanel Deployment & Server Management
  async getCpanelInfo(): Promise<any> {
    return request('/api/cpanel/info');
  },

  async testSftp(): Promise<{ success: boolean; message: string; connectionDetails: any }> {
    return request('/api/cpanel/test-sftp', { method: 'POST' });
  },

  async exportDeploymentPackage(): Promise<any> {
    return request('/api/cpanel/export-package');
  },

  // CMS & Branding (Phase 2)
  async getPublicCms(): Promise<import('../types').PublicCmsResponse> {
    return request<import('../types').PublicCmsResponse>('/api/cms/public');
  },

  async getAdminCms(): Promise<import('../types').AdminCmsResponse> {
    return request<import('../types').AdminCmsResponse>('/api/cms/admin');
  },

  async updateBranding(updates: Partial<import('../types').BrandSettings>): Promise<{ success: boolean; branding: import('../types').BrandSettings }> {
    return request('/api/cms/branding', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  },

  async updateCmsSections(updates: Partial<import('../types').CmsSections>): Promise<{ success: boolean; cms_sections: import('../types').CmsSections }> {
    return request('/api/cms/sections', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  },

  async updatePageVisibility(visibility: Partial<import('../types').CmsSections['pageVisibility']>): Promise<{ success: boolean; pageVisibility: import('../types').CmsSections['pageVisibility'] }> {
    return request('/api/cms/visibility', {
      method: 'POST',
      body: JSON.stringify(visibility),
    });
  },

  async createAnnouncement(data: { title: string; content: string; category?: string; target_audience?: string; target_user_id?: string; is_pinned?: boolean; status?: string; author?: string }): Promise<{ success: boolean; announcement: import('../types').AnnouncementItem; email_delivery?: any }> {
    return request('/api/cms/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAnnouncement(id: string, updates: Partial<import('../types').AnnouncementItem>): Promise<{ success: boolean; announcement: import('../types').AnnouncementItem; email_delivery?: any }> {
    return request(`/api/cms/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteAnnouncement(id: string): Promise<{ success: boolean }> {
    return request(`/api/cms/announcements/${id}`, {
      method: 'DELETE',
    });
  },

  async createFaq(data: { question: string; answer: string; category?: string; order?: number }): Promise<{ success: boolean; faq: import('../types').FaqItem }> {
    return request('/api/cms/faqs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateFaq(id: string, updates: Partial<import('../types').FaqItem>): Promise<{ success: boolean; faq: import('../types').FaqItem }> {
    return request(`/api/cms/faqs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteFaq(id: string): Promise<{ success: boolean }> {
    return request(`/api/cms/faqs/${id}`, {
      method: 'DELETE',
    });
  },

  async updateNavigation(navigation: import('../types').NavMenuItem[]): Promise<{ success: boolean; navigation: import('../types').NavMenuItem[] }> {
    return request('/api/cms/navigation', {
      method: 'POST',
      body: JSON.stringify({ navigation }),
    });
  },

  async submitContact(data: { name: string; email: string; phone?: string; subject?: string; message: string }): Promise<{ success: boolean; message: string }> {
    return request('/api/cms/contact', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Customer Dashboard (Phase 3)
  async getCustomerSummary(): Promise<{
    success: boolean;
    user: User;
    metrics: {
      wallet_balance: number;
      total_transactions: number;
      successful_transactions: number;
      pending_transactions: number;
      failed_transactions: number;
      total_funded: number;
      total_spent: number;
      total_orders: number;
      total_verifications: number;
      unread_notifications_count: number;
    };
    recent_activities: Array<{
      id: string;
      category: string;
      type: string;
      title: string;
      amount: number;
      status: string;
      timestamp: string;
    }>;
    recent_orders: TelecomOrder[];
    recent_verifications: VerificationRecord[];
    notifications: import('../types').NotificationItem[];
    announcements: import('../types').AnnouncementItem[];
    bank_details: { accountName: string; bank: string; accountNumber: string };
  }> {
    return request('/api/customer/summary');
  },

  async updateCustomerProfile(updates: Partial<User>): Promise<{ success: boolean; message: string; user: User }> {
    return request('/api/customer/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async updateCustomerPassword(passwords: { current_password: string; new_password: string }): Promise<{ success: boolean; message: string }> {
    return request('/api/customer/password', {
      method: 'PUT',
      body: JSON.stringify(passwords),
    });
  },

  async updateCustomerPin(pinData: { pin: string; current_pin?: string }): Promise<{ success: boolean; message: string; has_transaction_pin: boolean }> {
    return request('/api/customer/pin', {
      method: 'PUT',
      body: JSON.stringify(pinData),
    });
  },

  async verifyCustomerPin(pin: string): Promise<{ success: boolean; verified: boolean }> {
    return request('/api/customer/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  async updateCustomerPreferences(prefs: { notification_preferences?: any; security_settings?: any }): Promise<{ success: boolean; message: string; user: User }> {
    return request('/api/customer/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  },

  async submitCustomerKyc(data: { id_type: string; id_number: string; doc_url?: string; notes?: string }): Promise<{ success: boolean; message: string; user: User }> {
    return request('/api/customer/kyc-submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },


  async getCustomerNotifications(): Promise<{ success: boolean; notifications: import('../types').NotificationItem[]; unread_count: number }> {
    return request('/api/customer/notifications');
  },

  async markNotificationRead(id: string): Promise<{ success: boolean }> {
    return request(`/api/customer/notifications/${id}/read`, { method: 'PUT' });
  },

  async markAllNotificationsRead(): Promise<{ success: boolean; message: string }> {
    return request('/api/customer/notifications/read-all', { method: 'PUT' });
  },

  async getCustomerStatement(params?: { startDate?: string; endDate?: string }): Promise<any> {
    const query = new URLSearchParams(params as any).toString();
    return request(`/api/customer/statement${query ? `?${query}` : ''}`);
  },

  async submitSupportTicket(data: { subject: string; message: string; priority?: string }): Promise<{ success: boolean; ticketId: string; message: string }> {
    return request('/api/customer/support-ticket', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async uploadDocument(file: File, documentType: string = 'kyc_document'): Promise<{
    success: boolean;
    file_url: string;
    file_name: string;
    message: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    return request('/api/customer/upload', {
      method: 'POST',
      body: formData,
    });
  },


  // ---------------------------------------------------------------------------
  // Super Admin & Global Management (Phase 4)
  // ---------------------------------------------------------------------------
  async getAdminOverview(): Promise<import('../types').AdminOverviewData> {
    return request('/api/admin/overview');
  },

  async getAdminCustomers(params?: {
    search?: string;
    status?: string;
    tier?: string;
    role?: string;
    kyc_status?: string;
    filter?: string;
  }): Promise<{
    success: boolean;
    count: number;
    customers: User[];
    summary?: {
      total: number;
      active: number;
      suspended: number;
      pending_kyc: number;
      verified_kyc: number;
      new_registrations: number;
    };
  }> {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = String(v);
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    return request(`/api/admin/customers${query ? `?${query}` : ''}`);
  },

  async getAdminCustomerDetail(id: string): Promise<{
    success: boolean;
    customer: User;
    transactions: Transaction[];
    orders: TelecomOrder[];
    verifications: VerificationRecord[];
    auditLogs: any[];
    kyc?: any;
    kyc_submissions?: any[];
    support_tickets?: any[];
    stats?: {
      total_funded: number;
      total_spent: number;
      tx_count: number;
      orders_count: number;
      verifications_count: number;
      tickets_count: number;
    };
  }> {
    return request(`/api/admin/customers/${id}`);
  },

  async updateAdminCustomer(
    id: string,
    updates: Partial<User> & {
      new_password?: string;
      residential_address?: string;
      date_of_birth?: string;
    }
  ): Promise<{ success: boolean; message: string; customer: User }> {
    return request(`/api/admin/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteAdminCustomer(id: string, force: boolean = false): Promise<{ success: boolean; message: string; deleted_id: string }> {
    return request(`/api/admin/customers/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    });
  },

  async setCustomerStatus(id: string, status: 'active' | 'suspended', reason?: string): Promise<{ success: boolean; message: string; customer: User }> {
    return request(`/api/admin/customers/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
  },

  async adjustCustomerWallet(id: string, data: { type: 'credit' | 'debit'; amount: number; reason: string }): Promise<{
    success: boolean;
    message: string;
    newBalance: number;
    transaction: Transaction;
  }> {
    return request(`/api/admin/customers/${id}/wallet-adjust`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async reviewCustomerKyc(id: string, data: { status: 'verified' | 'rejected' | 'pending'; tier?: number; review_notes?: string }): Promise<{
    success: boolean;
    message: string;
    customer: User;
  }> {
    return request(`/api/admin/customers/${id}/kyc`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async sendCustomerNotification(id: string, data: { title: string; message: string; type?: string }): Promise<{
    success: boolean;
    message: string;
    notification: any;
  }> {
    return request(`/api/admin/customers/${id}/notify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getDashboardModules(): Promise<{ success: boolean; modules: import('../types').DashboardModuleConfig[] }> {
    return request('/api/admin/dashboard-modules');
  },

  async updateDashboardModule(id: string, data: Partial<import('../types').DashboardModuleConfig>): Promise<{
    success: boolean;
    message: string;
    module: import('../types').DashboardModuleConfig;
  }> {
    return request(`/api/admin/dashboard-modules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getAdminStaff(): Promise<{ success: boolean; staff: User[] }> {
    return request('/api/admin/staff');
  },

  async createStaffAccount(data: { full_name: string; email: string; phone_number?: string; password: string; role?: string; permissions?: string[] }): Promise<{
    success: boolean;
    message: string;
    staff: User;
  }> {
    return request('/api/admin/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateStaffAccount(id: string, updates: Partial<User>): Promise<{ success: boolean; message: string; staff: User }> {
    return request(`/api/admin/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async getAdminServices(): Promise<{
    success: boolean;
    settings: any;
    store_items: import('../types').StoreItem[];
    academy_courses: import('../types').AcademyCourse[];
  }> {
    return request('/api/admin/services');
  },

  async updateServicePricing(pricing: any): Promise<{ success: boolean; message: string; settings: any }> {
    return request('/api/admin/services/pricing', {
      method: 'PUT',
      body: JSON.stringify(pricing),
    });
  },

  async updateServiceProviders(providers: any): Promise<{ success: boolean; message: string; settings: any }> {
    return request('/api/admin/services/providers', {
      method: 'PUT',
      body: JSON.stringify(providers),
    });
  },

  async createStoreItem(item: any): Promise<{ success: boolean; message: string; item: import('../types').StoreItem }> {
    return request('/api/admin/services/store', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  async updateStoreItem(id: string, updates: any): Promise<{ success: boolean; message: string; item: import('../types').StoreItem }> {
    return request(`/api/admin/services/store/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteStoreItem(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/services/store/${id}`, { method: 'DELETE' });
  },

  async createAcademyCourse(course: any): Promise<{ success: boolean; message: string; course: import('../types').AcademyCourse }> {
    return request('/api/admin/academy/course', {
      method: 'POST',
      body: JSON.stringify(course),
    });
  },

  async updateAcademyCourse(id: string, updates: any): Promise<{ success: boolean; message: string; course: import('../types').AcademyCourse }> {
    return request(`/api/admin/academy/course/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteAcademyCourse(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/academy/course/${id}`, { method: 'DELETE' });
  },

  async getPendingFundingApprovals(): Promise<{ success: boolean; pending: Transaction[] }> {
    return request('/api/admin/funding/pending');
  },

  async approveFunding(id: string): Promise<{ success: boolean; message: string; transaction: Transaction; userBalance: number }> {
    return request(`/api/admin/funding/${id}/approve`, { method: 'POST' });
  },

  async rejectFunding(id: string, reason?: string): Promise<{ success: boolean; message: string; transaction: Transaction }> {
    return request(`/api/admin/funding/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getAdminAuditLogs(params?: { action?: string; search?: string }): Promise<{ success: boolean; count: number; logs: import('../types').AuditLogItem[] }> {
    const query = new URLSearchParams(params as any).toString();
    return request(`/api/admin/audit-logs${query ? `?${query}` : ''}`);
  },

  // Phase 5 Admin Provider & Identity Pricing Management
  async getAdminProviders(): Promise<{
    success: boolean;
    primaryProviderId: string;
    providers: import('../types').ProviderConfigItem[];
    routing?: {
      active_verification_provider: string;
      bvn_primary_provider: string;
      bvn_fallback_provider: string;
      bvn_auto_fallback: boolean;
      identity_auto_fallback: boolean;
    };
  }> {
    return request('/api/admin/providers');
  },

  async addAdminProvider(data: { id: string; name: string; base_url: string; api_key?: string; timeout_seconds?: number }): Promise<{ success: boolean; message: string; provider: import('../types').ProviderConfigItem }> {
    return request('/api/admin/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminProvider(id: string, updates: Partial<import('../types').ProviderConfigItem>): Promise<{ success: boolean; message: string; provider: import('../types').ProviderConfigItem }> {
    return request(`/api/admin/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async testAdminProvider(id: string): Promise<{ success: boolean; message: string; latency_ms: number; provider: string; services_count?: number }> {
    return request(`/api/admin/providers/${id}/test`, {
      method: 'POST',
    });
  },

  async getAdminProviderLogs(): Promise<{ success: boolean; count: number; logs: import('../types').ProviderLogItem[] }> {
    return request('/api/admin/providers/logs');
  },

  async getAdminVerificationPricing(): Promise<{ success: boolean; count: number; services: import('../types').IdentityService[] }> {
    return request('/api/admin/services/verification');
  },

  async updateAdminVerificationPricing(key: string, data: { selling_price?: number; enabled?: boolean; provider?: string }): Promise<{ success: boolean; message: string; service: import('../types').IdentityService }> {
    return request(`/api/admin/services/verification/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async syncWholesalePrices(): Promise<{ success: boolean; message: string; updatedCount: number }> {
    return request('/api/admin/services/verification/sync-wholesale', {
      method: 'POST',
    });
  },

  // Slip Templates Management (Stage 5)
  async getSlipTemplates(category?: string): Promise<{ success: boolean; count: number; templates: import('../types').SlipTemplateItem[] }> {
    const qs = category && category !== 'ALL' ? `?category=${encodeURIComponent(category)}` : '';
    return request(`/api/verification/slip-templates${qs}`);
  },

  async getAdminSlipTemplates(): Promise<{ success: boolean; count: number; templates: import('../types').SlipTemplateItem[] }> {
    return request('/api/admin/slip-templates');
  },

  async createAdminSlipTemplate(data: Partial<import('../types').SlipTemplateItem>): Promise<{ success: boolean; message: string; template: import('../types').SlipTemplateItem }> {
    return request('/api/admin/slip-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminSlipTemplate(id: string, updates: Partial<import('../types').SlipTemplateItem>): Promise<{ success: boolean; message: string; template: import('../types').SlipTemplateItem }> {
    return request(`/api/admin/slip-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteAdminSlipTemplate(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/slip-templates/${id}`, {
      method: 'DELETE',
    });
  },

  async uploadSlipSpecimen(fileDataUri: string): Promise<{ success: boolean; url: string; filename: string; message: string }> {
    return request('/api/admin/slip-templates/upload-specimen', {
      method: 'POST',
      body: JSON.stringify({ file_data: fileDataUri }),
    });
  },

  // -------------------------------------------------------------
  // PHASE 8: SMTP CONFIGURATION & MAIL GATEWAY
  // -------------------------------------------------------------
  async getAdminSmtpConfig(): Promise<{ success: boolean; config: import('../types').SmtpConfig; logs: import('../types').SmtpLogItem[] }> {
    return request('/api/admin/smtp');
  },

  async updateAdminSmtpConfig(config: Partial<import('../types').SmtpConfig>): Promise<{ success: boolean; message: string; config: import('../types').SmtpConfig }> {
    return request('/api/admin/smtp', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async testSmtpHandshake(): Promise<{ success: boolean; message: string; details?: any }> {
    return request('/api/admin/smtp/test-connection', {
      method: 'POST',
    });
  },

  async sendTestSmtpEmail(data: { toEmail: string; subject?: string; body?: string }): Promise<{ success: boolean; message: string; details?: any }> {
    return request('/api/admin/smtp/send-test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // -------------------------------------------------------------
  // PHASE 8: EMAIL NOTIFICATION TEMPLATES
  // -------------------------------------------------------------
  async getAdminEmailTemplates(): Promise<{ success: boolean; templates: import('../types').EmailTemplateItem[] }> {
    return request('/api/admin/email-templates');
  },

  async updateAdminEmailTemplate(id: string, data: { subject?: string; html_body?: string; is_active?: boolean }): Promise<{ success: boolean; message: string; template: import('../types').EmailTemplateItem }> {
    return request(`/api/admin/email-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async testAdminEmailTemplate(id: string, toEmail: string): Promise<{ success: boolean; message: string; details?: any }> {
    return request(`/api/admin/email-templates/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ toEmail }),
    });
  },

  // -------------------------------------------------------------
  // PHASE 8: SMS CONFIGURATION & TEMPLATES
  // -------------------------------------------------------------
  async getAdminSmsConfig(): Promise<{ success: boolean; config: import('../types').SmsConfig; logs: import('../types').SmsLogItem[] }> {
    return request('/api/admin/sms-config');
  },

  async updateAdminSmsConfig(config: Partial<import('../types').SmsConfig>): Promise<{ success: boolean; message: string; config: import('../types').SmsConfig }> {
    return request('/api/admin/sms-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async updateAdminSmsTemplate(id: string, data: { content?: string; is_active?: boolean }): Promise<{ success: boolean; message: string; template: import('../types').SmsTemplateItem }> {
    return request(`/api/admin/sms-config/template/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async testAdminSmsDispatch(data: { phone: string; message: string }): Promise<{ success: boolean; message: string; log: import('../types').SmsLogItem; balance_units: number }> {
    return request('/api/admin/sms-config/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // -------------------------------------------------------------
  // PHASE 8: DIGITAL SERVICES (CABLE TV & ELECTRICITY)
  // -------------------------------------------------------------
  async getAdminDigitalServices(): Promise<{ success: boolean; cable_packages: import('../types').CablePackageItem[]; electricity_discos: import('../types').ElectricityDiscoItem[] }> {
    return request('/api/admin/digital-services');
  },

  async updateAdminCablePackage(id: string, data: Partial<import('../types').CablePackageItem>): Promise<{ success: boolean; message: string; package: import('../types').CablePackageItem }> {
    return request(`/api/admin/digital-services/cable-package/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async createAdminCablePackage(data: Omit<import('../types').CablePackageItem, 'id'>): Promise<{ success: boolean; message: string; package: import('../types').CablePackageItem }> {
    return request('/api/admin/digital-services/cable-package', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminCablePackage(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/digital-services/cable-package/${id}`, {
      method: 'DELETE',
    });
  },

  async updateAdminElectricityDisco(id: string, data: Partial<import('../types').ElectricityDiscoItem>): Promise<{ success: boolean; message: string; disco: import('../types').ElectricityDiscoItem }> {
    return request(`/api/admin/digital-services/disco/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async createAdminElectricityDisco(data: Omit<import('../types').ElectricityDiscoItem, 'id'>): Promise<{ success: boolean; message: string; disco: import('../types').ElectricityDiscoItem }> {
    return request('/api/admin/digital-services/disco', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminElectricityDisco(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/digital-services/disco/${id}`, {
      method: 'DELETE',
    });
  },

  // -------------------------------------------------------------
  // PHASE 8: STORE ADMINISTRATION & CUSTOMER STORE
  // -------------------------------------------------------------
  async getAdminStore(): Promise<{ success: boolean; items: import('../types').StoreItem[]; settings: import('../types').StoreSettings }> {
    return request('/api/admin/store');
  },

  async updateAdminStoreSettings(settings: Partial<import('../types').StoreSettings>): Promise<{ success: boolean; message: string; settings: import('../types').StoreSettings }> {
    return request('/api/admin/store/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async createAdminStoreItem(data: Omit<import('../types').StoreItem, 'id' | 'created_at'>): Promise<{ success: boolean; message: string; item: import('../types').StoreItem }> {
    return request('/api/admin/store/item', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminStoreItem(id: string, data: Partial<import('../types').StoreItem>): Promise<{ success: boolean; message: string; item: import('../types').StoreItem }> {
    return request(`/api/admin/store/item/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminStoreItem(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/store/item/${id}`, {
      method: 'DELETE',
    });
  },

  async getCustomerStore(): Promise<{ success: boolean; items: import('../types').StoreItem[]; settings: import('../types').StoreSettings }> {
    return request('/api/customer/store');
  },

  // -------------------------------------------------------------
  // STAGE 2: DIGITAL TRAINING ACADEMY (PUBLIC, CUSTOMER, ADMIN, VERIFY)
  // -------------------------------------------------------------
  async getPublicAcademy(): Promise<{
    success: boolean;
    courses: import('../types').AcademyCourse[];
    settings: import('../types').AcademySettings;
  }> {
    return request('/api/academy/public');
  },

  async submitAcademyApplication(payload: Record<string, any>): Promise<{
    success: boolean;
    message: string;
    application: import('../types').AcademyApplication;
    application_ref: string;
  }> {
    return request('/api/academy/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async checkAcademyApplicationStatus(ref: string, email: string): Promise<{
    success: boolean;
    application: import('../types').AcademyApplication;
  }> {
    const q = new URLSearchParams({ ref, email }).toString();
    return request(`/api/academy/application-status?${q}`);
  },

  async verifyStudentById(studentId: string): Promise<import('../types').StudentVerificationResult> {
    const q = new URLSearchParams({ student_id: studentId }).toString();
    return request(`/api/academy/verify?${q}`);
  },

  async getAdminAcademy(): Promise<{
    success: boolean;
    courses: import('../types').AcademyCourse[];
    settings: import('../types').AcademySettings;
    applications?: import('../types').AcademyApplication[];
    students?: import('../types').AcademyStudent[];
  }> {
    return request('/api/admin/academy');
  },

  async updateAdminAcademySettings(settings: Partial<import('../types').AcademySettings>): Promise<{ success: boolean; message: string; settings: import('../types').AcademySettings }> {
    return request('/api/admin/academy/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async createAdminAcademyCourse(data: Partial<import('../types').AcademyCourse>): Promise<{ success: boolean; message: string; course: import('../types').AcademyCourse }> {
    return request('/api/admin/academy/course', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAdminAcademyCourse(id: string, data: Partial<import('../types').AcademyCourse>): Promise<{ success: boolean; message: string; course: import('../types').AcademyCourse }> {
    return request(`/api/admin/academy/course/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminAcademyCourse(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/academy/course/${id}`, {
      method: 'DELETE',
    });
  },

  async getAdminAcademyApplications(): Promise<{ success: boolean; applications: import('../types').AcademyApplication[] }> {
    return request('/api/admin/academy/applications');
  },

  async reviewAcademyApplication(
    id: string,
    data: { action: 'approve' | 'reject' | 'request_info'; admin_notes?: string; info_request_message?: string }
  ): Promise<{ success: boolean; message: string; status: string; student?: import('../types').AcademyStudent }> {
    return request(`/api/admin/academy/applications/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAdminAcademyStudents(): Promise<{ success: boolean; students: import('../types').AcademyStudent[] }> {
    return request('/api/admin/academy/students');
  },

  async updateAcademyStudent(
    id: string,
    data: { academic_status?: string; completion_date?: string | null; course_id?: string }
  ): Promise<{ success: boolean; message: string; student: import('../types').AcademyStudent }> {
    return request(`/api/admin/academy/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getCustomerAcademy(): Promise<{
    success: boolean;
    courses: import('../types').AcademyCourse[];
    settings: import('../types').AcademySettings;
    applications?: import('../types').AcademyApplication[];
    students?: import('../types').AcademyStudent[];
  }> {
    return request('/api/customer/academy');
  },

  async submitCustomerAcademyApplication(payload: Record<string, any>): Promise<{
    success: boolean;
    message: string;
    application: import('../types').AcademyApplication;
    application_ref: string;
  }> {
    return request('/api/customer/academy/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // -------------------------------------------------------------
  // PHASE 8: REPORTS & RECONCILIATION
  // -------------------------------------------------------------
  async getAdminReports(): Promise<import('../types').AdminReportsData> {
    return request('/api/admin/reports');
  },

  async updateAdminReportsSettings(settings: Partial<import('../types').ReportsSettings>): Promise<{ success: boolean; message: string; settings: import('../types').ReportsSettings }> {
    return request('/api/admin/reports/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async getCustomerReports(): Promise<{ success: boolean; settings: import('../types').ReportsSettings; analytics: import('../types').CustomerReportsAnalytics }> {
    return request('/api/customer/reports');
  },

  // -------------------------------------------------------------
  // PHASE 8: BROADCAST NOTIFICATIONS & MESSAGES
  // -------------------------------------------------------------
  async broadcastNotification(data: { title: string; message: string; type?: string; target_role?: string }): Promise<{ success: boolean; message: string; announcement: any }> {
    return request('/api/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getCustomerMessages(): Promise<{ success: boolean; count: number; unreadCount: number; messages: import('../types').CustomerMessage[] }> {
    return request('/api/customer/messages');
  },

  async markCustomerMessageRead(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/customer/messages/${id}/read`, {
      method: 'PUT',
    });
  },

  async verifyPin(pin: string): Promise<{ success: boolean; verified: boolean }> {
    return request('/api/customer/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  // -------------------------------------------------------------
  // PHASE 8 CONVENIENCE ALIASES
  // -------------------------------------------------------------
  async getSmtpConfig() { return this.getAdminSmtpConfig(); },
  async updateSmtpConfig(config: any) { return this.updateAdminSmtpConfig(config); },
  async getEmailTemplatesAdmin() { return this.getAdminEmailTemplates(); },
  async updateEmailTemplate(id: string, data: any) { return this.updateAdminEmailTemplate(id, data); },
  async sendTestEmailTemplate(id: string, toEmail: string) { return this.testAdminEmailTemplate(id, toEmail); },
  async getSmsConfigAdmin() { return this.getAdminSmsConfig(); },
  async updateSmsConfigAdmin(config: any) { return this.updateAdminSmsConfig(config); },
  async updateSmsTemplateAdmin(id: string, data: any) { return this.updateAdminSmsTemplate(id, data); },
  async sendTestSmsAdmin(data: { recipient?: string; phone?: string; message: string }) {
    return this.testAdminSmsDispatch({ phone: data.phone || data.recipient || '', message: data.message });
  },
  async getDigitalServicesAdmin() { return this.getAdminDigitalServices(); },
  async updateCablePackage(id: string, data: any) { return this.updateAdminCablePackage(id, data); },
  async createCablePackage(data: any) { return this.createAdminCablePackage(data); },
  async deleteCablePackage(id: string) { return this.deleteAdminCablePackage(id); },
  async updateElectricityDisco(id: string, data: any) { return this.updateAdminElectricityDisco(id, data); },
  async createElectricityDisco(data: any) { return this.createAdminElectricityDisco(data); },
  async deleteElectricityDisco(id: string) { return this.deleteAdminElectricityDisco(id); },
  async getStoreAdmin() { return this.getAdminStore(); },
  async updateStoreSettings(settings: any) { return this.updateAdminStoreSettings(settings); },
  async getAcademyAdmin() { return this.getAdminAcademy(); },
  async updateAcademySettings(settings: any) { return this.updateAdminAcademySettings(settings); },
  async getReportsAdmin() { return this.getAdminReports(); },
  async updateReportsSettings(settings: any) { return this.updateAdminReportsSettings(settings); },

  // -------------------------------------------------------------
  // STAGE 4: KYC & TRANSACTION AUTHORIZATION APIS
  // -------------------------------------------------------------
  async getKycStatus(): Promise<{
    success: boolean;
    user: User;
    level_info: {
      level: number;
      name: string;
      daily_limit: number;
      description: string;
      allowed_services: string[];
    };
    active_submission: KycSubmission | null;
    virtual_account: VirtualAccountItem | null;
    rules: ServiceSecurityRule[];
  }> {
    return request('/api/kyc/status');
  },

  async submitKyc(data: {
    target_level: number;
    full_legal_name: string;
    date_of_birth: string;
    phone_number: string;
    email: string;
    residential_address: string;
    state: string;
    lga: string;
    nin?: string;
    bvn?: string;
    id_type: string;
    id_number: string;
    id_document_url?: string;
    selfie_url?: string;
    proof_of_address_url?: string;
    consent_obtained: boolean;
    auto_verify?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    submission: KycSubmission;
    instant_verified?: boolean;
    verification_reference?: string;
  }> {
    return request('/api/kyc/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async authorizePurchase(data: {
    service_key: string;
    amount: number;
    pin?: string;
    details?: any;
  }): Promise<{
    success: boolean;
    authorized: boolean;
    message: string;
    balance_remaining: number;
    service_rule: ServiceSecurityRule;
  }> {
    return request('/api/kyc/authorize-purchase', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getVirtualAccount(): Promise<{
    success: boolean;
    virtual_account: VirtualAccountItem | null;
    message?: string;
    eligible?: boolean;
    required_level?: number;
    current_level?: number;
  }> {
    return request('/api/kyc/virtual-account');
  },

  async getAdminKycSubmissions(params: {
    status?: string;
    level?: string;
    search?: string;
  } = {}): Promise<{
    success: boolean;
    submissions: KycSubmission[];
    metrics: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      info_requested: number;
    };
  }> {
    const q = new URLSearchParams();
    if (params.status) q.append('status', params.status);
    if (params.level) q.append('level', params.level);
    if (params.search) q.append('search', params.search);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return request(`/api/kyc/admin/submissions${queryString}`);
  },

  async getAdminKycSubmission(id: string): Promise<{
    success: boolean;
    submission: KycSubmission;
    user: User;
  }> {
    return request(`/api/kyc/admin/submissions/${id}`);
  },

  async reviewKycSubmission(id: string, data: {
    action: 'approve' | 'reject' | 'request_info';
    notes: string;
    rejection_reason?: string;
    additional_info_requested?: string;
  }): Promise<{
    success: boolean;
    message: string;
    submission: KycSubmission;
  }> {
    return request(`/api/kyc/admin/submissions/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async autoVerifyKycSubmission(id: string): Promise<{
    success: boolean;
    message: string;
    result: {
      verified: boolean;
      provider: string;
      reference: string;
      name_matched: boolean;
      timestamp: string;
    };
  }> {
    return request(`/api/kyc/admin/submissions/${id}/auto-verify`, {
      method: 'POST',
    });
  },

  async getAdminServiceSecurityRules(): Promise<{
    success: boolean;
    rules: ServiceSecurityRule[];
  }> {
    return request('/api/kyc/admin/service-rules');
  },

  async updateAdminServiceSecurityRule(key: string, data: {
    requires_pin?: boolean;
    min_kyc_level?: number;
    daily_limit?: number;
    description?: string;
  }): Promise<{
    success: boolean;
    message: string;
    rule: ServiceSecurityRule;
  }> {
    return request(`/api/kyc/admin/service-rules/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ─── Stage 8 Support & Help Centre ─────────────────────────────────────────
  async getSupportTickets(status?: string, category?: string): Promise<{
    success: boolean;
    tickets: any[];
  }> {
    const q = new URLSearchParams();
    if (status) q.append('status', status);
    if (category) q.append('category', category);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return request(`/api/support/tickets${queryString}`);
  },

  async createSupportTicket(data: {
    subject: string;
    category: string;
    priority?: string;
    message: string;
    attachments?: any[];
  }): Promise<{
    success: boolean;
    message: string;
    ticket?: any;
    ticket_id?: number;
    ticket_reference?: string;
  }> {
    return request('/api/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getSupportTicketDetails(id: string | number): Promise<{
    success: boolean;
    ticket: any;
    replies: any[];
  }> {
    return request(`/api/support/tickets/${id}`);
  },

  async replySupportTicket(id: string | number, message: string, isInternalNote?: boolean): Promise<{
    success: boolean;
    message: string;
    reply: any;
  }> {
    return request(`/api/support/tickets/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ message, is_internal_note: !!isInternalNote }),
    });
  },

  async getAdminSupportTickets(params?: {
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
  }): Promise<{
    success: boolean;
    tickets: any[];
    metrics: {
      total: number;
      open: number;
      in_progress: number;
      waiting_customer: number;
      resolved: number;
      closed: number;
    };
  }> {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.priority) q.append('priority', params.priority);
    if (params?.category) q.append('category', params.category);
    if (params?.search) q.append('search', params.search);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return request(`/api/admin/support/tickets${queryString}`);
  },

  async updateSupportTicketStatus(id: string | number, data: {
    status?: string;
    priority?: string;
    assigned_to?: number | string | null;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    return request(`/api/admin/support/tickets/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminSupportTicket(id: string | number): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/support/tickets/${id}`, {
      method: 'DELETE',
    });
  },

  // ─── Stage 8 Global Settings Reconciliation (22 Categories) ───────────────
  async getAdminAllSettings(): Promise<{
    success: boolean;
    settings: Record<string, Record<string, any>>;
    categories: string[];
  }> {
    return request('/api/admin/settings/all');
  },

  async updateAdminSettingsCategory(category: string, values: Record<string, any>): Promise<{
    success: boolean;
    message: string;
    updated: number;
  }> {
    return request('/api/admin/settings/update', {
      method: 'POST',
      body: JSON.stringify({ category, values }),
    });
  },

  // ─── Stage 8 Notification Administration ──────────────────────────────────
  async getAdminNotificationOverview(): Promise<{
    success: boolean;
    metrics: {
      total_in_app: number;
      unread_in_app: number;
      total_broadcasts: number;
      active_announcements: number;
      email_logs_count: number;
      sms_logs_count: number;
    };
    recent_broadcasts: any[];
    recent_logs: any[];
  }> {
    return request('/api/admin/notifications/overview');
  },

  async getAdminBroadcasts(): Promise<{
    success: boolean;
    broadcasts: any[];
  }> {
    return request('/api/admin/notifications/broadcasts');
  },

  async sendAdminBroadcast(data: {
    title: string;
    message: string;
    channel: string;
    target_role?: string;
    user_id?: number | null;
    type?: string;
  }): Promise<{
    success: boolean;
    message: string;
    recipient_count?: number;
  }> {
    return request('/api/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAdminAnnouncements(): Promise<{
    success: boolean;
    announcements: any[];
  }> {
    return request('/api/admin/announcements');
  },

  async saveAdminAnnouncement(data: {
    id?: number | string;
    title: string;
    message?: string;
    content?: string;
    type?: string;
    category?: string;
    target_audience?: string;
    target_user_id?: string;
    status?: 'published' | 'draft';
    is_active?: boolean | number;
    is_pinned?: boolean;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    success: boolean;
    id?: string;
    message: string;
    announcement?: any;
    email_delivery?: {
      triggered: boolean;
      reason?: string;
      total_targeted: number;
      sent: number;
      failed: number;
      skipped_duplicates: number;
      errors?: string[];
    };
  }> {
    return request('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async retryAdminAnnouncementEmails(id: string | number): Promise<{
    success: boolean;
    message: string;
    email_delivery?: {
      total_targeted: number;
      sent: number;
      failed: number;
      skipped_duplicates: number;
    };
  }> {
    return request(`/api/admin/announcements/${id}/retry-emails`, {
      method: 'POST',
    });
  },

  async deleteAdminAnnouncement(id: string | number): Promise<{
    success: boolean;
    message: string;
  }> {
    return request(`/api/admin/announcements/${id}`, {
      method: 'DELETE',
    });
  },

  // ─── Stage 8 Detailed 11 Reports ──────────────────────────────────────────
  async getDetailedReportsAdmin(): Promise<{
    success: boolean;
    reports: {
      generated_at: string;
      customer_report: any;
      transaction_report: any;
      wallet_report: any;
      payment_report: any[];
      nin_service_report: any;
      telecom_report: any;
      provider_expenditure_report: any;
      profit_report: any;
      manual_funding_report: any;
      kyc_report: any;
      staff_activity_report: any;
    };
  }> {
    return request('/api/admin/reports/detailed');
  },

  // ─── Production Cleanup & Footprints Monitoring ───────────────────────────
  async getFootprints(params: {
    category?: string;
    status?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    page?: number;
  } = {}): Promise<{
    success: boolean;
    footprints: ActivityFootprint[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  }> {
    const query = new URLSearchParams();
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.start_date) query.set('start_date', params.start_date);
    if (params.end_date) query.set('end_date', params.end_date);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.page) query.set('page', String(params.page));
    const qs = query.toString();
    return request(`/api/admin/footprints${qs ? `?${qs}` : ''}`);
  },

  async getFootprintStats(): Promise<{
    success: boolean;
    stats: FootprintStats;
    recent_activities: ActivityFootprint[];
  }> {
    return request('/api/admin/footprints/stats');
  },

  getFootprintsExportUrl(params: {
    category?: string;
    status?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
  } = {}): string {
    const token = getStoredToken();
    const query = new URLSearchParams();
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.start_date) query.set('start_date', params.start_date);
    if (params.end_date) query.set('end_date', params.end_date);
    if (token) query.set('token', token);
    const qs = query.toString();
    return `/api/admin/footprints/export${qs ? `?${qs}` : ''}`;
  },

  async createAdminCustomer(payload: AdminCreateCustomerPayload): Promise<{
    success: boolean;
    message: string;
    user: any;
    wallet: any;
  }> {
    return request('/api/admin/customers/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async uploadLogo(payload: {
    file_base64?: string;
    file_name?: string;
    mime_type?: string;
    image_url?: string;
  }): Promise<{
    success: boolean;
    message: string;
    logo_url: string;
  }> {
    return request('/api/admin/settings/upload-logo', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async removeLogo(): Promise<{
    success: boolean;
    message: string;
    logo_url: string;
  }> {
    return request('/api/admin/settings/remove-logo', {
      method: 'POST',
    });
  },

  // ─── Stage 3: Manual NIN & BVN Modifications ──────────────────────────────
  async getModificationServices(): Promise<{
    success: boolean;
    nin_modification: import('../types').ModificationServiceItem[];
    bvn_modification: import('../types').ModificationServiceItem[];
    counts: { nin: number; bvn: number };
  }> {
    return request('/api/modifications/services');
  },

  async getModificationBvnTypes(refresh = false): Promise<{
    success: boolean;
    bvn_types: import('../types').ModificationBvnTypeItem[];
    count: number;
    live_synced: boolean;
    sync_note?: string;
  }> {
    return request(`/api/modifications/bvn-types${refresh ? '?refresh=1' : ''}`);
  },

  async uploadModificationDocument(file: File, docKey: string, serviceKey?: string): Promise<{
    success: boolean;
    message: string;
    document: import('../types').ModificationDocumentAttachment;
  }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_key', docKey);
    if (serviceKey) {
      fd.append('service_key', serviceKey);
    }
    return request('/api/modifications/upload-document', {
      method: 'POST',
      body: fd,
      timeoutMs: 60000,
    });
  },

  async submitModificationRequest(payload: {
    identity_type: 'NIN' | 'BVN';
    service_key: string;
    fields: Record<string, any>;
    document_ids?: Record<string, string>;
    supporting_documents?: Array<{ id: string; doc_key: string }>;
    consent: boolean;
    pin?: string;
    idempotency_key: string;
  }): Promise<{
    success: boolean;
    message: string;
    request: import('../types').ModificationRequestItem;
    pending?: boolean;
    status?: string;
    balance_after?: number;
    newBalance?: number;
    payment_reference?: string;
    provider_reference?: string;
    idempotent_replay?: boolean;
  }> {
    return request('/api/modifications/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 45000,
    });
  },

  async getModificationHistory(params: {
    identity_type?: 'NIN' | 'BVN' | 'ALL';
    status?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    count: number;
    requests: import('../types').ModificationRequestItem[];
  }> {
    const q = new URLSearchParams();
    if (params.identity_type) q.set('identity_type', params.identity_type);
    if (params.status && params.status !== 'all') q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request(`/api/modifications/history${qs ? `?${qs}` : ''}`);
  },

  async pollModificationStatus(id: string): Promise<{
    success: boolean;
    message: string;
    updated: boolean;
    request: import('../types').ModificationRequestItem;
    refund?: any;
  }> {
    return request(`/api/modifications/${encodeURIComponent(id)}/poll`, {
      method: 'POST',
    });
  },

  async submitModificationAdditionalInfo(id: string, payload: {
    note?: string;
    document_ids?: Record<string, string>;
  }): Promise<{
    success: boolean;
    message: string;
    request: import('../types').ModificationRequestItem;
  }> {
    return request(`/api/modifications/${encodeURIComponent(id)}/submit-info`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async fetchProtectedDocumentBlob(url: string): Promise<string> {
    const token = getStoredToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error('Unable to load protected document.');
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // Admin Modification Endpoints
  async getAdminModifications(params: {
    identity_type?: 'NIN' | 'BVN' | 'ALL';
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    requests: import('../types').ModificationRequestItem[];
    pagination: { total: number; page: number; limit: number; total_pages: number };
    stats: import('../types').ModificationAdminStats;
  }> {
    const q = new URLSearchParams();
    if (params.identity_type) q.set('identity_type', params.identity_type);
    if (params.status && params.status !== 'all') q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request(`/api/admin/modifications${qs ? `?${qs}` : ''}`);
  },

  async getAdminModificationDetail(id: string): Promise<{
    success: boolean;
    request: import('../types').ModificationRequestItem;
  }> {
    return request(`/api/admin/modifications/${encodeURIComponent(id)}`);
  },

  async pollAdminModificationStatus(id: string): Promise<{
    success: boolean;
    message: string;
    updated: boolean;
    request: import('../types').ModificationRequestItem;
    refund?: any;
  }> {
    return request(`/api/admin/modifications/${encodeURIComponent(id)}/poll`, {
      method: 'POST',
    });
  },

  async updateAdminModificationRequest(id: string, payload: {
    status: string;
    provider_remarks?: string;
    admin_notes?: string;
    estimated_completion_text?: string;
    trigger_refund?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    request: import('../types').ModificationRequestItem;
    refund?: any;
  }> {
    return request(`/api/admin/modifications/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAdminModificationServices(): Promise<{
    success: boolean;
    nin_modification: import('../types').ModificationServiceItem[];
    bvn_modification: import('../types').ModificationServiceItem[];
    services: import('../types').ModificationServiceItem[];
  }> {
    return request('/api/admin/modifications/services');
  },

  async updateAdminModificationService(key: string, payload: Partial<import('../types').ModificationServiceItem>): Promise<{
    success: boolean;
    message: string;
    service: import('../types').ModificationServiceItem;
  }> {
    return request(`/api/admin/modifications/services/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async getAdminModificationBvnTypes(refresh = false): Promise<{
    success: boolean;
    bvn_types: import('../types').ModificationBvnTypeItem[];
    live_synced: boolean;
    sync_note?: string;
  }> {
    return request(`/api/admin/modifications/bvn-types${refresh ? '?refresh=1' : ''}`);
  },

  async updateAdminModificationBvnType(id: string, payload: {
    label?: string;
    selling_price?: number;
    wholesale_cost?: number;
    is_active?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    bvn_type: import('../types').ModificationBvnTypeItem;
  }> {
    return request(`/api/admin/modifications/bvn-types/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async syncAdminModificationCatalog(): Promise<{
    success: boolean;
    message: string;
    updated_services: number;
    bvn_types_count: number;
    bvn_live_synced: boolean;
    sync_note?: string;
  }> {
    return request('/api/admin/modifications/sync-catalog', {
      method: 'POST',
    });
  },

  // Stage 4 — HAMBAK Enrolment Centre (Customer Endpoints)
  async getEnrolmentServices(): Promise<{
    success: boolean;
    services: import('../types').EnrolmentServiceItem[];
    count: number;
  }> {
    return request('/api/enrolments/services');
  },

  async uploadEnrolmentDocument(
    file: File,
    docKey: string,
    serviceKey?: string
  ): Promise<{
    success: boolean;
    message: string;
    document: import('../types').ModificationDocumentAttachment;
  }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_key', docKey);
    if (serviceKey) {
      fd.append('service_key', serviceKey);
    }
    return request('/api/enrolments/upload-document', {
      method: 'POST',
      body: fd,
      timeoutMs: 60000,
    });
  },

  async submitEnrolmentOrder(payload: {
    service_key: string;
    fields: Record<string, any>;
    document_ids?: Record<string, string>;
    supporting_documents?: Array<{ id: string; doc_key: string }>;
    consent: boolean;
    pin?: string;
    idempotency_key: string;
  }): Promise<{
    success: boolean;
    message: string;
    order: import('../types').EnrolmentOrderItem;
    pending?: boolean;
    status?: string;
    balance_after?: number;
    newBalance?: number;
    payment_reference?: string;
    provider_reference?: string;
    idempotent_replay?: boolean;
  }> {
    return request('/api/enrolments/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 45000,
    });
  },

  async getEnrolmentHistory(params: {
    status?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    count: number;
    orders: import('../types').EnrolmentOrderItem[];
  }> {
    const q = new URLSearchParams();
    if (params.status && params.status !== 'all') q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request(`/api/enrolments/history${qs ? `?${qs}` : ''}`);
  },

  async getEnrolmentOrderStatus(id: string): Promise<{
    success: boolean;
    order: import('../types').EnrolmentOrderItem;
  }> {
    return request(`/api/enrolments/${encodeURIComponent(id)}/status`);
  },

  async pollEnrolmentStatus(id: string): Promise<{
    success: boolean;
    message: string;
    updated: boolean;
    order: import('../types').EnrolmentOrderItem;
    refund?: any;
  }> {
    return request(`/api/enrolments/${encodeURIComponent(id)}/poll`, {
      method: 'POST',
    });
  },

  // Stage 4 — HAMBAK Enrolment Centre (Admin Endpoints)
  async getAdminEnrolments(params: {
    service_key?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    orders: import('../types').EnrolmentOrderItem[];
    pagination: { total: number; page: number; limit: number; total_pages: number };
    stats: import('../types').EnrolmentAdminStats;
  }> {
    const q = new URLSearchParams();
    if (params.service_key && params.service_key !== 'ALL') q.set('service_key', params.service_key);
    if (params.status && params.status !== 'all') q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request(`/api/admin/enrolments${qs ? `?${qs}` : ''}`);
  },

  async getAdminEnrolmentDetail(id: string): Promise<{
    success: boolean;
    order: import('../types').EnrolmentOrderItem;
  }> {
    return request(`/api/admin/enrolments/${encodeURIComponent(id)}`);
  },

  async pollAdminEnrolmentStatus(id: string): Promise<{
    success: boolean;
    message: string;
    updated: boolean;
    order: import('../types').EnrolmentOrderItem;
    refund?: any;
  }> {
    return request(`/api/admin/enrolments/${encodeURIComponent(id)}/poll`, {
      method: 'POST',
    });
  },

  async updateAdminEnrolmentOrder(
    id: string,
    payload: {
      status: string;
      provider_remarks?: string;
      admin_notes?: string;
      estimated_completion_text?: string;
      trigger_refund?: boolean;
    }
  ): Promise<{
    success: boolean;
    message: string;
    order: import('../types').EnrolmentOrderItem;
    refund?: any;
  }> {
    return request(`/api/admin/enrolments/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAdminEnrolmentServices(): Promise<{
    success: boolean;
    services: import('../types').EnrolmentServiceItem[];
    unverified_services: import('../types').EnrolmentUnverifiedNotice[];
  }> {
    return request('/api/admin/enrolments/services');
  },

  async updateAdminEnrolmentService(
    key: string,
    payload: Partial<import('../types').EnrolmentServiceItem>
  ): Promise<{
    success: boolean;
    message: string;
    service: import('../types').EnrolmentServiceItem;
  }> {
    return request(`/api/admin/enrolments/services/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async uploadAdminEnrolmentSample(
    serviceKey: string,
    file: File,
    title: string,
    description = ''
  ): Promise<{
    success: boolean;
    message: string;
    sample: import('../types').EnrolmentSampleDocument;
  }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title);
    if (description) {
      fd.append('description', description);
    }
    return request(`/api/admin/enrolments/services/${encodeURIComponent(serviceKey)}/sample`, {
      method: 'POST',
      body: fd,
      timeoutMs: 60000,
    });
  },

  async deleteAdminEnrolmentSample(id: string): Promise<{
    success: boolean;
    deleted: boolean;
    message: string;
  }> {
    return request(`/api/admin/enrolments/samples/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async syncAdminEnrolmentCatalog(): Promise<{
    success: boolean;
    message: string;
    updated_services: number;
  }> {
    return request('/api/admin/enrolments/sync-catalog', {
      method: 'POST',
    });
  },

  // ---------------------------------------------------------------------------
  // Phase 11 — Referral, Rewards, Points, Cash Withdrawal, PIN & Security Admin
  // ---------------------------------------------------------------------------
  async getReferralPublicConfig(): Promise<{
    success: boolean;
    program: import('../types').ReferralPublicProgram;
    pin_policy: import('../types').PinPolicy;
  }> {
    return request('/api/referrals/public-config');
  },

  async validateReferralCode(code: string): Promise<{
    success: boolean;
    valid: boolean;
    code?: string;
    referrer_name_masked?: string;
    program?: import('../types').ReferralPublicProgram;
    message?: string;
  }> {
    return request(`/api/referrals/validate-code?code=${encodeURIComponent(code)}`);
  },

  async getReferralDashboard(): Promise<
    { success: boolean } & import('../types').ReferralDashboardData
  > {
    return request('/api/referrals/dashboard');
  },

  async convertReferralToWallet(
    amount: number,
    pin: string,
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    message: string;
    converted_amount: number;
    fee_amount?: number;
    net_credited?: number;
    new_wallet_balance?: number;
  }> {
    return request('/api/referrals/convert-to-wallet', {
      method: 'POST',
      body: JSON.stringify({ amount, pin, transaction_pin: pin, idempotency_key: idempotencyKey }),
    });
  },

  async convertReferralPoints(
    points: number,
    pin: string
  ): Promise<{
    success: boolean;
    message: string;
    points_converted: number;
    naira_credited: number;
    new_wallet_balance?: number;
  }> {
    return request('/api/referrals/convert-points', {
      method: 'POST',
      body: JSON.stringify({ points, pin, transaction_pin: pin }),
    });
  },

  async listCustomerWithdrawals(): Promise<{
    success: boolean;
    withdrawals: import('../types').ReferralWithdrawalItem[];
  }> {
    return request('/api/referrals/withdrawals');
  },

  async requestReferralWithdrawal(payload: {
    amount: number;
    bank_name: string;
    account_number: string;
    account_name: string;
    pin: string;
    idempotency_key?: string;
  }): Promise<{
    success: boolean;
    message: string;
    withdrawal: import('../types').ReferralWithdrawalItem;
  }> {
    return request('/api/referrals/withdrawals', {
      method: 'POST',
      body: JSON.stringify({ ...payload, transaction_pin: payload.pin }),
    });
  },

  async cancelReferralWithdrawal(id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return request(`/api/referrals/withdrawals/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // Admin & Super Admin Referrals
  async getAdminReferralOverview(): Promise<{
    success: boolean;
    config: import('../types').ReferralProgramConfig;
    campaigns: import('../types').ReferralCampaign[];
    tiers: import('../types').ReferralTier[];
    referrals: import('../types').ReferralRecordItem[];
    rewards: import('../types').ReferralRewardItem[];
    audit_logs: any[];
    report: import('../types').ReferralGrowthReport;
  }> {
    return request('/api/admin/referrals/overview');
  },

  async updateAdminReferralConfig(
    config: Partial<import('../types').ReferralProgramConfig>
  ): Promise<{
    success: boolean;
    message: string;
    config: import('../types').ReferralProgramConfig;
  }> {
    return request('/api/admin/referrals/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async saveAdminReferralCampaign(
    payload: Partial<import('../types').ReferralCampaign>,
    id?: string
  ): Promise<{ success: boolean; message: string; campaign: import('../types').ReferralCampaign }> {
    return request(id ? `/api/admin/referrals/campaigns/${encodeURIComponent(id)}` : '/api/admin/referrals/campaigns', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteAdminReferralCampaign(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/referrals/campaigns/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async saveAdminReferralTier(
    payload: Partial<import('../types').ReferralTier>,
    id?: string
  ): Promise<{ success: boolean; message: string; tier: import('../types').ReferralTier }> {
    return request(id ? `/api/admin/referrals/tiers/${encodeURIComponent(id)}` : '/api/admin/referrals/tiers', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteAdminReferralTier(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/referrals/tiers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async adminReferralRewardAction(
    id: string,
    action: 'settle' | 'reverse' | 'flag',
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/referrals/rewards/${encodeURIComponent(id)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
  },

  async adminUpdateReferralStatus(
    id: string,
    status: 'registered' | 'qualified' | 'flagged' | 'blocked',
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/referrals/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
  },

  async adminSettleMatureReferrals(): Promise<{
    success: boolean;
    message: string;
    settled_count: number;
  }> {
    return request('/api/admin/referrals/settle', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // Admin Withdrawals Queue
  async getAdminWithdrawals(
    filter?: string | { status?: string; search?: string }
  ): Promise<{
    success: boolean;
    withdrawals: import('../types').ReferralWithdrawalItem[];
    stats: {
      pending_count: number;
      pending_payout_total: number;
      processing_count: number;
      paid_count: number;
      paid_total: number;
      rejected_count: number;
    };
  }> {
    const status = typeof filter === 'string' ? filter : filter?.status;
    const search = typeof filter === 'object' ? filter?.search : undefined;
    const qs = new URLSearchParams();
    if (status && status !== 'all') qs.set('status', status);
    if (search && search.trim()) qs.set('search', search.trim());
    const str = qs.toString();
    return request(`/api/admin/withdrawals${str ? `?${str}` : ''}`);
  },

  async adminProcessWithdrawal(
    id: string,
    action: 'approve' | 'process' | 'mark_paid' | 'reject' | 'fail',
    payload: {
      payment_reference?: string;
      rejection_reason?: string;
      admin_note?: string;
      receipt_url?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/withdrawals/${encodeURIComponent(id)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, ...payload }),
    });
  },

  // Admin PIN Governance & MFA/Session Security
  async getAdminPinOverview(): Promise<{
    success: boolean;
    policy: import('../types').PinPolicy;
    summary: {
      total_customers: number;
      pin_activated_count: number;
      pin_missing_count: number;
      pin_locked_count: number;
    };
    users: import('../types').PinUserStatusRow[];
  }> {
    return request('/api/admin/pin/overview');
  },

  async updateAdminPinPolicy(
    policy: Partial<import('../types').PinPolicy>
  ): Promise<{
    success: boolean;
    message: string;
    policy: import('../types').PinPolicy;
  }> {
    return request('/api/admin/pin/policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    });
  },

  async adminUnlockUserPin(userId: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/pin/users/${encodeURIComponent(userId)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async adminResetUserPin(
    userId: string,
    mode: 'force_reactivate' | 'set_temp_pin',
    newPin?: string
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/pin/users/${encodeURIComponent(userId)}/reset`, {
      method: 'POST',
      body: JSON.stringify({ mode, new_pin: newPin }),
    });
  },

  async getAdminSecurityOverview(): Promise<{
    success: boolean;
    security_settings: import('../types').SessionSecuritySettings;
    mfa_policy: import('../types').MfaPolicy;
    pin_policy: import('../types').PinPolicy;
    active_sessions: import('../types').UserSessionItem[];
    failed_logins: any[];
    mfa_stats: {
      admin_mfa_enabled: number;
      total_admins: number;
      customer_mfa_enabled: number;
    };
    caller_is_superadmin: boolean;
  }> {
    return request('/api/admin/security/overview');
  },

  async adminRevokeSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async updateAdminMfaSecurityPolicy(payload: {
    mfa_policy?: Partial<import('../types').MfaPolicy>;
    security_settings?: Partial<import('../types').SessionSecuritySettings>;
  }): Promise<{
    success: boolean;
    message: string;
    mfa_policy: import('../types').MfaPolicy;
    security_settings: import('../types').SessionSecuritySettings;
  }> {
    return request('/api/admin/security/mfa-policy', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async getAdminReferralGrowthReport(params?: {
    date_from?: string;
    date_to?: string;
    campaign_code?: string;
  }): Promise<{
    success: boolean;
    report: import('../types').ReferralGrowthReport;
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    if (params?.campaign_code) qs.set('campaign_code', params.campaign_code);
    const str = qs.toString();
    return request(`/api/admin/reports/referral-growth${str ? `?${str}` : ''}`);
  },

  // ---------------------------------------------------------------------------
  // Integrated Business Management & Accounting (11 Modules)
  // ---------------------------------------------------------------------------
  async getAccountingOverview(params?: { date_from?: string; date_to?: string }): Promise<{
    success: boolean;
    lagos_now: string;
    sync_result: any;
    period_summary: import('../types').AccountingPeriodSummary;
    today_summary: import('../types').AccountingPeriodSummary;
    yesterday_summary: import('../types').AccountingPeriodSummary;
    month_summary: import('../types').AccountingPeriodSummary;
    wallet_liabilities: import('../types').AccountingWalletLiabilitySummary;
    channel_balances: import('../types').AccountingChannelBalance[];
    low_stock_count: number;
    low_stock_items: import('../types').AccountingInventoryItem[];
    daily_trend: Array<{
      entry_date: string;
      website_revenue: number | string;
      physical_revenue: number | string;
      other_income: number | string;
      cogs: number | string;
      expenses_fees: number | string;
      net_profit: number | string;
      wallet_funding: number | string;
    }>;
    recent_entries: import('../types').AccountingEntryItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    const str = qs.toString();
    return request(`/api/admin/accounting/overview${str ? `?${str}` : ''}`);
  },

  async syncAccountingWebsiteTransactions(force = false): Promise<{
    success: boolean;
    message: string;
    synced_at_lagos: string;
    inserted: number;
    updated: number;
    skipped: number;
    total_source_transactions: number;
  }> {
    return request('/api/admin/accounting/sync', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  },

  async getAccountingWebsiteTransactions(params?: {
    date_from?: string;
    date_to?: string;
    entry_category?: string;
    service_domain?: string;
    search?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    period: { date_from: string; date_to: string };
    summary: import('../types').AccountingPeriodSummary;
    entries: import('../types').AccountingEntryItem[];
    pending_manual_funding: { count: number; amount: number };
    pending_gateway_payments: { count: number; amount: number };
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    if (params?.entry_category) qs.set('entry_category', params.entry_category);
    if (params?.service_domain) qs.set('service_domain', params.service_domain);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    const str = qs.toString();
    return request(`/api/admin/accounting/website-transactions${str ? `?${str}` : ''}`);
  },

  async getAccountingWalletLiabilities(): Promise<{
    success: boolean;
    summary: import('../types').AccountingWalletLiabilitySummary;
    mismatches: any[];
    holders: Array<{
      id: string;
      full_name: string;
      email: string;
      phone_number: string;
      role: string;
      status: string;
      balance: number | string;
      wallet_status?: string;
      lifetime_funded: number | string;
      lifetime_spent: number | string;
      lifetime_refunded: number | string;
    }>;
    recent_movements: any[];
  }> {
    return request('/api/admin/accounting/wallet-liabilities');
  },

  async getAccountingExpensesIncome(params?: {
    date_from?: string;
    date_to?: string;
    record_type?: string;
    category?: string;
    status?: string;
  }): Promise<{
    success: boolean;
    period: { date_from: string; date_to: string };
    summary: {
      total_expenses: number;
      total_other_income: number;
      total_fees: number;
      expense_count: number;
      income_count: number;
    };
    by_category: Array<{ record_type: string; category: string; items_count: number; total_amount: number | string }>;
    records: import('../types').AccountingExpenseIncomeItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    if (params?.record_type) qs.set('record_type', params.record_type);
    if (params?.category) qs.set('category', params.category);
    if (params?.status) qs.set('status', params.status);
    const str = qs.toString();
    return request(`/api/admin/accounting/expenses-income${str ? `?${str}` : ''}`);
  },

  async createAccountingExpenseOrIncome(payload: {
    record_type: 'expense' | 'other_income';
    entry_date?: string;
    category: string;
    title: string;
    description?: string;
    party_name?: string;
    amount: number;
    fee_amount?: number;
    payment_method: 'cash' | 'pos' | 'bank_transfer' | 'wallet' | 'other';
    reference?: string;
    attachment_note?: string;
  }): Promise<{ success: boolean; message: string; record: import('../types').AccountingExpenseIncomeItem }> {
    return request('/api/admin/accounting/expenses-income', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async voidAccountingExpenseOrIncome(id: string, reason: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/accounting/expenses-income/${encodeURIComponent(id)}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getAccountingPhysicalSales(params?: {
    date_from?: string;
    date_to?: string;
    service_category?: string;
    payment_mode?: string;
    status?: string;
    search?: string;
  }): Promise<{
    success: boolean;
    period: { date_from: string; date_to: string };
    summary: {
      completed_count: number;
      voided_count: number;
      gross_sales: number;
      discounts: number;
      net_revenue: number;
      direct_cost: number;
      pos_fees: number;
      net_profit: number;
      cash_total: number;
      pos_total: number;
      transfer_total: number;
    };
    by_service: Array<{ service_category: string; sales_count: number; net_revenue: number | string; direct_cost: number | string }>;
    by_staff: Array<{ attendant_name: string; sales_count: number; net_revenue: number | string }>;
    sales: import('../types').AccountingPhysicalSaleItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    if (params?.service_category) qs.set('service_category', params.service_category);
    if (params?.payment_mode) qs.set('payment_mode', params.payment_mode);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    const str = qs.toString();
    return request(`/api/admin/accounting/physical-sales${str ? `?${str}` : ''}`);
  },

  async createAccountingPhysicalSale(payload: {
    sale_date?: string;
    customer_name?: string;
    customer_phone?: string;
    service_category: string;
    service_name: string;
    description?: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    direct_cost?: number;
    inventory_item_id?: string;
    inventory_qty_used?: number;
    payment_mode: 'cash' | 'pos' | 'transfer' | 'split';
    cash_amount?: number;
    pos_amount?: number;
    transfer_amount?: number;
    pos_fee?: number;
    pos_rrn?: string;
    bank_reference?: string;
  }): Promise<{ success: boolean; message: string; sale: import('../types').AccountingPhysicalSaleItem }> {
    return request('/api/admin/accounting/physical-sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async voidAccountingPhysicalSale(id: string, reason: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/accounting/physical-sales/${encodeURIComponent(id)}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getAccountingInventory(): Promise<{
    success: boolean;
    summary: {
      total_items: number;
      low_stock_count: number;
      total_stock_valuation: number;
      potential_retail_value: number;
    };
    items: import('../types').AccountingInventoryItem[];
    movements: import('../types').AccountingInventoryMovement[];
  }> {
    return request('/api/admin/accounting/inventory');
  },

  async saveAccountingInventoryItem(
    payload: Partial<import('../types').AccountingInventoryItem> & { initial_stock?: number; unit_cost?: number },
    id?: string
  ): Promise<{ success: boolean; message: string; item: import('../types').AccountingInventoryItem }> {
    return request(id ? `/api/admin/accounting/inventory/items/${encodeURIComponent(id)}` : '/api/admin/accounting/inventory/items', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  },

  async recordAccountingInventoryMovement(payload: {
    item_id: string;
    movement_type: 'purchase' | 'usage' | 'wastage' | 'adjustment_in' | 'adjustment_out';
    quantity: number;
    unit_cost?: number;
    payment_method?: string;
    supplier_name?: string;
    reference?: string;
    notes?: string;
    entry_date?: string;
    record_as_expense?: boolean;
  }): Promise<{ success: boolean; message: string; summary: any; items: import('../types').AccountingInventoryItem[]; movements: import('../types').AccountingInventoryMovement[] }> {
    return request('/api/admin/accounting/inventory/movements', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAccountingReconciliations(params?: { date_from?: string; date_to?: string }): Promise<{
    success: boolean;
    channel_balances: import('../types').AccountingChannelBalance[];
    reconciliations: import('../types').AccountingReconciliationItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    const str = qs.toString();
    return request(`/api/admin/accounting/reconciliations${str ? `?${str}` : ''}`);
  },

  async previewAccountingReconciliation(date: string, accountCode: string): Promise<{
    success: boolean;
    reconcile_date: string;
    account: import('../types').AccountingAccountRecord;
    opening_balance: number;
    expected_inflow: number;
    expected_outflow: number;
    expected_fees: number;
    expected_closing: number;
    entries: any[];
  }> {
    const qs = new URLSearchParams({ date, account_code: accountCode });
    return request(`/api/admin/accounting/reconciliations/preview?${qs.toString()}`);
  },

  async submitAccountingReconciliation(payload: {
    reconcile_date: string;
    account_code: string;
    actual_counted: number;
    notes?: string;
  }): Promise<{ success: boolean; message: string; reconciliation: import('../types').AccountingReconciliationItem }> {
    return request('/api/admin/accounting/reconciliations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async approveAccountingReconciliation(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/accounting/reconciliations/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async getAccountingLedger(params?: {
    date_from?: string;
    date_to?: string;
    source_origin?: string;
    entry_category?: string;
    payment_channel?: string;
    reconciliation_status?: string;
    search?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    period: { date_from: string; date_to: string };
    totals: {
      entries_count: number;
      total_revenue: number;
      total_costs: number;
      total_fees: number;
      total_expenses: number;
      total_net_profit: number;
      net_wallet_delta: number;
    };
    entries: import('../types').AccountingEntryItem[];
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    if (params?.source_origin) qs.set('source_origin', params.source_origin);
    if (params?.entry_category) qs.set('entry_category', params.entry_category);
    if (params?.payment_channel) qs.set('payment_channel', params.payment_channel);
    if (params?.reconciliation_status) qs.set('reconciliation_status', params.reconciliation_status);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    const str = qs.toString();
    return request(`/api/admin/accounting/ledger${str ? `?${str}` : ''}`);
  },

  async downloadAccountingLedgerCsv(params?: Record<string, string | undefined>): Promise<void> {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, v);
      });
    }
    const token = getStoredToken();
    const res = await fetch(`/api/admin/accounting/ledger/export?${qs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error('Failed to export accounting ledger CSV.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hambaktech_accounting_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  async reverseAccountingLedgerEntry(id: string, reason: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/accounting/ledger/${encodeURIComponent(id)}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getAccountingAnalytics(params?: { date_from?: string; date_to?: string }): Promise<{
    success: boolean;
    period: { date_from: string; date_to: string };
    summary: import('../types').AccountingPeriodSummary;
    daily_series: any[];
    top_services: any[];
    expense_breakdown: any[];
    staff_performance: any[];
  }> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    const str = qs.toString();
    return request(`/api/admin/accounting/analytics${str ? `?${str}` : ''}`);
  },

  async previewAccountingDailyReport(params?: { date?: string; cutoff?: string }): Promise<{
    success: boolean;
    report: any;
    logs: import('../types').AccountingReportLog[];
  }> {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.cutoff) qs.set('cutoff', params.cutoff);
    const str = qs.toString();
    return request(`/api/admin/accounting/daily-report/preview${str ? `?${str}` : ''}`);
  },

  async sendAccountingDailyReportNow(recipients?: string[]): Promise<{
    success: boolean;
    message: string;
    recipients: string[];
    report_key: string;
    snapshot: any;
  }> {
    return request('/api/admin/accounting/daily-report/send', {
      method: 'POST',
      body: JSON.stringify(recipients && recipients.length > 0 ? { recipients } : {}),
    });
  },

  async getAccountingConfig(): Promise<{
    success: boolean;
    config: import('../types').AccountingConfig;
    accounts: import('../types').AccountingAccountRecord[];
  }> {
    return request('/api/admin/accounting/config');
  },

  async updateAccountingConfig(payload: Partial<import('../types').AccountingConfig>): Promise<{
    success: boolean;
    message: string;
    config: import('../types').AccountingConfig;
  }> {
    return request('/api/admin/accounting/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async updateAccountingAccount(
    code: string,
    payload: Partial<import('../types').AccountingAccountRecord>
  ): Promise<{ success: boolean; message: string; account: import('../types').AccountingAccountRecord }> {
    return request(`/api/admin/accounting/accounts/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};

