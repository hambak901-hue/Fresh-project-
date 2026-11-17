/**
 * @file Navbar.tsx
 * Top navigation bar with HambakTech branding, live server status, wallet glance, and role switcher.
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCms } from '../context/CmsContext';
import { ThemeToggle } from './ThemeToggle';
import { Wallet, LogOut, ChevronDown } from 'lucide-react';

interface NavbarProps {
  onOpenWalletModal?: () => void;
  serverOnline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenWalletModal, serverOnline }) => {
  const { user, logout } = useAuth();
  const { branding } = useCms();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img
              src={branding?.logo_url || '/logo.png'}
              alt={companyName}
              className="h-8 w-auto object-contain rounded"
              onError={e => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-blue-900 dark:text-white">
                  {companyName}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                {branding?.tagline || 'Where Technology Meets Services'}
              </p>
            </div>
          </div>

          {/* Center: System Status */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${serverOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${serverOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-blue-700 dark:text-emerald-400 font-semibold text-[11px]">
              {serverOnline ? 'Connected' : 'Connecting'}
            </span>
          </div>

          {/* Right Side: Theme Toggle, Wallet & Profile */}
          <div className="flex items-center gap-3">
            <ThemeToggle compact />

            {/* Wallet Balance Pill */}
            {user && (
              <button
                type="button"
                onClick={onOpenWalletModal}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white transition-all"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-[10px] text-slate-400 font-normal leading-none">Wallet</div>
                  <div className="text-emerald-400 font-mono font-bold leading-tight">
                    ₦{user.wallet_balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </button>
            )}

            {/* Role Switcher Pill */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 transition-all"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    user?.role === 'superadmin' ? 'bg-purple-400' : user?.role === 'admin' ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                />
                <span className="capitalize font-semibold">{user?.role || 'Guest'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95">
                  <div className="px-3 py-2 border-b border-slate-800">
                    <p className="font-semibold text-white">{user?.full_name}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{user?.email}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                        Tier {user?.tier || 1} Verified
                      </span>
                    </div>
                  </div>

                  <div className="p-1 border-t border-slate-800">
                    <button
                      onClick={() => {
                        logout();
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-rose-400 hover:bg-rose-950/30"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
