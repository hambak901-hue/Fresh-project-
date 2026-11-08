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

  // Verification (Phase 5 Complete 2SureVerify Integration)
  async getVerificationServices(): Promise<{
    success: boolean;
    activeProvider: string;
    services: import('../types').IdentityService[];
    categories: Record<string, import('../types').IdentityService[]>;
    slipTypes: Array<{ id: string; name: string; description: string }>;
  }> {
    return request('/api/verification/services');
  },

  async executeIdentityService(
    serviceKey: string,
    payload: any,
    consent: boolean = true,
    testSandbox: boolean = false
  ): Promise<{
    success: boolean;
    pending?: boolean;
    message: string;
    reference: string;
    newBalance: number;
    recordId: string;
    result: any;
    service: { key: string; name: string; category: string };
  }> {
    return request('/api/verification/verify', {
      method: 'POST',
      body: JSON.stringify({ serviceKey, payload, consent, testSandbox }),
    });
  },

  async verifyIdentity(type: string, identifier: string, provider = '2sureverify'): Promise<{ success: boolean; newBalance: number; result: any }> {
    return request('/api/verification/verify', {
      method: 'POST',
      body: JSON.stringify({ serviceKey: type === 'BVN' ? 'bvn_v1' : 'nin_v1', payload: { nin: identifier, bvn: identifier, slip_type: 'ninStandard' }, consent: true }),
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

  async getVerificationRecord(id: string): Promise<{ success: boolean; record: import('../types').VerificationRecord }> {
    return request(`/api/verification/record/${id}`);
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

  async getCablePackages(): Promise<{ packages: Record<string, Array<{ id: string; name: string; price: number; channels: number }>> }> {
    return request('/api/telecom/cable-packages');
  },

  async verifySmartcard(provider: string, smartcardNumber: string): Promise<any> {
    return request('/api/telecom/verify-smartcard', {
      method: 'POST',
      body: JSON.stringify({ provider, smartcardNumber }),
    });
  },

  async purchaseCable(data: { provider: string; smartcardNumber: string; packageId: string; phone?: string }): Promise<any> {
    return request('/api/telecom/purchase-cable', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getElectricityDiscos(): Promise<{ discos: Array<{ id: string; name: string; state: string; min: number }> }> {
    return request('/api/telecom/electricity-discos');
  },

  async verifyMeter(discoId: string, meterNumber: string, meterType?: string): Promise<any> {
    return request('/api/telecom/verify-meter', {
      method: 'POST',
      body: JSON.stringify({ discoId, meterNumber, meterType }),
    });
  },

  async purchaseElectricity(data: { discoId: string; meterNumber: string; meterType?: string; amount: number; phone?: string }): Promise<any> {
    return request('/api/telecom/purchase-electricity', {
      method: 'POST',
      body: JSON.stringify(data),
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

  async createAnnouncement(data: { title: string; content: string; category?: string; is_pinned?: boolean; status?: string; author?: string }): Promise<{ success: boolean; announcement: import('../types').AnnouncementItem }> {
    return request('/api/cms/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAnnouncement(id: string, updates: Partial<import('../types').AnnouncementItem>): Promise<{ success: boolean; announcement: import('../types').AnnouncementItem }> {
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

  async submitManualFunding(data: { amount: number; sender_name: string; bank_name?: string; reference: string; payment_proof_url?: string }): Promise<{ success: boolean; message: string; transaction: Transaction }> {
    return request('/api/customer/manual-funding', {
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

  async getTelecomHistory(): Promise<{ orders: TelecomOrder[] }> {
    return request('/api/telecom/history');
  },

  // ---------------------------------------------------------------------------
  // Super Admin & Global Management (Phase 4)
  // ---------------------------------------------------------------------------
  async getAdminOverview(): Promise<import('../types').AdminOverviewData> {
    return request('/api/admin/overview');
  },

  async getAdminCustomers(params?: { search?: string; status?: string; tier?: string; role?: string }): Promise<{ success: boolean; count: number; customers: User[] }> {
    const query = new URLSearchParams(params as any).toString();
    return request(`/api/admin/customers${query ? `?${query}` : ''}`);
  },

  async getAdminCustomerDetail(id: string): Promise<{
    success: boolean;
    customer: User;
    transactions: Transaction[];
    orders: TelecomOrder[];
    verifications: VerificationRecord[];
    auditLogs: any[];
  }> {
    return request(`/api/admin/customers/${id}`);
  },

  async updateAdminCustomer(id: string, updates: Partial<User>): Promise<{ success: boolean; message: string; customer: User }> {
    return request(`/api/admin/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
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
    return request('/api/admin/services/academy', {
      method: 'POST',
      body: JSON.stringify(course),
    });
  },

  async updateAcademyCourse(id: string, updates: any): Promise<{ success: boolean; message: string; course: import('../types').AcademyCourse }> {
    return request(`/api/admin/services/academy/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteAcademyCourse(id: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/services/academy/${id}`, { method: 'DELETE' });
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
};

