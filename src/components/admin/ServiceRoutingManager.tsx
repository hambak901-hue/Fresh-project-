import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Edit3,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  FulfilmentMode,
  RoutingAuditLogItem,
  ServiceRoutingItem,
} from '../../types';

interface ServiceRoutingManagerProps {
  onServiceUpdated?: () => void;
}

const MODE_META: Record<
  FulfilmentMode,
  { label: string; badgeClass: string; shortLabel: string }
> = {
  provider_instant: {
    label: 'Provider Instant',
    shortLabel: 'Instant API',
    badgeClass:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  provider_async: {
    label: 'Provider Async',
    shortLabel: 'Async Queue',
    badgeClass:
      'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  internal_manual: {
    label: 'HAMBAK MANUAL',
    shortLabel: 'Internal Desk',
    badgeClass:
      'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
};

export function ServiceRoutingManager({ onServiceUpdated }: ServiceRoutingManagerProps) {
  const [services, setServices] = useState<ServiceRoutingItem[]>([]);
  const [providers, setProviders] = useState<
    Array<{ id: string; name: string; provider_type?: string; is_active?: boolean }>
  >([]);
  const [hambakManualActive, setHambakManualActive] = useState(true);
  const [auditLogs, setAuditLogs] = useState<RoutingAuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState<'all' | FulfilmentMode>('all');
  const [logServiceFilter, setLogServiceFilter] = useState('');

  // Modal editor state
  const [editingService, setEditingService] = useState<ServiceRoutingItem | null>(null);
  const [formMode, setFormMode] = useState<FulfilmentMode>('provider_async');
  const [formProviderId, setFormProviderId] = useState<string>('2sureverify');
  const [formWholesaleCost, setFormWholesaleCost] = useState<number>(0);
  const [formInternalCost, setFormInternalCost] = useState<number>(0);
  const [formSellingPrice, setFormSellingPrice] = useState<number>(0);
  const [formSlaHours, setFormSlaHours] = useState<number>(48);
  const [formManualLabel, setFormManualLabel] = useState<string>('');
  const [formInternalEligible, setFormInternalEligible] = useState<boolean>(false);
  const [formSchemaVerified, setFormSchemaVerified] = useState<boolean>(false);
  const [formEligibilityNotes, setFormEligibilityNotes] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formReason, setFormReason] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchRoutingData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [srvRes, logsRes] = await Promise.all([
        api.getRoutingServices(),
        api.getRoutingAuditLogs({
          service_key: logServiceFilter.trim() || undefined,
          limit: 60,
        }),
      ]);
      setServices(srvRes.services || []);
      setProviders(srvRes.providers || []);
      setHambakManualActive(Boolean(srvRes.hambak_manual_active));
      setAuditLogs(logsRes.logs || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load service routing configuration.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogsOnly = async (serviceKeyFilter?: string) => {
    setLoadingLogs(true);
    try {
      const res = await api.getRoutingAuditLogs({
        service_key: (serviceKeyFilter ?? logServiceFilter).trim() || undefined,
        limit: 60,
      });
      setAuditLogs(res.logs || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load routing audit logs.');
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    void fetchRoutingData();
  }, []);

  const externalProviders = useMemo(() => {
    const filtered = providers.filter(p => p.id !== 'hambak_manual');
    if (filtered.length > 0) return filtered;
    return [
      { id: '2sureverify', name: '2SureVerify', is_active: true },
      { id: 'veripine', name: 'Veripine', is_active: true },
    ];
  }, [providers]);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    services.forEach(s => {
      const code = s.category_code || s.category || 'general';
      if (!seen.has(code)) {
        seen.set(code, s.category_name || code.replace(/_/g, ' '));
      }
    });
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
  }, [services]);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(s => {
      const cat = s.category_code || s.category || '';
      if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
      if (modeFilter !== 'all' && s.fulfilment_mode !== modeFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.service_key.toLowerCase().includes(q) ||
        String(s.provider_id || '').toLowerCase().includes(q) ||
        String(s.endpoint || '').toLowerCase().includes(q)
      );
    });
  }, [services, search, categoryFilter, modeFilter]);

  const stats = useMemo(() => {
    return services.reduce(
      (acc, s) => {
        acc.total += 1;
        if (s.fulfilment_mode === 'provider_instant') acc.instant += 1;
        else if (s.fulfilment_mode === 'provider_async') acc.async += 1;
        else if (s.fulfilment_mode === 'internal_manual') acc.manual += 1;
        return acc;
      },
      { total: 0, instant: 0, async: 0, manual: 0 }
    );
  }, [services]);

  const openEditor = (srv: ServiceRoutingItem) => {
    setEditingService(srv);
    setModalError(null);
    const mode = (srv.fulfilment_mode || 'provider_async') as FulfilmentMode;
    setFormMode(mode);
    setFormProviderId(
      mode === 'internal_manual'
        ? 'hambak_manual'
        : srv.provider_id && srv.provider_id !== 'hambak_manual'
        ? srv.provider_id
        : externalProviders[0]?.id || '2sureverify'
    );
    setFormWholesaleCost(Number(srv.wholesale_cost || 0));
    setFormInternalCost(Number(srv.internal_fulfilment_cost || 0));
    setFormSellingPrice(Number(srv.selling_price ?? srv.price ?? 0));
    setFormSlaHours(Number(srv.sla_hours || 48));
    setFormManualLabel(srv.manual_label || '');
    setFormInternalEligible(Boolean(srv.internal_manual_eligible));
    setFormSchemaVerified(Boolean(srv.provider_schema_verified));
    setFormEligibilityNotes(srv.eligibility_notes || '');
    setFormIsActive(Boolean(srv.is_active ?? srv.enabled ?? true));
    setFormReason('');
  };

  const handleModeChange = (nextMode: FulfilmentMode) => {
    setFormMode(nextMode);
    if (nextMode === 'internal_manual') {
      setFormProviderId('hambak_manual');
    } else if (formProviderId === 'hambak_manual' || !formProviderId) {
      setFormProviderId(externalProviders[0]?.id || '2sureverify');
    }
  };

  const handleSaveRouting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    const cleanReason = formReason.trim();
    if (cleanReason.length < 5) {
      setModalError('A routing change reason of at least 5 characters is required for the audit trail.');
      return;
    }
    if (editingService.is_instant_registry_sku && formMode === 'internal_manual') {
      setModalError('Instant verification registry SKUs cannot be switched to HAMBAK MANUAL.');
      return;
    }
    if (formMode === 'internal_manual' && !formInternalEligible) {
      setModalError('Enable internal_manual_eligible before routing this service to HAMBAK MANUAL.');
      return;
    }
    const activeCostPreview =
      formMode === 'internal_manual' ? formInternalCost : formWholesaleCost;
    if (formSellingPrice < 0 || activeCostPreview < 0) {
      setModalError('Prices and costs cannot be negative.');
      return;
    }

    setSaving(true);
    setModalError(null);
    setSuccessMsg(null);
    try {
      const res = await api.updateServiceRouting(editingService.service_key, {
        fulfilment_mode: formMode,
        provider_id: formMode === 'internal_manual' ? 'hambak_manual' : formProviderId,
        wholesale_cost: formWholesaleCost,
        internal_fulfilment_cost: formInternalCost,
        selling_price: formSellingPrice,
        sla_hours: formSlaHours,
        manual_label: formManualLabel.trim() || undefined,
        internal_manual_eligible: editingService.is_instant_registry_sku
          ? false
          : formInternalEligible,
        provider_schema_verified: formSchemaVerified,
        eligibility_notes: formEligibilityNotes.trim() || undefined,
        is_active: formIsActive,
        reason: cleanReason,
      });
      setSuccessMsg(
        res.message ||
          `Updated routing for ${editingService.name} to ${MODE_META[formMode].label}.`
      );
      setEditingService(null);
      await fetchRoutingData();
      onServiceUpdated?.();
    } catch (err: any) {
      setModalError(err?.message || 'Failed to update service routing.');
    } finally {
      setSaving(false);
    }
  };

  const modalActiveCost =
    formMode === 'internal_manual' ? formInternalCost : formWholesaleCost;
  const modalProfit = formSellingPrice - modalActiveCost;
  const modalMarginPct =
    formSellingPrice > 0 ? Math.round((modalProfit / formSellingPrice) * 100) : 0;

  return (
    <div className="space-y-6 text-xs">
      {/* Header & Summary KPIs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ArrowUpDown className="w-5 h-5 text-indigo-400" />
              <span>Unified Service Routing &amp; Fulfilment Engine</span>
            </h2>
            <p className="text-slate-400 mt-1">
              Control per-SKU fulfilment routing across external API gateways and HAMBAK MANUAL with immutable audit logging.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                hambakManualActive
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                HAMBAK MANUAL Desk: {hambakManualActive ? 'Active' : 'Inactive'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void fetchRoutingData()}
              disabled={loading}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              Total Catalog SKUs
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.total}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 block">
              Provider Instant
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.instant}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 block">
              Provider Async
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.async}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 block">
              HAMBAK MANUAL
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.manual}
            </span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search service name, service_key, provider, or endpoint..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Categories ({services.length})</option>
            {categories.map(c => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Fulfilment Modes</option>
            <option value="provider_instant">Provider Instant</option>
            <option value="provider_async">Provider Async</option>
            <option value="internal_manual">HAMBAK MANUAL</option>
          </select>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-300 hover:text-white font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-300 hover:text-white font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Per-SKU Routing Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Service SKU</th>
                <th className="py-3 px-3">Mode</th>
                <th className="py-3 px-3">Provider</th>
                <th className="py-3 px-3">Guards</th>
                <th className="py-3 px-3 text-right">Active Cost</th>
                <th className="py-3 px-3 text-right">Selling Price</th>
                <th className="py-3 px-3 text-right">Margin</th>
                <th className="py-3 px-3 text-center">SLA</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && services.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    <span>Loading routing matrix...</span>
                  </td>
                </tr>
              ) : filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No catalog services match your filter.
                  </td>
                </tr>
              ) : (
                filteredServices.map(srv => {
                  const meta =
                    MODE_META[srv.fulfilment_mode] || MODE_META.provider_async;
                  return (
                    <tr key={srv.service_key} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{srv.name}</span>
                          {!srv.is_active && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[10px] font-semibold">
                              Disabled
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{srv.service_key}</span>
                          <span>&middot;</span>
                          <span className="uppercase">
                            {(srv.category_code || srv.category || '').replace(/_/g, ' ')}
                          </span>
                          {srv.endpoint && (
                            <>
                              <span>&middot;</span>
                              <span className="text-indigo-400">{srv.endpoint}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold whitespace-nowrap ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-200">
                        <div>{srv.provider_id}</div>
                        {srv.provider_id !== 'hambak_manual' && srv.provider_is_active === false && (
                          <span className="text-[10px] text-rose-400">Provider Inactive</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {srv.is_instant_registry_sku ? (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] inline-flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              <span>Instant Lock</span>
                            </span>
                          ) : (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                srv.internal_manual_eligible
                                  ? 'bg-amber-500/10 text-amber-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {srv.internal_manual_eligible ? 'Manual Eligible' : 'API Only'}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              srv.provider_schema_verified
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {srv.provider_schema_verified ? 'Schema OK' : 'Unverified'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        <div>₦{Number(srv.active_cost || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500">
                          {srv.fulfilment_mode === 'internal_manual' ? 'Internal' : 'Wholesale'}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold text-white">
                        ₦{Number(srv.selling_price || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                        <div
                          className={`font-semibold ${
                            srv.profit_per_transaction >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          ₦{Number(srv.profit_per_transaction || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {srv.margin_percent}%
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {srv.sla_hours}h
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditor(srv)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Configure</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Immutable Routing Audit Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              <span>Routing Audit Trail</span>
            </h3>
            <p className="text-slate-400 mt-0.5">
              Immutable ledger of all fulfilment mode transitions, provider switches, cost updates, and SLA overrides.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={logServiceFilter}
              onChange={e => setLogServiceFilter(e.target.value)}
              placeholder="Filter by service_key..."
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => void fetchLogsOnly()}
              disabled={loadingLogs}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              {loadingLogs ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Filter</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Service Key</th>
                <th className="py-2.5 px-3">Mode Transition</th>
                <th className="py-2.5 px-3">Provider</th>
                <th className="py-2.5 px-3">SLA</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No routing changes recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-NG')}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-indigo-300">
                      {log.service_key}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                      <span className="text-slate-400">{log.previous_mode || '—'}</span>
                      <span className="mx-1.5 text-slate-500">&rarr;</span>
                      <span className="text-white font-semibold">{log.new_mode}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                      <span className="text-slate-400">{log.previous_provider_id || '—'}</span>
                      <span className="mx-1.5 text-slate-500">&rarr;</span>
                      <span className="text-emerald-300">{log.new_provider_id || '—'}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
                      {log.previous_sla_hours ?? '—'}h &rarr; {log.new_sla_hours ?? '—'}h
                    </td>
                    <td className="py-2.5 px-3 text-slate-200 max-w-xs">{log.reason}</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-300 whitespace-nowrap">
                      <div>{log.actor_name || log.actor_email || 'System'}</div>
                      {log.actor_role && (
                        <div className="text-[10px] font-mono text-slate-500 uppercase">
                          {log.actor_role}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configure Routing Modal */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Configure Service Routing — {editingService.name}
                </h3>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                  {editingService.service_key}
                  {editingService.endpoint ? ` · ${editingService.endpoint}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRouting} className="p-6 space-y-5">
              {editingService.is_instant_registry_sku && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    This SKU is an instant verification registry lookup and is permanently locked against HAMBAK MANUAL routing.
                  </span>
                </div>
              )}

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Fulfilment Mode
                  </label>
                  <select
                    value={formMode}
                    onChange={e => handleModeChange(e.target.value as FulfilmentMode)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                  >
                    <option value="provider_instant">Provider Instant (Automated API)</option>
                    <option value="provider_async">Provider Async (Queued / Polled API)</option>
                    <option
                      value="internal_manual"
                      disabled={editingService.is_instant_registry_sku}
                    >
                      HAMBAK MANUAL (Internal Operations Desk)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Assigned Provider
                  </label>
                  {formMode === 'internal_manual' ? (
                    <div className="w-full px-3 py-2 bg-slate-950 border border-amber-500/30 rounded-xl text-amber-300 font-mono text-xs flex items-center gap-2">
                      <Server className="w-3.5 h-3.5" />
                      <span>hambak_manual (Internal Fulfilment Desk)</span>
                    </div>
                  ) : (
                    <select
                      value={formProviderId}
                      onChange={e => setFormProviderId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                    >
                      {externalProviders.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Customer Selling Price (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={formSellingPrice}
                    onChange={e => setFormSellingPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    SLA Window (Hours)
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={formSlaHours}
                      onChange={e => setFormSlaHours(Number(e.target.value))}
                      className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    External Provider Wholesale Cost (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={formWholesaleCost}
                    onChange={e => setFormWholesaleCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Internal HAMBAK MANUAL Fulfilment Cost (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={formInternalCost}
                    onChange={e => setFormInternalCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Customer Turnaround / Manual Label
                  </label>
                  <input
                    type="text"
                    value={formManualLabel}
                    onChange={e => setFormManualLabel(e.target.value)}
                    placeholder="e.g. Manual Processing (24-72h)"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Projected Net Margin</span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      modalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ₦{modalProfit.toLocaleString()} ({modalMarginPct}%)
                  </span>
                </div>
              </div>

              {/* Safety Flags */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={e => setFormIsActive(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Service Active</span>
                </label>

                <label
                  className={`flex items-center gap-2 text-slate-200 ${
                    editingService.is_instant_registry_sku
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={editingService.is_instant_registry_sku}
                    checked={formInternalEligible}
                    onChange={e => setFormInternalEligible(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Internal Manual Eligible</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={formSchemaVerified}
                    onChange={e => setFormSchemaVerified(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Provider Schema Verified</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Eligibility &amp; Routing Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formEligibilityNotes}
                  onChange={e => setFormEligibilityNotes(e.target.value)}
                  placeholder="Optional compliance or provider schema notes..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Mandatory Change Reason (Min 5 characters) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  placeholder="Explain why this routing mode, provider, cost, or SLA is being updated..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save Routing &amp; Log Audit</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
