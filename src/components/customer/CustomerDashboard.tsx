/**
 * @file CustomerDashboard.tsx
 * Phase 3 Complete Customer Dashboard shell.
 * Implements 14 functional pages with responsive sidebar, live metrics,
 * quick wallet funding, unread notification counter, and seamless app switches.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { ThemeToggle } from '../ThemeToggle';
import { getInitialsAvatar } from '../../lib/avatar';
import {
  LayoutDashboard,
  ShieldCheck,
  Smartphone,
  Wallet,
  ShoppingBag,
  Zap,
  GraduationCap,
  BarChart3,
  Receipt,
  Package,
  Bell,
  Inbox,
  User as UserIcon,
  Settings,
  HelpCircle,
  Menu,
  X,
  Plus,
  ArrowUpRight,
  ExternalLink,
  LogOut,
  ChevronRight,
  Sparkles,
  Layers,
} from 'lucide-react';
import { User } from '../../types';

// Child components
import { DashboardOverview } from './DashboardOverview';
import { NinServicesPage } from './NinServicesPage';
import { TelecomPage } from './TelecomPage';
import { WalletPage } from './WalletPage';
import { DigitalServicesPage } from './DigitalServicesPage';
import { StoreComingSoonPage } from './StoreComingSoonPage';
import { AcademyComingSoonPage } from './AcademyComingSoonPage';
import { ReportsComingSoonPage } from './ReportsComingSoonPage';
import { TransactionsPage } from './TransactionsPage';
import { OrdersPage } from './OrdersPage';
import { NotificationsPage } from './NotificationsPage';
import { MessagesPage } from './MessagesPage';
import { ProfilePage } from './ProfilePage';
import { SettingsPage } from './SettingsPage';
import { SupportPage } from './SupportPage';
import { CustomerKycPage } from './CustomerKycPage';

interface CustomerDashboardProps {
  onOpenFundModal: () => void;
  onSwitchToPublic: () => void;
  onSwitchToPhaseConsole?: () => void;
  onSwitchToAdmin?: () => void;
  onLogout?: () => void;
}

export type CustomerPageKey =
  | 'overview'
  | 'nin'
  | 'telecom'
  | 'wallet'
  | 'store'
  | 'digital'
  | 'academy'
  | 'reports'
  | 'transactions'
  | 'orders'
  | 'notifications'
  | 'messages'
  | 'kyc'
  | 'profile'
  | 'settings'
  | 'support';

interface NavItem {
  id: CustomerPageKey;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
  isComingSoon?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function CustomerDashboard({
  onOpenFundModal,
  onSwitchToPublic,
  onSwitchToAdmin,
  onLogout,
}: CustomerDashboardProps) {
  const { user, logout, refreshUser } = useAuth();
  const { branding } = useCms();
  const [currentPage, setCurrentPage] = useState<CustomerPageKey>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const handleSignOut = () => {
    if (onLogout) {
      onLogout();
    } else {
      logout();
      if (typeof window !== 'undefined') {
        window.location.hash = '#login';
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center space-y-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Your session has ended. Please sign in to continue.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
        >
          Go to Customer Login
        </button>
      </div>
    );
  }

  const navSections: NavSection[] = [
    {
      title: 'Main Services',
      items: [
        { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard },
        { id: 'nin', label: 'NIN & Identity Services', icon: ShieldCheck, badge: 'Official' },
        { id: 'telecom', label: 'Telecom & VTU Services', icon: Smartphone },
        { id: 'wallet', label: 'My Wallet', icon: Wallet },
      ],
    },
    {
      title: 'Digital Utilities',
      items: [
        { id: 'store', label: 'HambakTech Store', icon: ShoppingBag, isComingSoon: true },
        { id: 'digital', label: 'Digital Services', icon: Zap },
        { id: 'academy', label: 'HambakTech Academy', icon: GraduationCap, badge: 'Enroll' },
        { id: 'reports', label: 'Reports & Audits', icon: BarChart3, isComingSoon: true },
      ],
    },
    {
      title: 'History & Audits',
      items: [
        { id: 'transactions', label: 'Transactions', icon: Receipt },
        { id: 'orders', label: 'Order History', icon: Package },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'messages', label: 'Delivered Messages', icon: Inbox },
      ],
    },
    {
      title: 'Account & Security',
      items: [
        { id: 'kyc', label: 'Identity & KYC', icon: ShieldCheck, badge: user.kyc_status === 'verified' ? 'Verified' : 'Required' },
        { id: 'profile', label: 'My Profile', icon: UserIcon },
        { id: 'settings', label: 'Security & PIN', icon: Settings },
        { id: 'support', label: 'Help & Support Desk', icon: HelpCircle },
      ],
    },
  ];

  const handleUpdateUser = (updated: User) => {
    refreshUser();
  };

  const handleSelectPage = (id: CustomerPageKey) => {
    setCurrentPage(id);
    setMobileMenuOpen(false);
  };

  // Resolve current active title
  let currentTitle = 'Dashboard Overview';
  for (const sec of navSections) {
    const item = sec.items.find(i => i.id === currentPage);
    if (item) {
      currentTitle = item.label;
      break;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Header */}
        <div className="flex flex-col h-full">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={branding?.logo_url || '/logo.png'}
                alt={branding?.short_brand_name || 'HAMBAKTECH'}
                className="w-9 h-9 rounded-xl object-contain bg-blue-50 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-700"
              />
              <div>
                <span className="font-extrabold text-sm text-blue-900 dark:text-white tracking-tight flex items-center gap-1.5">
                  <span>{branding?.short_brand_name || 'HAMBAKTECH'}</span>
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Customer Dashboard</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Wallet Summary Card */}
          <div className="p-4 mx-3 my-3 bg-blue-50/70 dark:bg-slate-950/80 border border-blue-200 dark:border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Wallet Balance</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold">
                Tier {user.tier}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="text-xl font-extrabold font-mono text-blue-800 dark:text-emerald-400 tabular-nums">
                ₦{user.wallet_balance.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={onOpenFundModal}
                className="px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Fund</span>
              </button>
            </div>
          </div>

          {/* Nav List */}
          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
            {navSections.map(section => (
              <div key={section.title} className="space-y-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectPage(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                          isActive
                            ? 'bg-blue-700 text-white font-semibold shadow-md shadow-blue-700/20'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.isComingSoon && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            Soon
                          </span>
                        )}
                        {item.badge && !item.isComingSoon && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom navigation links */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50 dark:bg-slate-900/60">
            {/* Switch to Super Admin Dashboard - Only for admins */}
            {onSwitchToAdmin && (user.role === 'admin' || user.role === 'superadmin') && (
              <button
                type="button"
                onClick={onSwitchToAdmin}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-amber-300 dark:border-amber-500/20 transition"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Super Admin Console</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-500" />
              </button>
            )}

            {/* Switch to Public Website */}
            <button
              type="button"
              onClick={onSwitchToPublic}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Back to Main Website</span>
              </div>
              <ChevronRight className="w-3 h-3 text-slate-500" />
            </button>

            {/* User Info & Logout */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5 truncate">
                <img
                  src={user.avatar_url || getInitialsAvatar(user.full_name)}
                  alt={user.full_name}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                />
                <div className="truncate text-left">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user.full_name}</p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-1.5 text-slate-500 hover:text-red-500 rounded-lg transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl bg-slate-100 dark:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono hidden sm:block">Customer Portal / {currentTitle}</p>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">{currentTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle compact />

            {/* Quick Balance Header Pill */}
            <div
              onClick={() => setCurrentPage('wallet')}
              className="cursor-pointer bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-blue-400 rounded-xl px-3 py-1.5 hidden sm:flex items-center gap-2 transition"
            >
              <Wallet className="w-3.5 h-3.5 text-blue-700 dark:text-emerald-400" />
              <span className="text-xs font-mono font-bold text-blue-800 dark:text-emerald-400 tabular-nums">
                ₦{user.wallet_balance.toLocaleString()}
              </span>
            </div>

            {/* Notifications Shortcut */}
            <button
              type="button"
              onClick={() => setCurrentPage('notifications')}
              className="p-2 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl relative transition"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>

            {/* Quick Public Link */}
            <button
              type="button"
              onClick={onSwitchToPublic}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl hidden md:flex items-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Public Site</span>
            </button>
          </div>
        </header>

        {/* Page View Container */}
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {currentPage === 'overview' && (
            <DashboardOverview
              onNavigateToPage={page => setCurrentPage(page as CustomerPageKey)}
              onOpenFundModal={onOpenFundModal}
            />
          )}

          {currentPage === 'nin' && <NinServicesPage />}

          {currentPage === 'telecom' && <TelecomPage />}

          {currentPage === 'wallet' && (
            <WalletPage onOpenFundModal={onOpenFundModal} />
          )}

          {currentPage === 'store' && <StoreComingSoonPage />}

          {currentPage === 'digital' && (
            <DigitalServicesPage
              user={user}
              onRefreshBalance={refreshUser}
            />
          )}

          {currentPage === 'academy' && <AcademyComingSoonPage />}

          {currentPage === 'reports' && <ReportsComingSoonPage />}

          {currentPage === 'transactions' && <TransactionsPage />}

          {currentPage === 'orders' && <OrdersPage />}

          {currentPage === 'notifications' && <NotificationsPage />}

          {currentPage === 'messages' && <MessagesPage />}

          {currentPage === 'kyc' && (
            <CustomerKycPage
              user={user}
              onRefreshUser={refreshUser}
            />
          )}

          {currentPage === 'profile' && (
            <ProfilePage
              user={user}
              onUpdateUser={handleUpdateUser}
            />
          )}

          {currentPage === 'settings' && (
            <SettingsPage
              user={user}
              onUpdateUser={handleUpdateUser}
            />
          )}

          {currentPage === 'support' && <SupportPage user={user} />}
        </main>
      </div>
    </div>
  );
}
