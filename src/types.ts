/**
 * @file types.ts
 * HambakTech Enterprise TypeScript interfaces.
 */

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  role: 'customer' | 'admin' | 'superadmin';
  wallet_balance: number;
  kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  bvn?: string;
  nin?: string;
  tier: 1 | 2 | 3;
  referral_code: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'suspended';
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'credit' | 'debit';
  amount: number;
  balance_before: number;
  balance_after: number;
  category: 'funding' | 'nin_verification' | 'bvn_verification' | 'data_purchase' | 'airtime' | 'cable_tv' | 'store_purchase' | 'manual_adjustment';
  reference: string;
  gateway: 'flutterwave' | 'paystack' | 'manual_transfer' | 'internal';
  status: 'successful' | 'pending' | 'failed';
  description: string;
  metadata?: any;
  created_at: string;
}

export interface VerificationRecord {
  id: string;
  user_id: string;
  type: 'NIN' | 'BVN' | 'CAC' | 'PHONE';
  search_value: string;
  provider: '2sureverify' | 'veripine';
  cost: number;
  status: 'completed' | 'failed' | 'processing';
  result?: any;
  created_at: string;
}

export interface TelecomOrder {
  id: string;
  user_id: string;
  service: 'data' | 'airtime' | 'cable' | 'electricity';
  network: 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';
  phone: string;
  plan: string;
  amount: number;
  cost_price: number;
  profit: number;
  provider: 'ulamadata' | 'vtpass';
  provider_ref: string;
  status: 'successful' | 'pending' | 'failed';
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  read: boolean;
  created_at: string;
}

export interface SystemStatusResponse {
  status: string;
  phase: string;
  credentials: {
    veripine: { configured: boolean; keyMasked: string };
    sureverify: { configured: boolean; keyMasked: string };
    ulamaData: { configured: boolean; keyMasked: string };
    vtpass: { configured: boolean; apiKeyMasked: string; publicKeyMasked: string; secretKeyMasked: string };
    flutterwave: { configured: boolean; clientIdMasked: string; secretKeyMasked: string; encryptionKeyConfigured: boolean };
    smtpMail: { configured: boolean; host: string; port: number; user: string; supportEmail: string; webmailUrl: string };
    cpanel: { serverName: string; serverIp: string; sftpHost: string; sftpPort: number; sftpUser: string; sftpPassConfigured: boolean; nameservers: string[] };
  };
  stats: {
    totalUsers: number;
    totalTransactions: number;
    totalVerifications: number;
    totalOrders: number;
    activeSettings: any;
  };
  timestamp: string;
}

export interface PhaseInfo {
  number: string;
  title: string;
  description: string;
  status: 'completed' | 'in_progress' | 'pending';
  deliverables: string[];
}
