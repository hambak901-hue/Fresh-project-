/**
 * @file api.ts
 * Frontend HTTP client for HambakTech server APIs.
 */

import { User, Transaction, VerificationRecord, TelecomOrder, SystemStatusResponse, KycSubmission, ServiceSecurityRule, VirtualAccountItem } from '../types';

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
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string>),
  };

  // Only set application/json if body is not FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

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
      body: JSON.stringify({ amount, callback_url: callbackUrl }),
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
      body: JSON.stringify({ reference }),
    });
  },

  async submitManualFunding(data: {
    amount: number;
    sender_name: string;
    bank_name: string;
    reference: string;
    remarks?: string;
    payment_proof_url?: string;
  }): Promise<{ success: boolean; message: string; transaction: Transaction }> {
    return request('/api/wallet/manual-funding', {
      method: 'POST',
      body: JSON.stringify(data),
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

  async getTelecomPlans(): Promise<{ activeProvider: string; plans: import('../types').TelecomPlanItem[] }> {
    return request('/api/telecom/plans');
  },

  async purchaseData(planId: string, phone: string): Promise<{ success: boolean; message: string; order: TelecomOrder; newBalance: number }> {
    return request('/api/telecom/purchase-data', {
      method: 'POST',
      body: JSON.stringify({ planId, phone }),
    });
  },

  async purchaseAirtime(network: string, phone: string, amount: number): Promise<{ success: boolean; message: string; order: TelecomOrder; discountSaved: number; newBalance: number }> {
    return request('/api/telecom/purchase-airtime', {
      method: 'POST',
      body: JSON.stringify({ network, phone, amount }),
    });
  },

  async getAirtimePinDenominations(): Promise<{ denominations: import('../types').AirtimePinDenomination[] }> {
    return request('/api/telecom/airtime-pins/denominations');
  },

  async purchaseAirtimePin(data: { network: string; denomination: number; quantity: number; businessName?: string }): Promise<{
    success: boolean;
    message: string;
    pins: Array<{ serial: string; pin: string; load_code: string; value: number }>;
    order: TelecomOrder;
    newBalance: number;
  }> {
    return request('/api/telecom/purchase-airtime-pin', {
      method: 'POST',
      body: JSON.stringify(data),
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

  async purchaseCable(data: { provider: string; smartcardNumber: string; packageId: string; phone?: string }): Promise<{
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

  async getDataPinDenominations(): Promise<{ denominations: import('../types').DataPinDenomination[] }> {
    return request('/api/telecom/data-pins/denominations');
  },

  async purchaseDataPin(data: { network: string; planId: string; quantity: number; businessName?: string }): Promise<{
    success: boolean;
    message: string;
    pins: Array<{ serial: string; pin: string; size: string; load_code: string }>;
    order: TelecomOrder;
    newBalance: number;
  }> {
    return request('/api/telecom/purchase-data-pin', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async sendBulkSms(data: { senderId: string; recipients: string[] | string; message: string }): Promise<{
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

  async purchaseElectricity(data: { discoId: string; meterNumber: string; meterType?: string; amount: number; phone?: string }): Promise<{
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

  async purchaseExamPin(data: { examId: string; quantity: number; phone?: string }): Promise<{
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

  async verifyTelecomTransaction(reference: string): Promise<{ success: boolean; result: any; order?: TelecomOrder }> {
    return request(`/api/telecom/verify/${encodeURIComponent(reference)}`);
  },

  async getTelecomHistory(service?: string, search?: string): Promise<{ success: boolean; count: number; orders: TelecomOrder[] }> {
    const params = new URLSearchParams();
    if (service) params.set('service', service);
    if (search) params.set('search', search);
    const qs = params.toString();
    return request(`/api/telecom/history${qs ? `?${qs}` : ''}`);
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
  // PHASE 8: ACADEMY ADMINISTRATION & CUSTOMER ACADEMY
  // -------------------------------------------------------------
  async getAdminAcademy(): Promise<{ success: boolean; courses: import('../types').AcademyCourse[]; settings: import('../types').AcademySettings }> {
    return request('/api/admin/academy');
  },

  async updateAdminAcademySettings(settings: Partial<import('../types').AcademySettings>): Promise<{ success: boolean; message: string; settings: import('../types').AcademySettings }> {
    return request('/api/admin/academy/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async createAdminAcademyCourse(data: Omit<import('../types').AcademyCourse, 'id' | 'created_at'>): Promise<{ success: boolean; message: string; course: import('../types').AcademyCourse }> {
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

  async getCustomerAcademy(): Promise<{ success: boolean; courses: import('../types').AcademyCourse[]; settings: import('../types').AcademySettings }> {
    return request('/api/customer/academy');
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
  async setTransactionPin(currentPin: string, newPin: string): Promise<{ success: boolean; message: string }> {
    return request('/api/customer/pin', {
      method: 'PUT',
      body: JSON.stringify({ currentPin, newPin }),
    });
  },

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
};

