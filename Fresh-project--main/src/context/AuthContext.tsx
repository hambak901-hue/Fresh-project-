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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  token: string | null;
  pinPolicy: PinPolicy;
  login: (email: string, pass: string) => Promise<User | null>;
  completeMfaLogin: (challengeToken: string, code: string) => Promise<User | null>;
  register: (data: Record<string, any>) => Promise<User | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshPinPolicy: () => Promise<void>;
  updateBalance: (balance: number) => void;
  openPinSetupModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [pinPolicy, setPinPolicy] = useState<PinPolicy>(DEFAULT_PIN_POLICY);

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

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      if (res.success && res.user) {
        setUser(res.user);
        setToken(getStoredToken());
        applyPinPolicy(res.pin_policy);
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
        setUser(res.user);
        setToken(res.token || getStoredToken());
        applyPinPolicy(res.pin_policy);
        return res.user;
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
        setUser(res.user);
        setToken(res.token || getStoredToken());
        applyPinPolicy(res.pin_policy);
        return res.user;
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
      if (res.user) {
        setUser(res.user);
        setToken(res.token || getStoredToken());
        applyPinPolicy(res.pin_policy);
        return res.user;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
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
        login,
        completeMfaLogin,
        register,
        logout,
        refreshUser,
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
