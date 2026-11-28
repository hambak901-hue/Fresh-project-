import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Edit3,
  History,
  Layers,
  Link2,
  Loader2,
  Lock,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  FulfilmentMode,
  ProviderServiceMappingItem,
  RoutingApplicationSummary,
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

type RoutingSubTab = 'matrix' | 'mappings' | 'audit';
type DomainScopeFilter = 'all' | 'nin' | 'bvn' | 'additional';

export function ServiceRoutingManager({ onServiceUpdated }: ServiceRoutingManagerProps) {
  const [subTab, setSubTab] = useState<RoutingSubTab>('matrix');
  const [services, setServices] = useState<ServiceRoutingItem[]>([]);
  const [providers, setProviders] = useState<
    Array<{
      id: string;
      name: string;
      provider_type?: string;
      is_active?: boolean;
      is_configured?: boolean;
    }>
  >([]);
  const [providerMappings, setProviderMappings] = useState<ProviderServiceMappingItem[]>([]);
  const [appSummary, setAppSummary] = useState<RoutingApplicationSummary | null>(null);
  const [hambakManualActive, setHambakManualActive] = useState(true);
  const [auditLogs, setAuditLogs] = useState<RoutingAuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Matrix filters
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<DomainScopeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState<'all' | FulfilmentMode>('all');

  // Mapping filters
  const [mappingSearch, setMappingSearch] = useState('');
  const [mappingProviderFilter, setMappingProviderFilter] = useState('all');

  // Audit filter
  const [logServiceFilter, setLogServiceFilter] = useState('');

  // Configure Routing Modal state
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

  // Quick Activate / Deactivate Modal state (mandatory reason)
  const [toggleTarget, setToggleTarget] = useState<ServiceRoutingItem | null>(null);
  const [toggleReason, setToggleReason] = useState<string>('');
  const [toggling, setToggling] = useState<boolean>(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Provider Service Mapping Create/Edit Modal state
  const [mappingModalOpen, setMappingModalOpen] = useState<boolean>(false);
  const [editingMapping, setEditingMapping] = useState<ProviderServiceMappingItem | null>(null);
  const [mapProviderId, setMapProviderId] = useState<string>('2sureverify');
  const [mapServiceKey, setMapServiceKey] = useState<string>('');
  const [mapPlanCode, setMapPlanCode] = useState<string>('');
  const [mapEndpoint, setMapEndpoint] = useState<string>('');
  const [mapWholesaleCost, setMapWholesaleCost] = useState<number>(0);
  const [mapIsActive, setMapIsActive] = useState<boolean>(true);
  const [mapSchemaVerified, setMapSchemaVerified] = useState<boolean>(false);
  const [mapNotes, setMapNotes] = useState<string>('');
  const [savingMapping, setSavingMapping] = useState<boolean>(false);
  const [mappingModalError, setMappingModalError] = useState<string | null>(null);

  // Mapping Delete Confirm state
  const [deletingMapping, setDeletingMapping] = useState<ProviderServiceMappingItem | null>(null);
  const [deletingMappingBusy, setDeletingMappingBusy] = useState<boolean>(false);

  const fetchRoutingData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [srvRes, logsRes] = await Promise.all([
        api.getRoutingServices(),
        api.getRoutingAuditLogs({
          service_key: logServiceFilter.trim() || undefined,
          limit: 80,
        }),
      ]);
      setServices(srvRes.services || []);
      setProviders(srvRes.providers || []);
      setHambakManualActive(Boolean(srvRes.hambak_manual_active));
      setAppSummary(srvRes.application_summary || null);
      if (srvRes.provider_mappings) {
        setProviderMappings(srvRes.provider_mappings);
      } else {
        const mapRes = await api.getRoutingProviderMappings();
        setProviderMappings(mapRes.mappings || []);
      }
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
        limit: 80,
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

  // Only external identity/verification providers are valid for automated routing or provider_service_mappings
  const externalIdentityProviders = useMemo(() => {
    const filtered = providers.filter(p => {
      const pid = String(p.id || '').toLowerCase();
      const pType = String(p.provider_type || 'identity').toLowerCase();
      return (
        pid !== 'hambak_manual' &&
        pid !== 'internal_manual' &&
        (pType === 'identity' || pType === 'verification')
      );
    });
    if (filtered.length > 0) return filtered;
    return [
      {
        id: '2sureverify',
        name: '2SureVerify',
        provider_type: 'identity',
        is_active: true,
        is_configured: true,
      },
      {
        id: 'veripine',
        name: 'Veripine',
        provider_type: 'identity',
        is_active: true,
        is_configured: false,
      },
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
      const cat = String(s.category_code || s.category || '').toLowerCase();
      const key = String(s.service_key || '').toLowerCase();
      const name = String(s.name || '').toLowerCase();

      if (scopeFilter === 'nin') {
        if (!cat.includes('nin') && !key.startsWith('nin') && !key.includes('vnin') && !key.startsWith('phone_') && !key.startsWith('demo_') && !name.includes('nin')) {
          return false;
        }
      } else if (scopeFilter === 'bvn') {
        if (!cat.includes('bvn') && !key.startsWith('bvn') && !name.includes('bvn')) {
          return false;
        }
      } else if (scopeFilter === 'additional') {
        if (!cat.includes('additional') && !key.includes('ipe') && !key.includes('validation') && !key.includes('tracking')) {
          return false;
        }
      }

      if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
      if (modeFilter !== 'all' && s.fulfilment_mode !== modeFilter) return false;
      if (!q) return true;
      return (
        name.includes(q) ||
        key.includes(q) ||
        cat.includes(q) ||
        String(s.provider_id || '').toLowerCase().includes(q) ||
        String(s.endpoint || '').toLowerCase().includes(q)
      );
    });
  }, [services, search, scopeFilter, categoryFilter, modeFilter]);

  const filteredMappings = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase();
    return providerMappings.filter(m => {
      if (mappingProviderFilter !== 'all' && m.provider_id !== mappingProviderFilter) {
        return false;
      }
      if (!q) return true;
      return (
        m.service_key.toLowerCase().includes(q) ||
        m.service_name.toLowerCase().includes(q) ||
        m.provider_id.toLowerCase().includes(q) ||
        m.provider_name.toLowerCase().includes(q) ||
        m.provider_endpoint.toLowerCase().includes(q) ||
        m.provider_plan_code.toLowerCase().includes(q)
      );
    });
  }, [providerMappings, mappingSearch, mappingProviderFilter]);

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

  const computedAppSummary = useMemo(() => {
    if (appSummary) return appSummary;
    return services.reduce<RoutingApplicationSummary>(
      (acc, s) => {
        const c = s.application_counts;
        if (!c) return acc;
        acc.total += c.total || 0;
        acc.pending += c.pending || 0;
        acc.completed += c.completed || 0;
        acc.failed_refunded += c.failed_refunded || 0;
        (['provider_instant', 'provider_async', 'internal_manual'] as const).forEach(m => {
          acc.by_mode[m].total += c.by_mode?.[m]?.total || 0;
          acc.by_mode[m].pending += c.by_mode?.[m]?.pending || 0;
          acc.by_mode[m].completed += c.by_mode?.[m]?.completed || 0;
        });
        return acc;
      },
      {
        total: 0,
        pending: 0,
        completed: 0,
        failed_refunded: 0,
        by_mode: {
          provider_instant: { total: 0, pending: 0, completed: 0 },
          provider_async: { total: 0, pending: 0, completed: 0 },
          internal_manual: { total: 0, pending: 0, completed: 0 },
        },
      }
    );
  }, [appSummary, services]);

  const openEditor = (srv: ServiceRoutingItem) => {
    setEditingService(srv);
    setModalError(null);
    const mode = (srv.fulfilment_mode || 'provider_async') as FulfilmentMode;
    setFormMode(mode);
    const readyExternal =
      externalIdentityProviders.find(p => p.is_active && p.is_configured !== false) ||
      externalIdentityProviders[0];
    setFormProviderId(
      mode === 'internal_manual'
        ? 'hambak_manual'
        : srv.provider_id && srv.provider_id !== 'hambak_manual'
        ? srv.provider_id
        : readyExternal?.id || '2sureverify'
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
      const readyExternal =
        externalIdentityProviders.find(p => p.is_active && p.is_configured !== false) ||
        externalIdentityProviders[0];
      setFormProviderId(readyExternal?.id || '2sureverify');
    }
  };

  const selectedExternalProviderMeta = useMemo(() => {
    return externalIdentityProviders.find(p => p.id === formProviderId) || null;
  }, [externalIdentityProviders, formProviderId]);

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
    if (formMode !== 'internal_manual') {
      if (!selectedExternalProviderMeta || selectedExternalProviderMeta.is_active === false || selectedExternalProviderMeta.is_configured === false) {
        setModalError('Selected external provider is inactive or missing server API credentials.');
        return;
      }
    }
    const activeCostPreview =
      formMode === 'internal_manual' ? formInternalCost : formWholesaleCost;
    if (formSellingPrice < 0 || activeCostPreview < 0) {
      setModalError('Prices and costs cannot be negative.');
      return;
    }
    if (formSellingPrice < activeCostPreview) {
      setModalError(
        `Selling price (₦${formSellingPrice.toLocaleString()}) cannot be lower than active ${
          formMode === 'internal_manual' ? 'internal fulfilment' : 'wholesale'
        } cost (₦${activeCostPreview.toLocaleString()}).`
      );
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
        sla_hours: formMode === 'provider_instant' ? null : formSlaHours,
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

  const handleConfirmToggleRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toggleTarget) return;
    const cleanReason = toggleReason.trim();
    if (cleanReason.length < 5) {
      setToggleError('A mandatory change reason (minimum 5 characters) is required to activate or deactivate a route.');
      return;
    }
    setToggling(true);
    setToggleError(null);
    setSuccessMsg(null);
    try {
      const nextActive = !toggleTarget.is_active;
      const res = await api.updateServiceRouting(toggleTarget.service_key, {
        fulfilment_mode: toggleTarget.fulfilment_mode,
        is_active: nextActive,
        reason: cleanReason,
      });
      setSuccessMsg(
        res.message ||
          `${toggleTarget.name} route ${nextActive ? 'activated' : 'deactivated'}.`
      );
      setToggleTarget(null);
      setToggleReason('');
      await fetchRoutingData();
      onServiceUpdated?.();
    } catch (err: any) {
      setToggleError(err?.message || 'Failed to update route activation status.');
    } finally {
      setToggling(false);
    }
  };

  const openCreateMappingModal = () => {
    setEditingMapping(null);
    setMappingModalError(null);
    const defaultProv =
      externalIdentityProviders.find(p => p.is_active && p.is_configured !== false)?.id ||
      externalIdentityProviders[0]?.id ||
      '2sureverify';
    const defaultSrv = services[0]?.service_key || '';
    setMapProviderId(defaultProv);
    setMapServiceKey(defaultSrv);
    setMapPlanCode('');
    setMapEndpoint('');
    setMapWholesaleCost(0);
    setMapIsActive(true);
    setMapSchemaVerified(false);
    setMapNotes('');
    setMappingModalOpen(true);
  };

  const openEditMappingModal = (m: ProviderServiceMappingItem) => {
    setEditingMapping(m);
    setMappingModalError(null);
    setMapProviderId(m.provider_id);
    setMapServiceKey(m.service_key);
    setMapPlanCode(m.provider_plan_code || '');
    setMapEndpoint(m.provider_endpoint || '');
    setMapWholesaleCost(Number(m.wholesale_cost || 0));
    setMapIsActive(Boolean(m.is_active));
    setMapSchemaVerified(Boolean(m.schema_verified));
    setMapNotes(m.schema_verification_notes || '');
    setMappingModalOpen(true);
  };

  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    const prov = mapProviderId.trim();
    const sk = mapServiceKey.trim();
    const code = mapPlanCode.trim();
    const endpoint = mapEndpoint.trim();

    if (!prov || prov.toLowerCase() === 'hambak_manual' || prov.toLowerCase() === 'internal_manual') {
      setMappingModalError('HAMBAK MANUAL cannot be added to external provider mappings.');
      return;
    }
    if (!sk) {
      setMappingModalError('Select a service SKU.');
      return;
    }
    if (!code) {
      setMappingModalError('Provider service code is required.');
      return;
    }
    if (!endpoint) {
      setMappingModalError('Provider API endpoint path is required.');
      return;
    }
    if (mapWholesaleCost < 0) {
      setMappingModalError('Wholesale cost cannot be negative.');
      return;
    }

    const duplicate = providerMappings.find(
      m =>
        m.provider_id === prov &&
        m.service_key === sk &&
        (!editingMapping || m.id !== editingMapping.id)
    );
    if (duplicate) {
      setMappingModalError(
        `A mapping already exists for ${prov} and ${sk}. Edit the existing mapping instead.`
      );
      return;
    }

    setSavingMapping(true);
    setMappingModalError(null);
    setSuccessMsg(null);
    try {
      const payload = {
        provider_id: prov,
        service_key: sk,
        provider_plan_code: code,
        provider_endpoint: endpoint,
        wholesale_cost: mapWholesaleCost,
        is_active: mapIsActive,
        schema_verified: mapSchemaVerified,
        schema_verification_notes: mapNotes.trim() || undefined,
      };
      const res = editingMapping
        ? await api.updateRoutingProviderMapping(editingMapping.id, payload)
        : await api.createRoutingProviderMapping(payload);
      setSuccessMsg(res.message || 'Provider service mapping saved.');
      setMappingModalOpen(false);
      await fetchRoutingData();
    } catch (err: any) {
      setMappingModalError(err?.message || 'Failed to save provider service mapping.');
    } finally {
      setSavingMapping(false);
    }
  };

  const handleDeleteMapping = async () => {
    if (!deletingMapping) return;
    setDeletingMappingBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.deleteRoutingProviderMapping(deletingMapping.id);
      setSuccessMsg(res.message || 'Provider mapping deleted.');
      setDeletingMapping(null);
      await fetchRoutingData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to delete provider mapping.');
      setDeletingMapping(null);
    } finally {
      setDeletingMappingBusy(false);
    }
  };

  const modalActiveCost =
    formMode === 'internal_manual' ? formInternalCost : formWholesaleCost;
  const modalProfit = formSellingPrice - modalActiveCost;
  const modalMarginPct =
    formSellingPrice > 0 ? Math.round((modalProfit / formSellingPrice) * 100) : 0;

  return (
    <div className="space-y-6 text-xs">
      {/* Header, Workbench Sub-Tabs & Dual KPI Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ArrowUpDown className="w-5 h-5 text-indigo-400" />
              <span>Unified Service Routing &amp; Fulfilment Engine</span>
            </h2>
            <p className="text-slate-400 mt-1">
              Manage NIN &amp; BVN service fulfilment routes, external provider service mappings, wholesale vs internal costs, and immutable audit history.
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

        {/* Sub-tab Navigation (Zero-pill rectangular tabs) */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setSubTab('matrix')}
            className={`px-3.5 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5 transition ${
              subTab === 'matrix'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Service Routing Matrix ({services.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('mappings')}
            className={`px-3.5 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5 transition ${
              subTab === 'mappings'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>External Provider Mappings ({providerMappings.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5 transition ${
              subTab === 'audit'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Routing Audit Trail ({auditLogs.length})</span>
          </button>
        </div>

        {/* Summary KPI Strip — Row 1: SKU Distribution | Row 2: Live Application Counts by Mode & Status */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block">
              Total Catalog SKUs
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.total}
            </span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums mt-1 block">
              Apps: {computedAppSummary.total.toLocaleString()} ({computedAppSummary.pending.toLocaleString()} Pending &middot; {computedAppSummary.completed.toLocaleString()} Completed)
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 block">
              Provider Instant SKUs
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.instant}
            </span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums mt-1 block">
              Apps: {computedAppSummary.by_mode.provider_instant.total.toLocaleString()} ({computedAppSummary.by_mode.provider_instant.pending.toLocaleString()} P &middot; {computedAppSummary.by_mode.provider_instant.completed.toLocaleString()} C)
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 block">
              Provider Async SKUs
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.async}
            </span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums mt-1 block">
              Apps: {computedAppSummary.by_mode.provider_async.total.toLocaleString()} ({computedAppSummary.by_mode.provider_async.pending.toLocaleString()} P &middot; {computedAppSummary.by_mode.provider_async.completed.toLocaleString()} C)
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 block">
              HAMBAK MANUAL SKUs
            </span>
            <span className="text-xl font-extrabold text-white font-mono tabular-nums mt-1 block">
              {stats.manual}
            </span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums mt-1 block">
              Apps: {computedAppSummary.by_mode.internal_manual.total.toLocaleString()} ({computedAppSummary.by_mode.internal_manual.pending.toLocaleString()} P &middot; {computedAppSummary.by_mode.internal_manual.completed.toLocaleString()} C)
            </span>
          </div>
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

      {/* SUB-TAB 1: SERVICE ROUTING MATRIX */}
      {subTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by service name, code (service_key), category, provider, or endpoint..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
              />
            </div>
            <select
              value={scopeFilter}
              onChange={e => setScopeFilter(e.target.value as DomainScopeFilter)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Identity Scopes</option>
              <option value="nin">NIN Services</option>
              <option value="bvn">BVN Services</option>
              <option value="additional">Additional Services</option>
            </select>
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

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Service SKU</th>
                    <th className="py-3 px-3">Mode</th>
                    <th className="py-3 px-3">Provider &amp; Readiness</th>
                    <th className="py-3 px-3">Guards</th>
                    <th className="py-3 px-3 text-right">Costs</th>
                    <th className="py-3 px-3 text-right">Selling</th>
                    <th className="py-3 px-3 text-right">Margin</th>
                    <th className="py-3 px-3 text-center">SLA</th>
                    <th className="py-3 px-3 text-right">Applications</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading && services.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                        <span>Loading routing matrix...</span>
                      </td>
                    </tr>
                  ) : filteredServices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        No catalog services match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredServices.map(srv => {
                      const meta =
                        MODE_META[srv.fulfilment_mode] || MODE_META.provider_async;
                      const isManual = srv.fulfilment_mode === 'internal_manual';
                      const provReady = isManual
                        ? hambakManualActive
                        : srv.provider_is_active !== false &&
                          srv.provider_is_configured !== false;
                      const counts = srv.application_counts;
                      return (
                        <tr key={srv.service_key} className="hover:bg-slate-800/30 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white flex items-center gap-2 flex-wrap">
                              <span>{srv.name}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  srv.is_active
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-rose-500/15 text-rose-300'
                                }`}
                              >
                                {srv.is_active ? 'Active' : 'Disabled'}
                              </span>
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
                            <span
                              className={`text-[10px] ${
                                provReady ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isManual
                                ? hambakManualActive
                                  ? 'Desk Ready'
                                  : 'Desk Inactive'
                                : srv.provider_is_active === false
                                ? 'Provider Inactive'
                                : srv.provider_is_configured === false
                                ? 'Missing Credentials'
                                : 'Ready'}
                            </span>
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
                            <div className="font-semibold text-white">
                              ₦{Number(srv.active_cost || 0).toLocaleString()}{' '}
                              <span className="text-[10px] font-normal text-slate-400">
                                {isManual ? '(Int)' : '(Whl)'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {isManual
                                ? `Whl: ₦${Number(srv.wholesale_cost || 0).toLocaleString()}`
                                : `Int: ₦${Number(srv.internal_fulfilment_cost || 0).toLocaleString()}`}
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
                            {srv.fulfilment_mode === 'provider_instant' || srv.sla_hours == null
                              ? 'Instant'
                              : `${srv.sla_hours}h`}
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {counts && counts.total > 0 ? (
                              <div>
                                <div className="text-white font-semibold">
                                  {counts.total}{' '}
                                  <span className="text-[10px] font-normal text-slate-400">
                                    ({counts.pending}P / {counts.completed}C)
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  I:{counts.by_mode.provider_instant.total} &middot; A:{counts.by_mode.provider_async.total} &middot; M:{counts.by_mode.internal_manual.total}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600">0</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setToggleTarget(srv);
                                  setToggleReason('');
                                  setToggleError(null);
                                }}
                                title={srv.is_active ? 'Deactivate route' : 'Activate route'}
                                className={`p-1.5 rounded-lg border transition ${
                                  srv.is_active
                                    ? 'bg-slate-800 hover:bg-rose-500/20 border-slate-700 text-emerald-400 hover:text-rose-300'
                                    : 'bg-slate-800 hover:bg-emerald-500/20 border-slate-700 text-rose-400 hover:text-emerald-300'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditor(srv)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Configure</span>
                              </button>
                            </div>
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
      )}

      {/* SUB-TAB 2: EXTERNAL PROVIDER SERVICE MAPPINGS */}
      {subTab === 'mappings' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-400" />
                <span>External Provider Service Mappings</span>
              </h3>
              <p className="text-slate-400 mt-0.5">
                Configure external provider service codes, API endpoints, and wholesale costs. HAMBAK MANUAL cannot be added here, and saving mappings never alters active routes or provider credentials.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateMappingModal}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add External Mapping</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={mappingSearch}
                onChange={e => setMappingSearch(e.target.value)}
                placeholder="Search service_key, provider, service code, or endpoint..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
              />
            </div>
            <select
              value={mappingProviderFilter}
              onChange={e => setMappingProviderFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All External Providers</option>
              {externalIdentityProviders.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Service</th>
                  <th className="py-2.5 px-3">External Provider</th>
                  <th className="py-2.5 px-3">Provider Service Code</th>
                  <th className="py-2.5 px-3">Endpoint</th>
                  <th className="py-2.5 px-3 text-right">Wholesale Cost</th>
                  <th className="py-2.5 px-3">Verification</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredMappings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      No external provider mappings match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredMappings.map(m => (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{m.service_name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {m.service_key}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <div className="text-slate-200">{m.provider_id}</div>
                        <div
                          className={`text-[10px] ${
                            m.provider_is_active && m.provider_is_configured
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {!m.provider_is_active
                            ? 'Provider Inactive'
                            : !m.provider_is_configured
                            ? 'Missing Credentials'
                            : 'Active & Ready'}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-indigo-300">
                        {m.provider_plan_code || <span className="text-slate-500">—</span>}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300 max-w-xs truncate">
                        {m.provider_endpoint || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-white">
                        ₦{Number(m.wholesale_cost || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] inline-flex items-center gap-1 ${
                            m.schema_verified
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>{m.schema_verified ? 'Verified' : 'Unverified'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              m.is_active
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {m.is_active ? 'Enabled' : 'Disabled'}
                          </span>
                          {m.is_current_route && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 text-[10px] font-semibold">
                              Current Active Route
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditMappingModal(m)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            disabled={m.is_current_route && m.service_is_active}
                            title={
                              m.is_current_route && m.service_is_active
                                ? 'Switch or deactivate the service route before deleting this mapping'
                                : 'Delete external mapping'
                            }
                            onClick={() => setDeletingMapping(m)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: IMMUTABLE ROUTING AUDIT LOG */}
      {subTab === 'audit' && (
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

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Service Key</th>
                  <th className="py-2.5 px-3">Mode Transition</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3">Cost Change</th>
                  <th className="py-2.5 px-3">SLA</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
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
                        <div>
                          Whl: ₦{Number(log.previous_wholesale_cost ?? 0).toLocaleString()} &rarr; ₦
                          {Number(log.new_wholesale_cost ?? 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Int: ₦{Number(log.previous_internal_cost ?? 0).toLocaleString()} &rarr; ₦
                          {Number(log.new_internal_cost ?? 0).toLocaleString()}
                        </div>
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
      )}

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
                    <div className="w-full px-3 py-2 bg-slate-950 border border-amber-500/30 rounded-xl text-amber-300 font-mono text-xs flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2">
                        <Server className="w-3.5 h-3.5" />
                        <span>hambak_manual (Internal Desk)</span>
                      </span>
                      <span
                        className={`text-[10px] ${
                          hambakManualActive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {hambakManualActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <select
                        value={formProviderId}
                        onChange={e => setFormProviderId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                      >
                        {externalIdentityProviders.map(p => {
                          const unavailable = p.is_active === false || p.is_configured === false;
                          return (
                            <option key={p.id} value={p.id} disabled={unavailable}>
                              {p.name} ({p.id})
                              {p.is_active === false
                                ? ' — Inactive'
                                : p.is_configured === false
                                ? ' — Missing Credentials'
                                : ' — Ready'}
                            </option>
                          );
                        })}
                      </select>
                      {selectedExternalProviderMeta && (
                        <div className="text-[10px] font-mono text-slate-400">
                          Status:{' '}
                          <span
                            className={
                              selectedExternalProviderMeta.is_active &&
                              selectedExternalProviderMeta.is_configured !== false
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {selectedExternalProviderMeta.is_active === false
                              ? 'Provider Inactive'
                              : selectedExternalProviderMeta.is_configured === false
                              ? 'Missing API Credentials'
                              : 'Active & Configured'}
                          </span>
                        </div>
                      )}
                    </div>
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
                      disabled={formMode === 'provider_instant'}
                      value={formMode === 'provider_instant' ? '' : formSlaHours}
                      placeholder={formMode === 'provider_instant' ? 'Instant (No SLA)' : '48'}
                      onChange={e => setFormSlaHours(Number(e.target.value))}
                      className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    External Provider Wholesale Cost (₦)
                    {formMode !== 'internal_manual' && (
                      <span className="ml-1.5 text-emerald-400">(Active Cost)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    disabled={formMode === 'internal_manual'}
                    value={formWholesaleCost}
                    onChange={e => setFormWholesaleCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Internal HAMBAK MANUAL Fulfilment Cost (₦)
                    {formMode === 'internal_manual' && (
                      <span className="ml-1.5 text-amber-400">(Active Cost)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    disabled={editingService.is_instant_registry_sku}
                    value={formInternalCost}
                    onChange={e => setFormInternalCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Customer Turnaround / Label
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
                  <div>
                    <span className="text-slate-400 block">HAMBAK Net Margin</span>
                    <span className="text-[10px] text-slate-500">
                      Based on {formMode === 'internal_manual' ? 'internal cost' : 'wholesale cost'}
                    </span>
                  </div>
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
                  <span>Route Active</span>
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
                  placeholder="Explain why this routing mode, provider, cost, activation, or SLA is being updated..."
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

      {/* Quick Route Activation / Deactivation Confirmation Modal (Requires Reason) */}
      {toggleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {toggleTarget.is_active ? 'Deactivate' : 'Activate'} Service Route
              </h3>
              <button
                type="button"
                onClick={() => setToggleTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmToggleRoute} className="p-5 space-y-4">
              <p className="text-slate-300 leading-relaxed">
                You are about to{' '}
                <strong className={toggleTarget.is_active ? 'text-rose-400' : 'text-emerald-400'}>
                  {toggleTarget.is_active ? 'DEACTIVATE' : 'ACTIVATE'}
                </strong>{' '}
                routing for <span className="font-semibold text-white">{toggleTarget.name}</span> (
                <span className="font-mono text-indigo-300">{toggleTarget.service_key}</span>).
                Only this service will be affected; existing submitted orders retain their immutable routing snapshots.
              </p>

              {toggleError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{toggleError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Mandatory Reason (Min 5 characters) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={toggleReason}
                  onChange={e => setToggleReason(e.target.value)}
                  placeholder="Provide reason for activating or deactivating this service route..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setToggleTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={toggling}
                  className={`px-4 py-2 rounded-xl font-bold text-white inline-flex items-center gap-1.5 ${
                    toggleTarget.is_active
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {toggling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{toggleTarget.is_active ? 'Deactivate Route' : 'Activate Route'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit External Provider Mapping Modal */}
      {mappingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {editingMapping ? 'Edit External Provider Mapping' : 'Add External Provider Mapping'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  External providers only. Does not alter active service route or provider credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMappingModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMapping} className="p-6 space-y-4">
              {mappingModalError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{mappingModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    External Provider *
                  </label>
                  <select
                    value={mapProviderId}
                    onChange={e => setMapProviderId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                  >
                    {externalIdentityProviders.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Service SKU *
                  </label>
                  <select
                    value={mapServiceKey}
                    onChange={e => setMapServiceKey(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs"
                  >
                    {services.map(s => (
                      <option key={s.service_key} value={s.service_key}>
                        {s.name} ({s.service_key})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Provider Service Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={mapPlanCode}
                    onChange={e => setMapPlanCode(e.target.value)}
                    placeholder="e.g. NIN_MOD_BASIC or BVN_V2"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Provider Wholesale Cost (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={mapWholesaleCost}
                    onChange={e => setMapWholesaleCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Provider API Endpoint Path *
                </label>
                <input
                  type="text"
                  required
                  value={mapEndpoint}
                  onChange={e => setMapEndpoint(e.target.value)}
                  placeholder="/api/v1/nin/verify"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Schema Verification Notes (Optional)
                </label>
                <input
                  type="text"
                  value={mapNotes}
                  onChange={e => setMapNotes(e.target.value)}
                  placeholder="Optional payload/response schema verification note..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="flex flex-wrap gap-6 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={mapIsActive}
                    onChange={e => setMapIsActive(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Mapping Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={mapSchemaVerified}
                    onChange={e => setMapSchemaVerified(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Provider Schema Verified</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setMappingModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMapping}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  {savingMapping ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{editingMapping ? 'Save Mapping' : 'Create Mapping'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Provider Mapping Confirmation Modal */}
      {deletingMapping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Delete External Mapping</h3>
              <button
                type="button"
                onClick={() => setDeletingMapping(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-slate-300">
                Delete the mapping between{' '}
                <span className="font-mono font-semibold text-white">
                  {deletingMapping.provider_id}
                </span>{' '}
                and{' '}
                <span className="font-mono font-semibold text-indigo-300">
                  {deletingMapping.service_key}
                </span>
                ? Historical orders remain unaffected.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeletingMapping(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingMappingBusy}
                  onClick={() => void handleDeleteMapping()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  {deletingMappingBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Delete Mapping</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
