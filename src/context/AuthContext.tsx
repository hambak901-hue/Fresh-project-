/**
 * @file AuthContext.tsx
 * Authentication context for session persistence and reactive user state.
 * Strictly enforces token-based security with zero bypass or unauthenticated role elevation.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { MfaChallengeResponse, PinPolicy, User } from '../types';
import { api, getStoredToken, clearStoredToken } from '../lib/api';

export const DEFAULT_PIN_POLICY: PinPolicy = {
  enforce_transaction_pin: true,
  require_pin_activation_for_all_customers: true,
  pin_length: 4,
  allow_weak_pins: false,
  pin_max_attempts: 5,
  pin_lockout_minutes: 15,
  otp_reset_expiry_minutes: 15,
  protected_categories: {
    nin_verification: true,
    bvn_verification: true,
    nin_modification: true,
    bvn_modification: true,
    nin_enrolment: true,
    identity_verification: true,
    identity_modification: true,
    identity_enrolment: true,
    telecom_data: true,
    telecom_airtime: true,
    telecom_pins: true,
    telecom_swap: true,
    telecom_bills: true,
    telecom_bulksms: true,
    telecom_sms: true,
    wallet_transfer: true,
    referral_wallet_conversion: true,
    referral_withdrawal: true,
  },
};

export class MfaChallengeRequiredError extends Error {
  challenge: MfaChallengeResponse;

  constructor(challenge: MfaChallengeResponse, message = 'Multi-factor authentication verification required.') {
    super(message);
    this.name = 'MfaChallengeRequiredError';
    this.challenge = challenge;
  }
}

export interface VerificationDispatchState {
  sent: boolean;
  expires_in_minutes?: number;
  cooldown_seconds?: number;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  token: string | null;
  pinPolicy: PinPolicy;
  lastVerificationDispatch: VerificationDispatchState | null;
  clearVerificationDispatch: () => void;
  login: (email: string, pass: string) => Promise<User | null>;
  completeMfaLogin: (challengeToken: string, code: string) => Promise<User | null>;
  register: (data: Record<string, any>) => Promise<User | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshDashboardConfig: () => Promise<void>;
  refreshPinPolicy: () => Promise<void>;
  updateBalance: (balance: number) => void;
  openPinSetupModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mergeUserConfig(user?: User | null, dashboardConfig?: import('../types').RoleDashboardConfig | null): User | null {
  if (!user) return null;
  if (dashboardConfig) {
    return { ...user, dashboard_config: dashboardConfig };
  }
  return user;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [pinPolicy, setPinPolicy] = useState<PinPolicy>(DEFAULT_PIN_POLICY);
  const [lastVerificationDispatch, setLastVerificationDispatch] = useState<VerificationDispatchState | null>(null);

  const clearVerificationDispatch = () => setLastVerificationDispatch(null);

  const applyPinPolicy = (incoming?: PinPolicy | null) => {
    if (incoming && typeof incoming === 'object') {
      setPinPolicy({
        ...DEFAULT_PIN_POLICY,
        ...incoming,
        protected_categories: {
          ...DEFAULT_PIN_POLICY.protected_categories,
          ...(incoming.protected_categories || {}),
        },
      });
    }
  };

  const refreshPinPolicy = async () => {
    try {
      const res = await api.getPinPolicy();
      if (res.success && res.pin_policy) {
        applyPinPolicy(res.pin_policy);
      }
    } catch {
      // Keep safe defaults if public/session policy cannot be loaded
    }
  };

  const refreshDashboardConfig = async () => {
    try {
      const res = await api.getMyDashboardConfig();
      if (res.success && res.config) {
        setUser(prev =>
          prev
            ? {
                ...prev,
                assigned_dashboard: res.assigned_dashboard || prev.assigned_dashboard,
                dashboard_config: res.config,
              }
            : prev
        );
      }
    } catch {
      // Non-fatal fallback
    }
  };

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      if (res.success && res.user) {
        setUser(mergeUserConfig(res.user, res.dashboard_config));
        setToken(getStoredToken());
        applyPinPolicy(res.pin_policy);
        if (res.user.email_verified) {
          setLastVerificationDispatch(null);
        }
      } else {
        setUser(null);
        setToken(null);
        clearStoredToken();
      }
    } catch {
      // If token expired or invalid, clear session cleanly. Never elevate privileges.
      setUser(null);
      setToken(null);
      clearStoredToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getStoredToken()) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    try {
      const res = await api.login(email, pass);
      if (res.mfa_required && res.challenge) {
        throw new MfaChallengeRequiredError(res.challenge);
      }
      if (res.user) {
        const merged = mergeUserConfig(res.user, res.dashboard_config);
        setUser(merged);
        setToken(res.token || getStoredToken());
        applyPinPolicy(res.pin_policy);
        return merged;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const completeMfaLogin = async (challengeToken: string, code: string): Promise<User | null> => {
    setLoading(true);
    try {
      const res = await api.verifyMfaChallenge(challengeToken, code);
      if (res.user) {
        const merged = mergeUserConfig(res.user, res.dashboard_config);
        setUser(merged);
        setToken(res.token || getStoredToken());
        applyPinPolicy(res.pin_policy);
        return merged;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: Record<string, any>): Promise<User | null> => {
    setLoading(true);
    try {
      const res = await api.register(data as any);
      if (res.email_verification_required) {
        setLastVerificationDispatch({
          sent: Boolean(res.verification_sent),
          expires_in_minutes: res.verification_expires_in_minutes,
          cooldown_seconds: res.cooldown_seconds,
          message: res.message,
        });
      } else {
        setLastVerificationDispatch(null);
      }
      if (res.user) {
        const merged = mergeUserConfig(res.user, res.dashboard_config);
        setUser(merged);
        setToken(res.token || getStoredToken());
        applyPinPolicy(res.pin_policy);
        return merged;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    setLastVerificationDispatch(null);
    await api.logout();
  };

  const updateBalance = (balance: number) => {
    setUser(prev => (prev ? { ...prev, wallet_balance: balance } : prev));
  };

  const openPinSetupModal = () => {
    window.dispatchEvent(new CustomEvent('hambak:pin-setup-required'));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        token,
        pinPolicy,
        lastVerificationDispatch,
        clearVerificationDispatch,
        login,
        completeMfaLogin,
        register,
        logout,
        refreshUser,
        refreshDashboardConfig,
        refreshPinPolicy,
        updateBalance,
        openPinSetupModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
