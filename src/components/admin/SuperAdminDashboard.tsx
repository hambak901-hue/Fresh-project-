/**
 * @file SuperAdminDashboard.tsx
 * Phase 4 Super Admin Dashboard and Global Management container shell.
 * Provides complete administrative control over customers, manual funding,
 * global website CMS, customer dashboard modules, staff RBAC, service pricing & catalogs, and audit logs.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import { api } from '../../lib/api';
import { ThemeToggle } from '../ThemeToggle';
import {
  LayoutDashboard,
  Users,
  Clock,
  Globe,
  Layers,
  Cpu,
  ShieldAlert,
  FileText,
  Shield,
  ShieldCheck,
  Menu,
  X,
  ChevronRight,
  LogOut,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Wallet,
  UserCheck,
  Tv,
  ShoppingBag,
  GraduationCap,
  BarChart3,
  Server,
  Mail,
  MessageSquare,
  Lock,
  AlertCircle,
  Loader2,
  ArrowRight,
  LifeBuoy,
  Bell,
  Sliders,
  Eye,
  EyeOff,
  Activity,
  KeyRound,
  Send,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

// Admin child views
import { AdminOverview } from './AdminOverview';
import { CustomerManagement } from './CustomerManagement';
import { ManualFundingQueue } from './ManualFundingQueue';
import { WebsiteManagement } from './WebsiteManagement';
import { DashboardModuleManagement } from './DashboardModuleManagement';
import { ServiceManagement } from './ServiceManagement';
import { StaffPermissionsManagement } from './StaffPermissionsManagement';
import { AuditLogsViewer } from './AuditLogsViewer';
import { FootprintsManagement } from './FootprintsManagement';

// Phase 8 Admin Views
import { DigitalServicesManagement } from './DigitalServicesManagement';
import { StoreManagement } from './StoreManagement';
import { AcademyManagement } from './AcademyManagement';
import { ReportsManagement } from './ReportsManagement';
import { SmtpSettings } from './SmtpSettings';
import { EmailTemplatesManagement } from './EmailTemplatesManagement';
import { SmsSettingsManagement } from './SmsSettingsManagement';
import { AdminKycManagement } from './AdminKycManagement';
import { SupportManagement } from './SupportManagement';
import { NotificationManagement } from './NotificationManagement';
import { GlobalSettingsManagement } from './GlobalSettingsManagement';

interface SuperAdminDashboardProps {
  onSwitchToCustomerPortal: () => void;
  onSwitchToPublic: () => void;
  onSwitchToPhaseConsole?: () => void;
}

export type AdminTabKey =
  | 'overview'
  | 'customers'
  | 'funding'
  | 'footprints'
  | 'support_admin'
  | 'notifications_admin'
  | 'global_settings'
  | 'website'
  | 'modules'
  | 'services'
  | 'digital_services'
  | 'store_admin'
  | 'academy_admin'
  | 'reports_admin'
  | 'smtp'
  | 'email_templates'
  | 'sms'
  | 'staff'
  | 'kyc_admin'
  | 'audit';

interface AdminNavItem {
  id: AdminTabKey;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
}

interface AdminNavSection {
  title: string;
  items: AdminNavItem[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AdminErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Admin Module Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto my-8 bg-slate-900 border border-red-500/30 rounded-2xl text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">Module Display Error</h3>
          <p className="text-xs text-slate-400 leading-relaxed font-mono">
            {this.state.error?.message || 'An unexpected rendering error occurred in this module.'}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Module</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SuperAdminDashboard({
  onSwitchToCustomerPortal,
  onSwitchToPublic,
}: SuperAdminDashboardProps) {
  const { user, loading: sessionLoading, login, logout, refreshUser } = useAuth();
  const { branding } = useCms();
  const brandName = branding?.short_brand_name || 'HAMBAKTECH';
  const logoSrc = branding?.logo_url || '/logo.png';
  const [activeTab, setActiveTab] = useState<AdminTabKey>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'forgot' | 'verify_otp' | 'reset_password'>('login');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null);

  const handleAdminLogout = () => {
    setActiveTab('overview');
    setAdminPassword('');
    setAuthError(null);
    setRecoveryMsg(null);
    setAuthMode('login');
    logout();
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '#admin');
    }
  };

  const handleAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setRecoveryMsg(null);
    try {
      const logged = await login(adminEmail.trim().toLowerCase(), adminPassword);
      if (logged && logged.role !== 'admin' && logged.role !== 'superadmin') {
        setAuthError('This account does not have Administrator privileges.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Administrative authentication failed. Check credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setRecoveryMsg(null);
    try {
      const res = await api.forgotPassword(adminEmail.trim().toLowerCase());
      setResetToken(res.token || '');
      setRecoveryMsg(res.message || 'Recovery OTP sent to administrator email.');
      setAuthMode('verify_otp');
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to send administrator recovery code.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setRecoveryMsg(null);
    try {
      const res = await api.verifyOtp(adminEmail.trim().toLowerCase(), otpCode.trim());
      if (res.token) setResetToken(res.token);
      setRecoveryMsg('Verification code confirmed. Set your new administrator password.');
      setAuthMode('reset_password');
    } catch (err: any) {
      setAuthError(err?.message || 'Invalid or expired OTP code.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setRecoveryMsg(null);
    if (newPassword.length < 8) {
      setAuthError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthLoading(true);
    try {
      await api.resetPassword({
        email: adminEmail.trim().toLowerCase(),
        otp_code: otpCode.trim(),
        token: resetToken,
        new_password: newPassword,
      });
      await refreshUser();
      setAuthMode('login');
      setAdminPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setOtpCode('');
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to update administrator password.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (sessionLoading && !user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-600 dark:text-slate-300 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-xs font-medium">Verifying administrator session...</p>
      </div>
    );
  }

  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-700 selection:text-white transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-mono font-bold tracking-wider uppercase">
              Restricted &bull; Root Authorization
            </span>
            <ThemeToggle compact />
          </div>

          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg shadow-blue-700/25 mx-auto text-white overflow-hidden p-1.5">
              <img
                src={logoSrc}
                alt={brandName}
                className="w-full h-full object-contain rounded-lg bg-white"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {brandName} Super Admin Console
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Sign in with authorized administrative credentials to manage platform services, academy admissions, CMS content, and system settings.
            </p>
          </div>

          {user && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">{user.email}</p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400/90 capitalize font-mono">Role: {user.role} (Non-Admin)</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[10px] font-medium transition"
              >
                Sign Out
              </button>
            </div>
          )}

          {authError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {recoveryMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{recoveryMsg}</span>
            </div>
          )}

          {authMode !== 'login' && (
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
                setRecoveryMsg(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-700 dark:hover:text-blue-400 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Admin Login</span>
            </button>
          )}

          {authMode === 'login' && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Admin Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@hambaktech.com.ng"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot');
                      setAuthError(null);
                      setRecoveryMsg(null);
                    }}
                    className="text-[11px] text-blue-700 dark:text-amber-400 hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading || !adminEmail || !adminPassword}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-700/25"
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Authenticate to Console</span>
                  </>
                )}
              </button>
            </form>
          )}

          {authMode === 'forgot' && (
            <form onSubmit={handleAdminSendOtp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Administrator Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@hambaktech.com.ng"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading || !adminEmail}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Send Recovery OTP</span>
              </button>
            </form>
          )}

          {authMode === 'verify_otp' && (
            <form onSubmit={handleAdminVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.trim())}
                    placeholder="123456"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={authLoading || !otpCode}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Verify OTP</span>}
              </button>
            </form>
          )}

          {authMode === 'reset_password' && (
            <form onSubmit={handleAdminResetPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Update Password &amp; Sign In</span>}
              </button>
            </form>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={onSwitchToCustomerPortal}
              className="hover:text-blue-700 dark:hover:text-blue-400 transition"
            >
              &larr; Customer Portal
            </button>
            <button
              type="button"
              onClick={onSwitchToPublic}
              className="hover:text-amber-600 dark:hover:text-amber-400 transition"
            >
              Public Website &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navSections: AdminNavSection[] = [
    {
      title: 'Executive Intelligence',
      items: [
        { id: 'overview', label: '1. Admin Overview', icon: LayoutDashboard },
        { id: 'customers', label: '2. Customer Management', icon: Users },
        { id: 'funding', label: '3. Funding Approvals', icon: Clock, badge: 'Manual' },
        { id: 'support_admin', label: 'Support Centre', icon: LifeBuoy, badge: 'Stage 8' },
        { id: 'reports_admin', label: 'Reports & Analytics (11)', icon: BarChart3, badge: 'Stage 8' },
      ],
    },
    {
      title: 'Commercial & Services',
      items: [
        { id: 'services', label: 'Core Services & Pricing', icon: Cpu },
        { id: 'digital_services', label: 'Digital Utilities (Cable & Disco)', icon: Tv, badge: 'Phase 8' },
        { id: 'store_admin', label: 'Hardware Store', icon: ShoppingBag, badge: 'Catalog' },
        { id: 'academy_admin', label: 'Digital Training Academy', icon: GraduationCap, badge: '12 Courses' },
      ],
    },
    {
      title: 'Communication & Delivery',
      items: [
        { id: 'notifications_admin', label: 'Broadcasts & Announcements', icon: Bell, badge: 'Stage 8' },
        { id: 'smtp', label: 'SMTP Server Settings', icon: Server, badge: 'Phase 8' },
        { id: 'email_templates', label: 'Email Templates (12)', icon: Mail },
        { id: 'sms', label: 'SMS Gateway & Templates', icon: MessageSquare },
      ],
    },
    {
      title: 'Content & User Experience',
      items: [
        { id: 'global_settings', label: 'Global Settings (22 Sections)', icon: Sliders, badge: 'Stage 8' },
        { id: 'website', label: 'Website Management (CMS)', icon: Globe },
        { id: 'modules', label: 'Dashboard Management', icon: Layers },
      ],
    },
    {
      title: 'Governance & Security',
      items: [
        { id: 'footprints', label: 'Footprints & Telemetry', icon: Activity, badge: 'Live Audit' },
        { id: 'kyc_admin', label: 'KYC & PIN Policies', icon: ShieldCheck, badge: 'Stage 4' },
        { id: 'staff', label: 'Staff & Permissions', icon: ShieldAlert },
        { id: 'audit', label: 'Audit Logs', icon: FileText },
      ],
    },
  ];

  const handleSelectTab = (tab: AdminTabKey) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  // Resolve current active title
  let currentTitle = 'Admin Overview';
  for (const sec of navSections) {
    const item = sec.items.find(i => i.id === activeTab);
    if (item) {
      currentTitle = item.label;
      break;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans selection:bg-blue-700 selection:text-white transition-colors">
      {/* Mobile Drawer Backdrop */}
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
        <div className="flex flex-col h-full">
          {/* Header Brand */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden p-1 shadow-sm">
                <img
                  src={logoSrc}
                  alt={brandName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                  <span>{brandName}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                    ROOT
                  </span>
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Super Admin Console</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav Items List */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {navSections.map(section => (
              <div key={section.title} className="space-y-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTab(item.id)}
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
                        {item.badge && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            isActive
                              ? 'bg-blue-800 text-blue-100'
                              : 'bg-blue-500/10 text-blue-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                          }`}>
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

          {/* Quick Switchers & User Session Card */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50 dark:bg-slate-900/60">
            {/* Switch to Customer Portal */}
            <button
              type="button"
              onClick={onSwitchToCustomerPortal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-blue-700 dark:text-indigo-300 hover:text-blue-900 dark:hover:text-white bg-blue-50 dark:bg-transparent hover:bg-blue-100 dark:hover:bg-indigo-950/30 border border-blue-200 dark:border-indigo-500/20 transition"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-700 dark:text-indigo-400" />
                <span>Customer Portal View</span>
              </div>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            </button>

            {/* Switch to Public Website */}
            <button
              type="button"
              onClick={onSwitchToPublic}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-amber-600 dark:text-emerald-400" />
                <span>Back to Public Website</span>
              </div>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            </button>

            {/* Admin User info & logout */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between px-2 text-xs">
              <div className="truncate">
                <p className="font-semibold text-slate-900 dark:text-white truncate">{user?.full_name || 'Super Admin'}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono capitalize">Role: {user?.role || 'superadmin'}</p>
              </div>
              <button
                type="button"
                onClick={handleAdminLogout}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition"
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
        {/* Top Header */}
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
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono hidden sm:block">
                HAMBAK TECH &amp; SERVICES &bull; Root Administration
              </p>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">{currentTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle compact />

            {/* Quick Customer Portal Button */}
            <button
              type="button"
              onClick={onSwitchToCustomerPortal}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition shadow-sm"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Customer Portal</span>
            </button>
          </div>
        </header>

        {/* View Router */}
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto">
          <AdminErrorBoundary key={activeTab}>
            {activeTab === 'overview' && (
              <AdminOverview onNavigateToTab={tab => setActiveTab(tab as AdminTabKey)} />
            )}

            {activeTab === 'customers' && <CustomerManagement />}

            {activeTab === 'funding' && <ManualFundingQueue />}

            {activeTab === 'footprints' && <FootprintsManagement />}

            {activeTab === 'support_admin' && <SupportManagement />}

            {activeTab === 'notifications_admin' && <NotificationManagement />}

            {activeTab === 'global_settings' && <GlobalSettingsManagement />}

            {activeTab === 'website' && <WebsiteManagement />}

            {activeTab === 'modules' && <DashboardModuleManagement />}

            {activeTab === 'services' && <ServiceManagement />}

            {activeTab === 'digital_services' && <DigitalServicesManagement />}

            {activeTab === 'store_admin' && <StoreManagement />}

            {activeTab === 'academy_admin' && <AcademyManagement />}

            {activeTab === 'reports_admin' && <ReportsManagement />}

            {activeTab === 'smtp' && <SmtpSettings />}

            {activeTab === 'email_templates' && <EmailTemplatesManagement />}

            {activeTab === 'sms' && <SmsSettingsManagement />}

            {activeTab === 'staff' && <StaffPermissionsManagement />}

            {activeTab === 'kyc_admin' && <AdminKycManagement />}

            {activeTab === 'audit' && <AuditLogsViewer />}
          </AdminErrorBoundary>
        </main>
      </div>
    </div>
  );
}
