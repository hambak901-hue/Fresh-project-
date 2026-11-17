import React, { useState } from 'react';
import {
  TrendingUp,
  Globe,
  Wallet,
  Receipt,
  Store,
  Boxes,
  Scale,
  BookOpen,
  BarChart2,
  Mail,
  Settings,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import { getLagosDateString, getLagosMonthStartString } from './accountingUtils';
import {
  FinancialOverviewView,
  WebsiteAccountingView,
  WalletLiabilitiesView,
} from './AccountingCoreViews';
import {
  ExpensesIncomeView,
  PhysicalSalesView,
  InventoryAccountingView,
} from './AccountingOperationsViews';
import {
  ReconciliationView,
  AccountingLedgerView,
  BusinessAnalyticsView,
  DailyEmailReportView,
  AccountingConfigView,
} from './AccountingControlViews';

export type AccountingModuleKey =
  | 'overview'
  | 'website'
  | 'liabilities'
  | 'expenses_income'
  | 'physical_sales'
  | 'inventory'
  | 'reconciliation'
  | 'ledger'
  | 'analytics'
  | 'daily_report'
  | 'config';

interface BusinessManagementAccountingProps {
  activeModule: AccountingModuleKey;
  onSelectModule: (mod: AccountingModuleKey) => void;
}

const MODULE_TABS: Array<{
  key: AccountingModuleKey;
  label: string;
  icon: React.FC<{ className?: string }>;
  perms: string[];
}> = [
  { key: 'overview', label: '1. Financial Overview', icon: TrendingUp, perms: ['accounting', 'reports'] },
  { key: 'website', label: '2. Website Accounting', icon: Globe, perms: ['accounting'] },
  { key: 'liabilities', label: '3. Wallet Liabilities', icon: Wallet, perms: ['accounting', 'wallet'] },
  { key: 'expenses_income', label: '4. Income & Expenses', icon: Receipt, perms: ['accounting', 'accounting_physical'] },
  { key: 'physical_sales', label: '5. Physical Counter Sales', icon: Store, perms: ['accounting', 'accounting_physical'] },
  { key: 'inventory', label: '6. Inventory & Purchases', icon: Boxes, perms: ['accounting', 'accounting_physical', 'accounting_reconcile'] },
  { key: 'reconciliation', label: '7. Cash/POS/Bank Recon', icon: Scale, perms: ['accounting', 'accounting_reconcile'] },
  { key: 'ledger', label: '8. Accounting Ledger', icon: BookOpen, perms: ['accounting', 'accounting_reconcile'] },
  { key: 'analytics', label: '9. Business Analytics', icon: BarChart2, perms: ['accounting', 'reports'] },
  { key: 'daily_report', label: '10. Daily Email Report', icon: Mail, perms: ['accounting', 'accounting_config'] },
  { key: 'config', label: '11. Config & Permissions', icon: Settings, perms: ['accounting', 'accounting_config'] },
];

export const BusinessManagementAccounting: React.FC<BusinessManagementAccountingProps> = ({
  activeModule,
  onSelectModule,
}) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];

  const hasAnyPerm = (accepted: string[]): boolean => {
    if (isSuperAdmin || perms.includes('*')) return true;
    return accepted.some(p => perms.includes(p));
  };

  const canAdjust = isSuperAdmin || perms.includes('*') || perms.includes('accounting_adjust');
  const canConfigure = isSuperAdmin || perms.includes('*') || perms.includes('accounting_config') || perms.includes('accounting');

  const [dateFrom, setDateFrom] = useState(getLagosDateString(-29));
  const [dateTo, setDateTo] = useState(getLagosDateString(0));
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const visibleTabs = MODULE_TABS.filter(t => hasAnyPerm(t.perms));
  const effectiveModule: AccountingModuleKey = visibleTabs.some(t => t.key === activeModule)
    ? activeModule
    : visibleTabs[0]?.key || 'overview';

  const applyPreset = (preset: 'today' | 'yesterday' | 'month' | '30d') => {
    const today = getLagosDateString(0);
    if (preset === 'today') {
      setDateFrom(today);
      setDateTo(today);
    } else if (preset === 'yesterday') {
      const y = getLagosDateString(-1);
      setDateFrom(y);
      setDateTo(y);
    } else if (preset === 'month') {
      setDateFrom(getLagosMonthStartString());
      setDateTo(today);
    } else {
      setDateFrom(getLagosDateString(-29));
      setDateTo(today);
    }
  };

  const handleQuickRefresh = async () => {
    setSyncing(true);
    try {
      await api.syncAccountingWebsiteTransactions(false);
    } catch {
      // ignore if user only has physical sales permission
    } finally {
      setSyncing(false);
      setRefreshKey(k => k + 1);
    }
  };

  const showDateToolbar = !['liabilities', 'inventory', 'daily_report', 'config'].includes(effectiveModule);

  return (
    <div className="space-y-5">
      {/* Top Accounting Suite Banner + Period Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-blue-700 dark:text-blue-400 font-bold">
              HAMBAKTECH &bull; Business Management &amp; Accounting Suite
            </p>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {MODULE_TABS.find(t => t.key === effectiveModule)?.label || 'Financial Overview'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {showDateToolbar && (
              <>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'month', label: 'This Month' },
                    { id: '30d', label: '30 Days' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id as any)}
                      className="px-2.5 py-1 rounded-lg font-semibold text-[11px] text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="bg-transparent text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                  />
                  <span className="text-slate-400">&rarr;</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="bg-transparent text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </>
            )}

            <button
              type="button"
              onClick={handleQuickRefresh}
              disabled={syncing}
              className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sync &amp; Refresh</span>
            </button>
          </div>
        </div>

        {/* 11-Module Quick Navigation Pills */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            const active = tab.key === effectiveModule;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectModule(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition ${
                  active
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Accounting Module View */}
      {effectiveModule === 'overview' && (
        <FinancialOverviewView
          dateFrom={dateFrom}
          dateTo={dateTo}
          refreshKey={refreshKey}
          onNavigateModule={mod => onSelectModule(mod)}
        />
      )}

      {effectiveModule === 'website' && (
        <WebsiteAccountingView dateFrom={dateFrom} dateTo={dateTo} refreshKey={refreshKey} />
      )}

      {effectiveModule === 'liabilities' && <WalletLiabilitiesView refreshKey={refreshKey} />}

      {effectiveModule === 'expenses_income' && (
        <ExpensesIncomeView
          dateFrom={dateFrom}
          dateTo={dateTo}
          refreshKey={refreshKey}
          canAdjust={canAdjust}
          onDataChanged={() => setRefreshKey(k => k + 1)}
        />
      )}

      {effectiveModule === 'physical_sales' && (
        <PhysicalSalesView
          dateFrom={dateFrom}
          dateTo={dateTo}
          refreshKey={refreshKey}
          canAdjust={canAdjust}
          onDataChanged={() => setRefreshKey(k => k + 1)}
        />
      )}

      {effectiveModule === 'inventory' && (
        <InventoryAccountingView
          refreshKey={refreshKey}
          onDataChanged={() => setRefreshKey(k => k + 1)}
        />
      )}

      {effectiveModule === 'reconciliation' && (
        <ReconciliationView
          dateFrom={dateFrom}
          dateTo={dateTo}
          refreshKey={refreshKey}
          canAdjust={canAdjust}
          onDataChanged={() => setRefreshKey(k => k + 1)}
        />
      )}

      {effectiveModule === 'ledger' && (
        <AccountingLedgerView
          dateFrom={dateFrom}
          dateTo={dateTo}
          refreshKey={refreshKey}
          canAdjust={canAdjust}
          onDataChanged={() => setRefreshKey(k => k + 1)}
        />
      )}

      {effectiveModule === 'analytics' && (
        <BusinessAnalyticsView dateFrom={dateFrom} dateTo={dateTo} refreshKey={refreshKey} />
      )}

      {effectiveModule === 'daily_report' && (
        <DailyEmailReportView refreshKey={refreshKey} canConfigure={canConfigure} />
      )}

      {effectiveModule === 'config' && (
        <AccountingConfigView
          refreshKey={refreshKey}
          isSuperAdmin={isSuperAdmin}
          onDataChanged={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
};
