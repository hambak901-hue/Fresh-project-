/**
 * @file SuperAdminDashboard.tsx
 * Phase 4 Super Admin Dashboard and Global Management container shell.
 * Provides complete administrative control over customers, manual funding,
 * global website CMS, customer dashboard modules, staff RBAC, service pricing & catalogs, and audit logs.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
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

// Phase 8 Admin Views
import { DigitalServicesManagement } from './DigitalServicesManagement';
import { StoreManagement } from './StoreManagement';
import { AcademyManagement } from './AcademyManagement';
import { ReportsManagement } from './ReportsManagement';
import { SmtpSettings } from './SmtpSettings';
import { EmailTemplatesManagement } from './EmailTemplatesManagement';
import { SmsSettingsManagement } from './SmsSettingsManagement';

interface SuperAdminDashboardProps {
  onSwitchToCustomerPortal: () => void;
  onSwitchToPublic: () => void;
  onSwitchToPhaseConsole: () => void;
}

export type AdminTabKey =
  | 'overview'
  | 'customers'
  | 'funding'
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

export function SuperAdminDashboard({
  onSwitchToCustomerPortal,
  onSwitchToPublic,
  onSwitchToPhaseConsole,
}: SuperAdminDashboardProps) {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabKey>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navSections: AdminNavSection[] = [
    {
      title: 'Executive Intelligence',
      items: [
        { id: 'overview', label: '1. Admin Overview', icon: LayoutDashboard },
        { id: 'customers', label: '2. Customer Management', icon: Users },
        { id: 'funding', label: '3. Funding Approvals', icon: Clock, badge: 'Manual' },
        { id: 'reports_admin', label: 'Reports & Analytics', icon: BarChart3, badge: 'Phase 8' },
      ],
    },
    {
      title: 'Commercial & Services',
      items: [
        { id: 'services', label: 'Core Services & Pricing', icon: Cpu },
        { id: 'digital_services', label: 'Digital Utilities (Cable & Disco)', icon: Tv, badge: 'Phase 8' },
        { id: 'store_admin', label: 'Hardware Store', icon: ShoppingBag, badge: 'Coming Soon' },
        { id: 'academy_admin', label: 'Agency Academy', icon: GraduationCap, badge: 'Coming Soon' },
      ],
    },
    {
      title: 'Communication & Delivery',
      items: [
        { id: 'smtp', label: 'SMTP Server Settings', icon: Server, badge: 'Phase 8' },
        { id: 'email_templates', label: 'Email Templates (12)', icon: Mail },
        { id: 'sms', label: 'SMS Gateway & Templates', icon: MessageSquare },
      ],
    },
    {
      title: 'Content & User Experience',
      items: [
        { id: 'website', label: 'Website Management (CMS)', icon: Globe },
        { id: 'modules', label: 'Dashboard Management', icon: Layers },
      ],
    },
    {
      title: 'Governance & Security',
      items: [
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans selection:bg-indigo-500 selection:text-white">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header Brand */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 font-bold text-white text-base">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-extrabold text-sm text-white tracking-tight flex items-center gap-1.5">
                  <span>HambakTech</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                    ROOT
                  </span>
                </span>
                <p className="text-[11px] text-slate-400">Super Admin Console</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white"
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
                            ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
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

          {/* Quick Switchers & User Session Card */}
          <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-900/60">
            {/* Switch to Customer Portal */}
            <button
              type="button"
              onClick={onSwitchToCustomerPortal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-indigo-300 hover:text-white hover:bg-indigo-950/30 border border-indigo-500/20 transition"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phase 03 Customer Portal</span>
              </div>
              <ChevronRight className="w-3 h-3 text-slate-500" />
            </button>

            {/* Switch to Public Website */}
            <button
              type="button"
              onClick={onSwitchToPublic}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phase 02 Public Web &amp; CMS</span>
              </div>
              <ChevronRight className="w-3 h-3 text-slate-500" />
            </button>

            {/* Switch to Phase Console */}
            <button
              type="button"
              onClick={onSwitchToPhaseConsole}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span>Phase 01 Arch Console</span>
              </div>
              <ChevronRight className="w-3 h-3 text-slate-500" />
            </button>

            {/* Admin User info & logout */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between px-2 text-xs">
              <div className="truncate">
                <p className="font-semibold text-white truncate">{user?.full_name || 'Super Admin'}</p>
                <p className="text-[10px] text-amber-400 font-mono capitalize">Role: {user?.role || 'superadmin'}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg transition"
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
        <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <p className="text-[11px] text-slate-400 font-mono hidden sm:block">Root Administration &bull; LON110</p>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">{currentTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">

            {/* Quick Customer Portal Button */}
            <button
              type="button"
              onClick={onSwitchToCustomerPortal}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition shadow-sm"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Customer Portal</span>
            </button>
          </div>
        </header>

        {/* View Router */}
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <AdminOverview onNavigateToTab={tab => setActiveTab(tab as AdminTabKey)} />
          )}

          {activeTab === 'customers' && <CustomerManagement />}

          {activeTab === 'funding' && <ManualFundingQueue />}

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

          {activeTab === 'audit' && <AuditLogsViewer />}
        </main>
      </div>
    </div>
  );
}
