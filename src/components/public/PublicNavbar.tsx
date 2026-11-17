/**
 * @file PublicNavbar.tsx
 * Dual Light/Night responsive navigation bar with single-element brand + logo,
 * dynamic CMS navigation links, ThemeToggle, and auth/portal controls.
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../ThemeToggle';
import { Menu, X, Settings, LogOut, Wallet, Shield, ShieldCheck } from 'lucide-react';

interface PublicNavbarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenCmsStudio: () => void;
  onSwitchToCustomerDashboard?: () => void;
  onSwitchToAdminDashboard?: () => void;
  onOpenWalletModal?: () => void;
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  activePage,
  onNavigate,
  onOpenAuth,
  onOpenCmsStudio,
  onSwitchToCustomerDashboard,
  onSwitchToAdminDashboard,
  onOpenWalletModal,
}) => {
  const { branding, navigation, cmsSections } = useCms();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);

  const visibleNav = (navigation || []).filter((item) => {
    if (!item.enabled) return false;
    if (cmsSections?.pageVisibility) {
      const pageKey = item.pageKey as keyof typeof cmsSections.pageVisibility;
      if (pageKey in cmsSections.pageVisibility) {
        return (cmsSections.pageVisibility as any)[pageKey] !== false;
      }
    }
    return true;
  });

  const brandName = branding?.short_brand_name || 'HAMBAKTECH';
  const logoSrc = branding?.logo_url || '/logo.png';

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* ZONE 1: Brand Wordmark + Official Logo */}
          <button
            type="button"
            onClick={() => {
              onNavigate('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-left text-base sm:text-lg font-extrabold tracking-tight text-blue-900 dark:text-white whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity flex items-center gap-2.5"
          >
            <img
              src={logoSrc}
              alt={branding?.company_name || 'HAMBAK TECH & SERVICES'}
              className="h-8 w-auto object-contain rounded"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span>{brandName}</span>
          </button>

          {/* ZONE 2: Single-line Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold">
            {visibleNav.map((item) => {
              const isActive = activePage === item.pageKey;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.pageKey);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`whitespace-nowrap shrink-0 transition-colors py-1 ${
                    isActive
                      ? 'text-blue-700 dark:text-blue-400 font-bold border-b-2 border-blue-700 dark:border-blue-400'
                      : 'text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* ZONE 3: Theme Toggle, Auth & Quick Portal Switch */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle compact />

            {user && (
              <>
                {(user.role === 'admin' || user.role === 'superadmin') && onSwitchToAdminDashboard && (
                  <button
                    type="button"
                    onClick={onSwitchToAdminDashboard}
                    title="Open Super Admin Console"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 border border-amber-300 dark:border-amber-500/30 text-xs font-semibold text-amber-800 dark:text-amber-300 transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Admin</span>
                  </button>
                )}

                {onSwitchToCustomerDashboard && (
                  <button
                    type="button"
                    onClick={onSwitchToCustomerDashboard}
                    title="Open Customer Portal"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-xs font-semibold text-white shadow-sm transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-white" />
                    <span className="hidden sm:inline">My Dashboard</span>
                    <span className="sm:hidden">Portal</span>
                  </button>
                )}
              </>
            )}

            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdown(!userDropdown)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 text-xs text-slate-900 dark:text-white"
                >
                  <div className="w-5 h-5 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold text-[10px]">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold hidden sm:inline max-w-[100px] truncate">
                    {user.full_name}
                  </span>
                </button>

                {userDropdown && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {user.full_name}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {user.email}
                      </div>
                      <div className="mt-1 text-[10px] font-mono capitalize text-blue-700 dark:text-blue-400 font-semibold">
                        {user.role} &bull; Tier {user.tier}
                      </div>
                    </div>
                    {(user.role === 'admin' || user.role === 'superadmin') && onSwitchToAdminDashboard && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdown(false);
                          onSwitchToAdminDashboard();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-amber-700 dark:text-amber-300 font-semibold"
                      >
                        <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Super Admin Console</span>
                      </button>
                    )}
                    {onSwitchToCustomerDashboard && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdown(false);
                          onSwitchToCustomerDashboard();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-blue-700 dark:text-blue-300 font-semibold"
                      >
                        <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>Customer Portal</span>
                      </button>
                    )}
                    {onOpenWalletModal && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdown(false);
                          onOpenWalletModal();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-slate-700 dark:text-slate-200"
                      >
                        <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>Wallet (₦{user.wallet_balance.toLocaleString()})</span>
                      </button>
                    )}
                    {(user.role === 'admin' || user.role === 'superadmin') && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdown(false);
                          onOpenCmsStudio();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-slate-700 dark:text-slate-200"
                      >
                        <Settings className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        <span>CMS Studio</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdown(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left text-rose-600 dark:text-rose-400 mt-1 border-t border-slate-100 dark:border-slate-800 pt-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-600 rounded-xl transition-all shadow-sm whitespace-nowrap shrink-0"
                >
                  Register
                </button>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 pt-3 pb-6 space-y-3">
          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const isActive = activePage === item.pageKey;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.pageKey);
                    setMobileMenuOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {user && (user.role === 'admin' || user.role === 'superadmin') && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCmsStudio();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <Settings className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Admin CMS Studio</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
