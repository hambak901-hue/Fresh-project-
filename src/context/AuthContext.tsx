/**
 * @file AuthContext.tsx
 * Authentication context for session persistence and reactive user state.
 * Strictly enforces token-based security with zero bypass or unauthenticated role elevation.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, getStoredToken, clearStoredToken } from '../lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  token: string | null;
  login: (email: string, pass: string) => Promise<User | null>;
  register: (data: Record<string, any>) => Promise<User | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateBalance: (balance: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [token, setToken] = useState<string | null>(getStoredToken());

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      if (res.success && res.user) {
        setUser(res.user);
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
      if (res.user) {
        setUser(res.user);
        setToken(res.token);
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
        setToken(res.token);
        return res.user;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setToken(null);
  };

  const updateBalance = (balance: number) => {
    setUser(prev => (prev ? { ...prev, wallet_balance: balance } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        token,
        login,
        register,
        logout,
        refreshUser,
        updateBalance,
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
