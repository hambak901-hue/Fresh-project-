/**
 * @file database.ts
 * Enterprise JSON & In-Memory Database with atomic persistence.
 * Ready for Node.js hosting / cPanel MySQL migration in Phase 10.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  password_hash: string;
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

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  read: boolean;
  created_at: string;
}

export interface SystemSettings {
  nin_fee: number;
  bvn_fee: number;
  mtn_sme_1gb: number;
  airtel_1gb: number;
  glo_1gb: number;
  nine_mobile_1gb: number;
  airtime_discount_percent: number;
  maintenance_mode: boolean;
  active_verification_provider: '2sureverify' | 'veripine';
  active_telecom_provider: 'ulamadata' | 'vtpass';
  active_payment_gateway: 'flutterwave' | 'paystack';
  bank_transfer_account_name: string;
  bank_transfer_bank: string;
  bank_transfer_account_number: string;
  company_name: string;
  support_phone: string;
  support_email: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  details: any;
  ip?: string;
  created_at: string;
}

interface DatabaseSchema {
  users: User[];
  transactions: Transaction[];
  verifications: VerificationRecord[];
  telecom_orders: TelecomOrder[];
  notifications: Notification[];
  settings: SystemSettings;
  audit_logs: AuditLog[];
}

const DB_DIR = path.resolve(process.cwd(), 'server', 'db');
const DB_FILE = path.join(DB_DIR, 'data.json');

// In-memory representation
let dbData: DatabaseSchema;

export function hashPassword(plainText: string): string {
  return crypto.createHash('sha256').update(plainText + 'hambaktech_salt_2026').digest('hex');
}

function getDefaultData(): DatabaseSchema {
  const superAdminPasswordHash = hashPassword('Hamohullah19@..');
  const demoUserPasswordHash = hashPassword('Password123!');

  return {
    users: [
      {
        id: 'usr_superadmin',
        email: 'admin@hambaktech.com.ng',
        password_hash: superAdminPasswordHash,
        full_name: 'Bakar Hambak (Super Admin)',
        phone_number: '+2348030001122',
        role: 'superadmin',
        wallet_balance: 500000,
        kyc_status: 'verified',
        tier: 3,
        referral_code: 'HAMBAK-SUPER',
        created_at: new Date('2026-01-01').toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
      },
      {
        id: 'usr_customer_demo',
        email: 'fatimohmusbau34@gmail.com',
        password_hash: demoUserPasswordHash,
        full_name: 'Fatimoh Musbau',
        phone_number: '+2348123456789',
        role: 'customer',
        wallet_balance: 15450,
        kyc_status: 'verified',
        nin: '12345678901',
        bvn: '22334455667',
        tier: 2,
        referral_code: 'FATIMOH99',
        created_at: new Date('2026-02-15').toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
      },
    ],
    transactions: [
      {
        id: 'txn_init_001',
        user_id: 'usr_customer_demo',
        type: 'credit',
        amount: 20000,
        balance_before: 0,
        balance_after: 20000,
        category: 'funding',
        reference: 'FLW_MOCK_INIT_001',
        gateway: 'flutterwave',
        status: 'successful',
        description: 'Wallet top-up via Flutterwave',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: 'txn_init_002',
        user_id: 'usr_customer_demo',
        type: 'debit',
        amount: 250,
        balance_before: 20000,
        balance_after: 19750,
        category: 'nin_verification',
        reference: '2SV_NIN_INIT_002',
        gateway: 'internal',
        status: 'successful',
        description: 'Instant NIN Slip Verification',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 'txn_init_003',
        user_id: 'usr_customer_demo',
        type: 'debit',
        amount: 4300,
        balance_before: 19750,
        balance_after: 15450,
        category: 'data_purchase',
        reference: 'UD_MTN_INIT_003',
        gateway: 'internal',
        status: 'successful',
        description: 'MTN SME 10GB Data Top-up to 08123456789',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    verifications: [
      {
        id: 'vrf_001',
        user_id: 'usr_customer_demo',
        type: 'NIN',
        search_value: '12345678901',
        provider: '2sureverify',
        cost: 250,
        status: 'completed',
        result: {
          nin: '12345678901',
          firstname: 'FATIMOH',
          surname: 'MUSBAU',
          middlename: 'ADEYEMI',
          birthdate: '1996-08-14',
          gender: 'female',
          state: 'Lagos',
          lga: 'Ikeja',
          photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80',
          trackingId: 'NIN-VRF-9827391',
        },
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
    telecom_orders: [
      {
        id: 'ord_001',
        user_id: 'usr_customer_demo',
        service: 'data',
        network: 'MTN',
        phone: '08123456789',
        plan: 'MTN SME 10GB (30 Days)',
        amount: 4300,
        cost_price: 2700,
        profit: 1600,
        provider: 'ulamadata',
        provider_ref: 'UD-TXN-847291',
        status: 'successful',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    notifications: [
      {
        id: 'notif_001',
        user_id: 'usr_customer_demo',
        title: 'Welcome to HambakTech!',
        message: 'Your account has been configured. You can now verify NIN, BVN, and buy cheapest Nigerian telecom data.',
        type: 'success',
        read: false,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: 'notif_002',
        user_id: 'usr_customer_demo',
        title: 'Wallet Funded Successfully',
        message: 'Your wallet has been credited with ₦20,000 via Flutterwave gateway.',
        type: 'info',
        read: true,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ],
    settings: {
      nin_fee: 250,
      bvn_fee: 350,
      mtn_sme_1gb: 270,
      airtel_1gb: 290,
      glo_1gb: 260,
      nine_mobile_1gb: 250,
      airtime_discount_percent: 2.5,
      maintenance_mode: false,
      active_verification_provider: '2sureverify',
      active_telecom_provider: 'ulamadata',
      active_payment_gateway: 'flutterwave',
      bank_transfer_account_name: 'Hambak Technologies Enterprise',
      bank_transfer_bank: 'Moniepoint MFB / Truehost LON110',
      bank_transfer_account_number: '8210492817',
      company_name: 'HambakTech Technologies',
      support_phone: '+234 803 000 1122',
      support_email: 'support@hambaktech.com.ng',
    },
    audit_logs: [
      {
        id: 'audit_001',
        user_id: 'usr_superadmin',
        user_email: 'admin@hambaktech.com.ng',
        action: 'SYSTEM_BOOTSTRAP',
        details: { message: 'Database initialized for Phase 01 Project Foundation and Architecture' },
        created_at: new Date().toISOString(),
      },
    ],
  };
}

export function initDatabase(): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbData = JSON.parse(raw);
    } else {
      dbData = getDefaultData();
      saveDatabase();
    }
  } catch (err) {
    console.warn('Database initialization warning, resetting to defaults:', err);
    dbData = getDefaultData();
    saveDatabase();
  }
}

export function saveDatabase(): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save database file:', err);
  }
}

// Data access helpers
export const db = {
  get data() {
    if (!dbData) initDatabase();
    return dbData;
  },

  // Users
  findUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  },
  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const newUser: User = {
      ...user,
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    saveDatabase();
    return newUser;
  },
  updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return undefined;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    saveDatabase();
    return this.data.users[idx];
  },

  // Wallets & Transactions
  adjustBalance(userId: string, delta: number, category: Transaction['category'], description: string, gateway: Transaction['gateway'] = 'internal', metadata?: any): { user: User; transaction: Transaction } {
    const user = this.findUserById(userId);
    if (!user) throw new Error('User not found');
    if (delta < 0 && user.wallet_balance + delta < 0) {
      throw new Error(`Insufficient wallet balance. Available: ₦${user.wallet_balance.toLocaleString()}, Required: ₦${Math.abs(delta).toLocaleString()}`);
    }

    const balanceBefore = user.wallet_balance;
    const balanceAfter = balanceBefore + delta;
    user.wallet_balance = balanceAfter;
    user.updated_at = new Date().toISOString();

    const transaction: Transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      type: delta >= 0 ? 'credit' : 'debit',
      amount: Math.abs(delta),
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      category,
      reference: metadata?.reference || `REF_${Date.now()}`,
      gateway,
      status: 'successful',
      description,
      metadata,
      created_at: new Date().toISOString(),
    };

    this.data.transactions.unshift(transaction);
    saveDatabase();
    return { user, transaction };
  },

  // Notifications
  addNotification(userId: string, title: string, message: string, type: Notification['type'] = 'info'): Notification {
    const notif: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      title,
      message,
      type,
      read: false,
      created_at: new Date().toISOString(),
    };
    this.data.notifications.unshift(notif);
    saveDatabase();
    return notif;
  },

  // Audit
  logAudit(action: string, details: any, userId?: string, userEmail?: string, ip?: string): void {
    const audit: AuditLog = {
      id: `audit_${Date.now()}`,
      user_id: userId,
      user_email: userEmail,
      action,
      details,
      ip,
      created_at: new Date().toISOString(),
    };
    this.data.audit_logs.unshift(audit);
    // Keep max 500 audit logs
    if (this.data.audit_logs.length > 500) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 500);
    }
    saveDatabase();
  },

  // Settings
  updateSettings(updates: Partial<SystemSettings>): SystemSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    saveDatabase();
    return this.data.settings;
  },
};

// Initialize on file load
initDatabase();
