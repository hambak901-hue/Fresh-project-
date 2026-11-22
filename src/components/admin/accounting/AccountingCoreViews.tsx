import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Globe,
  Store,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Landmark,
  Banknote,
  CreditCard,
  Clock,
} from 'lucide-react';
import { api } from '../../../lib/api';
import {
  AccountingPeriodSummary,
  AccountingEntryItem,
  AccountingChannelBalance,
  AccountingWalletLiabilitySummary,
  AccountingInventoryItem,
} from '../../../types';
import { formatNaira, formatDomainLabel } from './accountingUtils';

interface DateRangeProps {
  dateFrom: string;
  dateTo: string;
  refreshKey: number;
  onNavigateModule: (mod: any) => void;
}

export const FinancialOverviewView: React.FC<DateRangeProps> = ({
  dateFrom,
  dateTo,
  refreshKey,
  onNavigateModule,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    lagos_now: string;
    period_summary: AccountingPeriodSummary;
    today_summary: AccountingPeriodSummary;
    yesterday_summary: AccountingPeriodSummary;
    month_summary: AccountingPeriodSummary;
    wallet_liabilities: AccountingWalletLiabilitySummary;
    channel_balances: AccountingChannelBalance[];
    low_stock_count: number;
    low_stock_items: AccountingInventoryItem[];
    daily_trend: Array<any>;
    recent_entries: AccountingEntryItem[];
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAccountingOverview({ date_from: dateFrom, date_to: dateTo });
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to load financial overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo, refreshKey]);

  if (loading && !data) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-xs font-medium">Synchronizing live MySQL records &amp; computing WAT financial overview...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const p = data.period_summary;
  const today = data.today_summary;
  const yesterday = data.yesterday_summary;
  const month = data.month_summary;
  const wl = data.wallet_liabilities;
  const trend = data.daily_trend || [];

  const maxTrendVal = Math.max(
    100,
    ...trend.map(t => Math.max(Number(t.website_revenue || 0) + Number(t.physical_revenue || 0) + Number(t.other_income || 0), Number(t.wallet_funding || 0)))
  );

  return (
    <div className="space-y-6">
      {/* Low Stock Alert Strip (only if items are low) */}
      {data.low_stock_count > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-bold">Inventory Reorder Alert ({data.low_stock_count} items below threshold)</p>
              <p className="text-[11px] opacity-90">
                {data.low_stock_items.slice(0, 4).map(i => `${i.name} (${Number(i.current_stock)} ${i.unit_label})`).join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateModule('inventory')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shrink-0 transition"
          >
            Restock Inventory
          </button>
        </div>
      )}

      {/* Accounting Policy Clarification */}
      <div className="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>
          <strong>True Profit Accounting:</strong> Customer wallet deposits ({formatNaira(p.customer_wallet_deposits)} in period) are tracked as{' '}
          <strong>Wallet Liabilities</strong> and excluded from Company Revenue. Revenue is recognized only upon completed services, counter sales, or other income.
        </span>
        <span className="font-mono text-[11px] text-blue-700 dark:text-blue-300 shrink-0">WAT: {data.lagos_now}</span>
      </div>

      {(p.unverified_cost_count || 0) > 0 && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Verified Profit Guard:</strong> {p.unverified_cost_count} historical website order(s) totaling{' '}
            <span className="font-mono font-bold">{formatNaira(p.unverified_cost_revenue || 0)}</span> lack an authoritative provider cost record and are excluded from Verified Net Profit (₦0.00 assumed margin).
          </span>
        </div>
      )}

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Business Revenue</span>
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {formatNaira(p.total_business_revenue)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Web {formatNaira(p.website_revenue)} · Counter {formatNaira(p.physical_revenue)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Costs, Fees &amp; OpEx</span>
            <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {formatNaira(p.total_costs_and_expenses)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            COGS {formatNaira(p.provider_costs + p.direct_inventory_cogs)} · OpEx {formatNaira(p.operating_expenses)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Net Business Profit</span>
            {p.net_profit >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
          </div>
          <p
            className={`text-2xl font-extrabold font-mono tabular-nums ${
              p.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatNaira(p.net_profit)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Margin: {p.profit_margin_percent.toFixed(1)}% · Fees: {formatNaira(p.gateway_pos_fees)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Customer Wallet Liability</span>
            <Wallet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
            {formatNaira(wl.total_customer_liability)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {wl.funded_wallets_count} funded / {wl.total_customers} customers
          </p>
        </div>
      </div>

      {/* Yesterday vs Today vs Month-to-Date Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { label: 'Today (Africa/Lagos)', summary: today, accent: 'border-l-4 border-l-blue-600' },
          { label: 'Yesterday Final (WAT)', summary: yesterday, accent: 'border-l-4 border-l-slate-500' },
          { label: 'Month-to-Date (WAT)', summary: month, accent: 'border-l-4 border-l-emerald-600' },
        ].map(box => (
          <div
            key={box.label}
            className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${box.accent} rounded-xl p-4 space-y-2.5 text-xs`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white">{box.label}</span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {box.summary.counts.website_sales + box.summary.counts.physical_sales} sales
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Revenue</p>
                <p className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatNaira(box.summary.total_business_revenue)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Net Profit</p>
                <p
                  className={`font-bold font-mono tabular-nums ${
                    box.summary.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatNaira(box.summary.net_profit)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Wallet Deposits</p>
                <p className="font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {formatNaira(box.summary.customer_wallet_deposits)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Costs + OpEx</p>
                <p className="font-semibold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                  {formatNaira(box.summary.total_costs_and_expenses)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue vs Wallet Funding Trend + Channel Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Daily Revenue vs Profit Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Daily Revenue, Net Profit &amp; Wallet Inflows</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Separated view showing recognized business revenue vs customer wallet deposits
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Revenue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Profit
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Wallet Deposits
              </span>
            </div>
          </div>

          {trend.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No accounting entries found for the selected date range ({dateFrom} to {dateTo}).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[460px] h-48 flex items-end gap-2 pt-4 pb-1 border-b border-slate-200 dark:border-slate-800">
                {trend.slice(-24).map(t => {
                  const rev = Math.max(0, Number(t.website_revenue || 0) + Number(t.physical_revenue || 0) + Number(t.other_income || 0));
                  const prof = Math.max(0, Number(t.net_profit || 0));
                  const dep = Math.max(0, Number(t.wallet_funding || 0));
                  const revH = Math.max(4, Math.round((rev / maxTrendVal) * 145));
                  const profH = Math.max(2, Math.round((prof / maxTrendVal) * 145));
                  const depH = Math.max(2, Math.round((dep / maxTrendVal) * 145));
                  return (
                    <div
                      key={t.entry_date}
                      className="flex-1 min-w-[26px] flex flex-col items-center gap-1 group"
                      title={`${t.entry_date} | Revenue: ${formatNaira(rev)} | Profit: ${formatNaira(Number(t.net_profit || 0))} | Wallet Funding: ${formatNaira(dep)}`}
                    >
                      <div className="w-full flex items-end justify-center gap-0.5 h-40">
                        <div style={{ height: `${revH}px` }} className="w-2 bg-blue-600 dark:bg-blue-500 rounded-t transition-all" />
                        <div style={{ height: `${profH}px` }} className="w-2 bg-emerald-500 rounded-t transition-all" />
                        <div style={{ height: `${depH}px` }} className="w-2 bg-amber-500/80 rounded-t transition-all" />
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-full">
                        {String(t.entry_date).slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Channel Cash / POS / Bank Balances */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Channel Positions</h3>
            <button
              type="button"
              onClick={() => onNavigateModule('reconciliation')}
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reconcile &rarr;
            </button>
          </div>
          <div className="space-y-2.5">
            {data.channel_balances.map(cb => (
              <div
                key={cb.account_code}
                className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{cb.account_name}</p>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    In {formatNaira(cb.total_inflow)} · Out {formatNaira(cb.total_outflow + cb.total_fees)}
                  </p>
                </div>
                <p className="font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                  {formatNaira(cb.expected_balance)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Unified Ledger Entries */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Latest Accounting Entries</h3>
          <button
            type="button"
            onClick={() => onNavigateModule('ledger')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Open Full Ledger &rarr;
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Time (WAT)</th>
                <th className="py-2.5 px-4">Origin / Category</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Channel</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
                <th className="py-2.5 px-4 text-right">Cost / Exp</th>
                <th className="py-2.5 px-4 text-right">Profit Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {data.recent_entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No accounting entries recorded yet.
                  </td>
                </tr>
              ) : (
                data.recent_entries.map(e => {
                  const rev = Number(e.revenue_amount || 0);
                  const costExp = Number(e.cost_amount || 0) + Number(e.fee_amount || 0) + Number(e.expense_amount || 0);
                  const prof = Number(e.net_profit_impact || 0);
                  return (
                    <tr key={e.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${Number(e.is_reversed) === 1 ? 'opacity-50 line-through' : ''}`}>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {e.occurred_lagos}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {e.source_origin}
                        </span>{' '}
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{e.entry_category}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white truncate max-w-xs">{e.title}</p>
                        <p className="text-[10px] font-mono text-slate-500">{e.reference}</p>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] uppercase text-slate-600 dark:text-slate-300">
                        {e.payment_channel}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {rev !== 0 ? formatNaira(rev) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                        {costExp !== 0 ? formatNaira(costExp) : '—'}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                          prof > 0 ? 'text-emerald-600 dark:text-emerald-400' : prof < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'
                        }`}
                      >
                        {prof !== 0 ? formatNaira(prof, true) : formatNaira(Number(e.wallet_liability_delta || 0), true) + ' liab'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// MODULE 2: AUTOMATIC WEBSITE TRANSACTION ACCOUNTING
// =========================================================================

export const WebsiteAccountingView: React.FC<{
  dateFrom: string;
  dateTo: string;
  refreshKey: number;
}> = ({ dateFrom, dateTo, refreshKey }) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAccountingWebsiteTransactions({
        date_from: dateFrom,
        date_to: dateTo,
        entry_category: categoryFilter,
        service_domain: domainFilter,
        search: search.trim() || undefined,
      });
      setData(res);
    } catch (e: any) {
      setNotice(e?.message || 'Failed to load website transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo, categoryFilter, domainFilter, refreshKey]);

  const handleForceSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await api.syncAccountingWebsiteTransactions(true);
      setNotice(`Synced ${res.total_source_transactions} website transactions (+${res.inserted} new, ${res.updated} refreshed, 0 duplicates).`);
      await load();
    } catch (e: any) {
      setNotice(e?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const summary: AccountingPeriodSummary | null = data?.summary || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="text-xs">
          <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600" />
            <span>Automatic Website Transaction Accounting</span>
          </p>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            Automatically synced from live <code className="font-mono">transactions</code>, <code className="font-mono">telecom_orders</code>,{' '}
            <code className="font-mono">verification_records</code>, <code className="font-mono">modification_requests</code>, <code className="font-mono">enrolment_orders</code>, and{' '}
            <code className="font-mono">payment_records</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={handleForceSync}
          disabled={syncing}
          className="px-3.5 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Re-syncing...' : 'Full Re-Sync Now'}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs text-blue-800 dark:text-blue-200">
          {notice}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Net Service Revenue</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {formatNaira(summary.website_revenue)}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              Gross {formatNaira(summary.website_gross_sales)} − Refunds {formatNaira(summary.website_refunds)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Provider Wholesale Costs</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
              {formatNaira(summary.provider_costs)}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">{summary.counts.website_sales} completed orders</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Gateway Charges</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {formatNaira(summary.gateway_pos_fees)}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">Paystack Online Gateway</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Wallet Deposits (Liability)</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-1">
              {formatNaira(summary.customer_wallet_deposits)}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">Not counted as revenue</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <p className="text-slate-500 dark:text-slate-400">Pending Gateway Checkouts</p>
            <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {formatNaira(data?.pending_gateway_payments?.amount || 0)}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              {data?.pending_gateway_payments?.count || 0} awaiting Paystack confirmation
            </p>
          </div>
        </div>
      )}

      {/* Domain Breakdown Table */}
      {summary && summary.website_domains.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
            Website Revenue &amp; Margin by Service Line (Net of Refunds)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                  <th className="py-2.5 px-4">Service Line</th>
                  <th className="py-2.5 px-4 text-right">Orders</th>
                  <th className="py-2.5 px-4 text-right">Refunds</th>
                  <th className="py-2.5 px-4 text-right">Gross Sales</th>
                  <th className="py-2.5 px-4 text-right">Net Revenue</th>
                  <th className="py-2.5 px-4 text-right">Provider Cost</th>
                  <th className="py-2.5 px-4 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summary.website_domains.map(d => (
                  <tr key={d.service_domain} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">{formatDomainLabel(d.service_domain)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{d.tx_count}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-600">{d.refund_count}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNaira(d.gross_sales)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{formatNaira(d.net_revenue)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">{formatNaira(d.provider_cost)}</td>
                    <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${d.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                      {formatNaira(d.net_profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter Bar & Auto-Synced Entries */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2.5 text-xs">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            <option value="all">All Website Categories</option>
            <option value="website_service_sale">Service Sales</option>
            <option value="customer_refund">Customer Refunds</option>
            <option value="wallet_funding">Wallet Funding (Liability)</option>
            <option value="referral_wallet_credit">Referral Wallet Credits</option>
            <option value="referral_payout">Referral Cash Payouts</option>
          </select>

          <select
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            <option value="all">All Services</option>
            <option value="nin_verification">NIN Verification</option>
            <option value="bvn_verification">BVN Verification</option>
            <option value="nin_modification">NIN Modification</option>
            <option value="bvn_modification">BVN Modification</option>
            <option value="enrolment">NIN Enrolment</option>
            <option value="data">Data Bundles</option>
            <option value="airtime">Airtime VTU</option>
            <option value="airtime_pin">Airtime PINs</option>
            <option value="data_pin">Data PINs</option>
            <option value="cable">Cable TV</option>
            <option value="electricity">Electricity</option>
            <option value="wallet_funding">Wallet Funding</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="Search reference, customer, or description..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white rounded-lg font-semibold"
          >
            Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-2.5 px-4">Date/Time (WAT)</th>
                <th className="py-2.5 px-4">Customer &amp; Reference</th>
                <th className="py-2.5 px-4">Type / Service</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
                <th className="py-2.5 px-4 text-right">Cost / Fee</th>
                <th className="py-2.5 px-4 text-right">Liability &Delta;</th>
                <th className="py-2.5 px-4 text-right">Profit Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !data ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading website accounting records...
                  </td>
                </tr>
              ) : (data?.entries || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No website transactions match the current filter.
                  </td>
                </tr>
              ) : (
                (data?.entries || []).map((e: AccountingEntryItem) => {
                  const rev = Number(e.revenue_amount || 0);
                  const costFee = Number(e.cost_amount || 0) + Number(e.fee_amount || 0);
                  const liab = Number(e.wallet_liability_delta || 0);
                  const prof = Number(e.net_profit_impact || 0);
                  const parsedMeta = typeof e.metadata === 'string' ? (() => { try { return JSON.parse(e.metadata); } catch { return {}; } })() : (e.metadata || {});
                  const isUnverifiedCost = e.entry_category === 'website_service_sale' && parsedMeta?.cost_verified === false;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">{e.occurred_lagos}</td>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{e.customer_name || 'Customer'}</p>
                        <p className="text-[10px] font-mono text-slate-500">{e.reference}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{formatDomainLabel(e.service_domain)}</p>
                        <p className="text-[10px] font-mono text-slate-500">{e.entry_category} &bull; {e.payment_channel}</p>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatNaira(e.gross_amount)}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{formatNaira(rev)}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                        {isUnverifiedCost ? (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Unverified</span>
                        ) : costFee > 0 ? formatNaira(costFee) : '—'}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums ${liab > 0 ? 'text-amber-600' : liab < 0 ? 'text-slate-500' : ''}`}>
                        {liab !== 0 ? formatNaira(liab, true) : '—'}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${prof > 0 ? 'text-emerald-600 dark:text-emerald-400' : prof < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {isUnverifiedCost ? '₦0.00 (Excl.)' : formatNaira(prof, true)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// MODULE 3: CUSTOMER WALLET & LIABILITY MONITORING
// =========================================================================

export const WalletLiabilitiesView: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAccountingWalletLiabilities();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshKey]);

  if (loading && !data) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span>Auditing customer wallets, ledger balances, and referral liabilities...</span>
      </div>
    );
  }

  const s: AccountingWalletLiabilitySummary | null = data?.summary || null;
  const holders = (data?.holders || []).filter((h: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(h.full_name || '').toLowerCase().includes(q) ||
      String(h.email || '').toLowerCase().includes(q) ||
      String(h.phone_number || '').includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Customer Wallet Liabilities</p>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-1">
              {formatNaira(s.total_customer_liability)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {s.funded_wallets_count} funded of {s.total_customers} customers
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Referral Cash Liabilities</p>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {formatNaira(s.referral_liability_total)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Available: {formatNaira(s.referral_available_liability)} · Reserved: {formatNaira(s.referral_reserved_withdrawal)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Internal/Admin Wallets (Excluded)</p>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-1">
              {formatNaira(s.internal_admin_wallets_total)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {s.internal_admin_wallets_count} staff/superadmin accounts
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 dark:text-slate-400">Wallet Ledger Integrity</p>
            <p className={`text-2xl font-extrabold font-mono tabular-nums mt-1 ${s.balance_mismatch_count === 0 && s.negative_wallets_count === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
              {s.balance_mismatch_count === 0 && s.negative_wallets_count === 0 ? 'MATCHED' : `${s.balance_mismatch_count} Drift`}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Negative wallets: {s.negative_wallets_count} ({formatNaira(s.negative_exposure)})
            </p>
          </div>
        </div>
      )}

      {/* Mismatch warning if any */}
      {data?.mismatches?.length > 0 && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 space-y-1">
          <p className="font-bold">Wallet Sync Drift Detected ({data.mismatches.length} accounts)</p>
          {data.mismatches.map((m: any) => (
            <p key={m.id} className="font-mono text-[11px]">
              {m.email}: users={formatNaira(m.user_table_balance)} vs wallets={formatNaira(m.wallet_table_balance)} (drift {formatNaira(m.drift, true)})
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Customer Wallet Holders */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Customer Wallet Balances</h3>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customer..."
              className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white w-44"
            />
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold uppercase text-slate-500 sticky top-0">
                  <th className="py-2 px-3">Customer</th>
                  <th className="py-2 px-3 text-right">Funded</th>
                  <th className="py-2 px-3 text-right">Spent</th>
                  <th className="py-2 px-3 text-right">Liability Bal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {holders.map((h: any) => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{h.full_name}</p>
                      <p className="text-[10px] font-mono text-slate-500">{h.email}</p>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatNaira(h.lifetime_funded)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatNaira(h.lifetime_spent)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400">
                      {formatNaira(h.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Wallet Ledger Movements */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Recent Wallet Liability Movements</h3>
            <span className="text-[11px] font-mono text-slate-500">wallet_ledger</span>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold uppercase text-slate-500 sticky top-0">
                  <th className="py-2 px-3">User / Ref</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3 text-right">After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.recent_movements || []).map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3">
                      <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">{m.full_name || m.email}</p>
                      <p className="text-[10px] font-mono text-slate-500 truncate max-w-[180px]">{m.reference}</p>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        m.entry_type === 'CREDIT'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                      }`}>
                        {m.entry_type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                      {formatNaira(m.amount)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500">
                      {formatNaira(m.balance_after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
