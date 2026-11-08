/**
 * @file api.ts
 * Frontend HTTP client for HambakTech server APIs.
 */

import { User, Transaction, VerificationRecord, TelecomOrder, SystemStatusResponse } from '../types';

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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ success: boolean; token: string; user: User }> {
    const res = await request<{ success: boolean; token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    return res;
  },

  async register(data: { email: string; password: string; full_name: string; phone_number: string }): Promise<{ success: boolean; token: string; user: User }> {
    const res = await request<{ success: boolean; token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setStoredToken(res.token);
    return res;
  },

  async getMe(): Promise<{ success: boolean; user: User }> {
    return request<{ success: boolean; user: User }>('/api/auth/me');
  },

  async quickSwitch(role: 'customer' | 'admin' | 'superadmin'): Promise<{ success: boolean; token: string; user: User }> {
    const res = await request<{ success: boolean; token: string; user: User }>('/api/auth/quick-switch', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    setStoredToken(res.token);
    return res;
  },

  logout(): void {
    clearStoredToken();
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

  // Wallet
  async getWalletSummary(): Promise<{
    balance: number;
    currency: string;
    totalSpent: number;
    totalFunded: number;
    transactionCount: number;
    recentTransactions: Transaction[];
    bankDetails: { accountName: string; bank: string; accountNumber: string };
  }> {
    return request('/api/wallet/summary');
  },

  async fundWallet(amount: number, gateway = 'flutterwave'): Promise<{ success: boolean; balance: number; transaction: Transaction }> {
    return request('/api/wallet/fund', {
      method: 'POST',
      body: JSON.stringify({ amount, gateway }),
    });
  },

  // Verification (Phase 5 ready)
  async getVerificationServices(): Promise<{ activeProvider: string; services: any[] }> {
    return request('/api/verification/services');
  },

  async verifyIdentity(type: string, identifier: string, provider = '2sureverify'): Promise<{ success: boolean; newBalance: number; result: any }> {
    return request('/api/verification/verify', {
      method: 'POST',
      body: JSON.stringify({ type, identifier, provider }),
    });
  },

  // Telecom (Phase 6 ready)
  async getTelecomPlans(): Promise<{ activeProvider: string; plans: any[] }> {
    return request('/api/telecom/plans');
  },

  async purchaseData(planId: string, phone: string): Promise<{ success: boolean; message: string; order: TelecomOrder; newBalance: number }> {
    return request('/api/telecom/purchase-data', {
      method: 'POST',
      body: JSON.stringify({ planId, phone }),
    });
  },

  async purchaseAirtime(network: string, phone: string, amount: number): Promise<{ success: boolean; message: string; order: TelecomOrder; newBalance: number }> {
    return request('/api/telecom/purchase-airtime', {
      method: 'POST',
      body: JSON.stringify({ network, phone, amount }),
    });
  },

  // cPanel & TrueHost LON110 (Phase 10 ready)
  async getCpanelInfo(): Promise<any> {
    return request('/api/cpanel/info');
  },

  async testSftp(): Promise<{ success: boolean; message: string; connectionDetails: any }> {
    return request('/api/cpanel/test-sftp', { method: 'POST' });
  },

  async exportDeploymentPackage(): Promise<any> {
    return request('/api/cpanel/export-package');
  },
};
