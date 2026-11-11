/**
 * @file PublicNavbar.tsx
 * Professional public navigation adhering strictly to Frontend Design Top Bar Contract:
 * Zone 1: Single-element brand wordmark
 * Zone 2: Single-line text navigation links
 * Zone 3: Primary action / Auth & CMS entry points
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { useAuth } from '../../context/AuthContext';
import { Menu, X, Settings, UserCircle, LogOut, Wallet, Shield, ShieldCheck, Layers } from 'lucide-react';

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

  // Filter navigation items that are active in CMS and page visibility
  const visibleNav = (navigation || []).filter(item => {
    if (!item.enabled) return false;
    if (cmsSections?.pageVisibility) {
      const pageKey = item.pageKey as keyof typeof cmsSections.pageVisibility;
      if (pageKey in cmsSections.pageVisibility) {
        return (cmsSections.pageVisibility as any)[pageKey] !== false;
      }
    }
    return true;
  });

  const companyName = branding?.company_name || 'HambakTech Enterprise';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* ZONE 1: Brand Wordmark (Single text element as required by Top Bar Contract) */}
          <button
            onClick={() => {
              onNavigate('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-left text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            {branding?.logo_url ? (
              <img
                src={branding.logo_url}
                alt={companyName}
                className="h-7 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : null}
            <span>{companyName}</span>
          </button>

          {/* ZONE 2: Navigation Links (Single-line text navigation links) */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
            {visibleNav.map(item => {
              const isActive = activePage === item.pageKey;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.pageKey);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`whitespace-nowrap shrink-0 transition-colors py-1 ${
                    isActive
                      ? 'text-emerald-400 font-bold border-b-2 border-emerald-400'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* ZONE 3: Action Controls */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Authenticated Quick Actions */}
            {user && (
              <>
                {(user.role === 'admin' || user.role === 'superadmin') && onSwitchToAdminDashboard && (
                  <button
                    onClick={onSwitchToAdminDashboard}
                    title="Launch Super Admin Console"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-semibold text-amber-300 transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>Admin Console</span>
                  </button>
                )}

                {onSwitchToCustomerDashboard && (
                  <button
                    onClick={onSwitchToCustomerDashboard}
                    title="Launch Customer Portal"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-white" />
                    <span className="hidden sm:inline">My Dashboard</span>
                    <span className="sm:hidden">Dashboard</span>
                  </button>
                )}
              </>
            )}

            {/* Auth States */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdown(!userDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-white"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                    {user.full_name.charAt(0)}
                  </div>
                  <span className="font-semibold hidden sm:inline max-w-[100px] truncate">{user.full_name}</span>
                </button>

                {userDropdown && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-slate-800 mb-1">
                      <div className="font-bold text-white truncate">{user.full_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{user.email}</div>
                      <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono capitalize">
                        {user.role} &bull; Tier {user.tier}
                      </div>
                    </div>
                    {onSwitchToAdminDashboard && (
                      <button
                        onClick={() => {
                          setUserDropdown(false);
                          onSwitchToAdminDashboard();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-amber-300 font-semibold"
                      >
                        <Shield className="w-4 h-4 text-amber-400" />
                        <span>Super Admin Console</span>
                      </button>
                    )}
                    {onSwitchToCustomerDashboard && (
                      <button
                        onClick={() => {
                          setUserDropdown(false);
                          onSwitchToCustomerDashboard();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-indigo-300 font-semibold"
                      >
                        <Shield className="w-4 h-4 text-indigo-400" />
                        <span>Customer Portal</span>
                      </button>
                    )}
                    {onOpenWalletModal && (
                      <button
                        onClick={() => {
                          setUserDropdown(false);
                          onOpenWalletModal();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200"
                      >
                        <Wallet className="w-4 h-4 text-emerald-400" />
                        <span>Wallet (₦{user.wallet_balance.toLocaleString()})</span>
                      </button>
                    )}
                    <button
                      onClick={onOpenCmsStudio}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200"
                    >
                      <Settings className="w-4 h-4 text-sky-400" />
                      <span>CMS Studio</span>
                    </button>
                    <button
                      onClick={() => {
                        setUserDropdown(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-rose-950/30 text-left text-rose-400 mt-1 border-t border-slate-800 pt-2"
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
                  onClick={() => onOpenAuth('login')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-md shadow-emerald-500/20 whitespace-nowrap shrink-0"
                >
                  Register
                </button>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 pt-3 pb-6 space-y-3">
          <nav className="space-y-1">
            {visibleNav.map(item => {
              const isActive = activePage === item.pageKey;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.pageKey);
                    setMobileMenuOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {user && (user.role === 'admin' || user.role === 'superadmin') && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCmsStudio();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-200"
              >
                <Settings className="w-4 h-4 text-emerald-400" />
                <span>Admin CMS Studio</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
