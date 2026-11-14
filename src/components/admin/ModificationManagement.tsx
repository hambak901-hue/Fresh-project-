/**
 * @file ModificationManagement.tsx
 * Stage 3 — Dedicated Super Admin NIN & BVN Modifications Console.
 * Provides strictly scoped NIN vs BVN request queues, protected document inspection,
 * live 2SureVerify status polling, manual status management with atomic single-refund guards,
 * private wholesale cost & HAMBAK margin visibility, service turnaround configuration,
 * and BVN Modification enrollment type pricing management.
 */

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  ModificationAdminStats,
  ModificationBvnTypeItem,
  ModificationDocumentAttachment,
  ModificationRequestItem,
  ModificationServiceItem,
} from '../../types';
import { getModificationStatusStyle } from '../customer/ModificationSection';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Code2,
  DollarSign,
  Download,
  Edit3,
  Eye,
  FileText,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';

type AdminModTab = 'nin_requests' | 'bvn_requests' | 'all_requests' | 'services_config' | 'bvn_types';

export const ModificationManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminModTab>('nin_requests');
  const [requests, setRequests] = useState<ModificationRequestItem[]>([]);
  const [stats, setStats] = useState<ModificationAdminStats | null>(null);
  const [loadingRequests, setLoadingRequests] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Services Config state
  const [ninServices, setNinServices] = useState<ModificationServiceItem[]>([]);
  const [bvnServices, setBvnServices] = useState<ModificationServiceItem[]>([]);
  const [loadingServices, setLoadingServices] = useState<boolean>(false);
  const [serviceCatFilter, setServiceCatFilter] = useState<'ALL' | 'NIN' | 'BVN'>('ALL');
  const [editingService, setEditingService] = useState<ModificationServiceItem | null>(null);
  const [serviceModalTab, setServiceModalTab] = useState<'general' | 'fields' | 'documents' | 'mapping'>('general');
  const [savingService, setSavingService] = useState<boolean>(false);

  // BVN Types Config state
  const [bvnTypes, setBvnTypes] = useState<ModificationBvnTypeItem[]>([]);
  const [loadingBvnTypes, setLoadingBvnTypes] = useState<boolean>(false);
  const [bvnTypeEdits, setBvnTypeEdits] = useState<
    Record<string, { label: string; selling_price: number; wholesale_cost: number; is_active: boolean }>
  >({});
  const [savingBvnTypeId, setSavingBvnTypeId] = useState<string | null>(null);

  // Catalog Sync & Global Notifications
  const [syncingCatalog, setSyncingCatalog] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Request Detail Modal State
  const [selectedRequest, setSelectedRequest] = useState<ModificationRequestItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [updateStatusVal, setUpdateStatusVal] = useState<string>('pending');
  const [providerRemarksVal, setProviderRemarksVal] = useState<string>('');
  const [adminNotesVal, setAdminNotesVal] = useState<string>('');
  const [estCompletionVal, setEstCompletionVal] = useState<string>('');
  const [savingUpdate, setSavingUpdate] = useState<boolean>(false);

  // Protected Document Preview Modal
  const [docPreview, setDocPreview] = useState<{
    name: string;
    mimeType?: string;
    blobUrl: string;
  } | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'services_config') {
      loadServices();
    } else if (activeTab === 'bvn_types') {
      loadBvnTypes(false);
    } else {
      loadRequests();
    }
  }, [activeTab, statusFilter, page]);

  const resolveIdentityFilter = (): 'NIN' | 'BVN' | 'ALL' => {
    if (activeTab === 'nin_requests') return 'NIN';
    if (activeTab === 'bvn_requests') return 'BVN';
    return 'ALL';
  };

  const loadRequests = async () => {
    try {
      setLoadingRequests(true);
      setErrorMsg(null);
      const res = await api.getAdminModifications({
        identity_type: resolveIdentityFilter(),
        status: statusFilter,
        search: searchQuery.trim() || undefined,
        page,
        limit: 25,
      });
      if (res?.success) {
        setRequests(res.requests || []);
        setStats(res.stats || null);
        setTotalPages(res.pagination?.total_pages || 1);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load modification requests.');
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadServices = async () => {
    try {
      setLoadingServices(true);
      setErrorMsg(null);
      const res = await api.getAdminModificationServices();
      if (res?.success) {
        setNinServices(res.nin_modification || []);
        setBvnServices(res.bvn_modification || []);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load modification services catalog.');
    } finally {
      setLoadingServices(false);
    }
  };

  const loadBvnTypes = async (refresh = false) => {
    try {
      setLoadingBvnTypes(true);
      setErrorMsg(null);
      const res = await api.getAdminModificationBvnTypes(refresh);
      if (res?.success) {
        const list = res.bvn_types || [];
        setBvnTypes(list);
        const map: Record<
          string,
          { label: string; selling_price: number; wholesale_cost: number; is_active: boolean }
        > = {};
        list.forEach(item => {
          map[item.id] = {
            label: item.label,
            selling_price: Number(item.selling_price || 0),
            wholesale_cost: Number(item.wholesale_cost || 0),
            is_active: item.is_active !== false,
          };
        });
        setBvnTypeEdits(map);
        if (refresh && res.sync_note) {
          setFeedbackMsg(res.sync_note);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load BVN modification types.');
    } finally {
      setLoadingBvnTypes(false);
    }
  };

  const handleSyncLiveCatalog = async () => {
    try {
      setSyncingCatalog(true);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const res = await api.syncAdminModificationCatalog();
      if (res?.success) {
        setFeedbackMsg(
          res.message ||
            `Synced ${res.updated_services} wholesale service prices and ${res.bvn_types_count} BVN enrollment types.`
        );
        if (activeTab === 'services_config') {
          await loadServices();
        } else if (activeTab === 'bvn_types') {
          await loadBvnTypes(false);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Catalog synchronization failed.');
    } finally {
      setSyncingCatalog(false);
    }
  };

  const handleOpenDetail = async (req: ModificationRequestItem) => {
    setSelectedRequest(req);
    setUpdateStatusVal(req.status);
    setProviderRemarksVal(req.provider_remarks || '');
    setAdminNotesVal(req.admin_notes || '');
    setEstCompletionVal(req.estimated_completion_text || '');
    try {
      setLoadingDetail(true);
      const res = await api.getAdminModificationDetail(req.id);
      if (res?.success && res.request) {
        setSelectedRequest(res.request);
        setUpdateStatusVal(res.request.status);
        setProviderRemarksVal(res.request.provider_remarks || '');
        setAdminNotesVal(res.request.admin_notes || '');
        setEstCompletionVal(res.request.estimated_completion_text || '');
      }
    } catch {
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePollAdminRequest = async (id: string) => {
    try {
      setPollingId(id);
      setErrorMsg(null);
      const res = await api.pollAdminModificationStatus(id);
      if (res?.success && res.request) {
        setFeedbackMsg(res.message);
        setSelectedRequest(res.request);
        setUpdateStatusVal(res.request.status);
        setProviderRemarksVal(res.request.provider_remarks || '');
        await loadRequests();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to poll 2SureVerify for status update.');
    } finally {
      setPollingId(null);
    }
  };

  const handleSaveRequestUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    try {
      setSavingUpdate(true);
      setErrorMsg(null);
      const res = await api.updateAdminModificationRequest(selectedRequest.id, {
        status: updateStatusVal,
        provider_remarks: providerRemarksVal.trim(),
        admin_notes: adminNotesVal.trim(),
        estimated_completion_text: estCompletionVal.trim(),
      });
      if (res?.success && res.request) {
        setFeedbackMsg(res.message || 'Modification request updated.');
        setSelectedRequest(res.request);
        setUpdateStatusVal(res.request.status);
        await loadRequests();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save modification update.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleOpenDocumentPreview = async (doc: ModificationDocumentAttachment) => {
    try {
      setLoadingDocId(doc.id);
      const blobUrl = await api.fetchProtectedDocumentBlob(doc.file_url);
      setDocPreview({
        name: doc.original_name || doc.file_name || doc.doc_key,
        mimeType: doc.mime_type,
        blobUrl,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load supporting document.');
    } finally {
      setLoadingDocId(null);
    }
  };

  const openEditServiceModal = (srv: ModificationServiceItem) => {
    setEditingService({
      ...srv,
      required_fields: [...(srv.required_fields || [])],
      required_documents: (srv.required_documents || []).map(d => ({
        ...d,
        accepted_formats: d.accepted_formats ? [...d.accepted_formats] : ['JPG', 'PNG', 'WEBP', 'PDF'],
        max_size_mb: d.max_size_mb ?? 5,
      })),
      form_schema: (srv.form_schema || []).map(f => ({
        ...f,
        options: f.options ? [...f.options] : undefined,
        conditional_on: f.conditional_on
          ? { field: f.conditional_on.field, values: [...f.conditional_on.values] }
          : undefined,
      })),
    });
    setServiceModalTab('general');
  };

  const handleSaveServiceConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    try {
      setSavingService(true);
      setErrorMsg(null);
      const key = editingService.service_key || editingService.key;
      const cleanedSchema = (editingService.form_schema || [])
        .filter(f => f.key && f.key.trim() !== '')
        .map(f => ({
          ...f,
          key: f.key.trim(),
          label: (f.label || f.key).trim(),
          type: f.type || 'text',
          required: Boolean(f.required),
          placeholder: f.placeholder?.trim() || undefined,
          help_text: f.help_text?.trim() || f.helper?.trim() || undefined,
          provider_param: f.provider_param?.trim() || f.key.trim(),
          maxLength: f.maxLength && Number(f.maxLength) > 0 ? Number(f.maxLength) : undefined,
          options:
            f.type === 'select' && f.options && f.options.length > 0
              ? f.options
                  .map(o => {
                    const val = String(o?.value ?? '').trim();
                    const lbl = String(o?.label ?? val).trim();
                    return val ? { value: val, label: lbl || val } : null;
                  })
                  .filter((o): o is { value: string; label: string } => o !== null)
              : undefined,
          conditional_on:
            f.conditional_on && f.conditional_on.field.trim() && f.conditional_on.values.length > 0
              ? {
                  field: f.conditional_on.field.trim(),
                  values: f.conditional_on.values.map(v => v.trim()).filter(Boolean),
                }
              : undefined,
        }));
      const cleanedDocs = (editingService.required_documents || [])
        .filter(d => d.key && d.key.trim() !== '')
        .map(d => ({
          ...d,
          key: d.key.trim(),
          label: (d.label || d.key).trim(),
          required: Boolean(d.required),
          description: d.description?.trim() || undefined,
          provider_file_param: d.provider_file_param?.trim() || d.key.trim(),
          accepted_formats:
            d.accepted_formats && d.accepted_formats.length > 0
              ? d.accepted_formats.map(x => x.trim().toUpperCase()).filter(Boolean)
              : ['JPG', 'PNG', 'WEBP', 'PDF'],
          max_size_mb: d.max_size_mb && Number(d.max_size_mb) > 0 ? Number(d.max_size_mb) : 5,
        }));
      const derivedRequiredFields = cleanedSchema.filter(f => f.required).map(f => f.key);

      const res = await api.updateAdminModificationService(key, {
        name: editingService.name,
        description: editingService.description,
        selling_price: Number(editingService.selling_price),
        wholesale_cost: Number(editingService.wholesale_cost ?? 0),
        is_active: editingService.is_active,
        manual_label: editingService.manual_label,
        estimated_turnaround: editingService.estimated_turnaround,
        supported_notes: editingService.supported_notes,
        endpoint: editingService.endpoint,
        provider_id: editingService.provider_id,
        required_fields: derivedRequiredFields,
        required_documents: cleanedDocs,
        form_schema: cleanedSchema,
      });
      if (res?.success) {
        setFeedbackMsg(res.message || 'Service configuration & form schema saved.');
        setEditingService(null);
        await loadServices();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update modification service.');
    } finally {
      setSavingService(false);
    }
  };

  const handleSaveBvnType = async (id: string) => {
    const edit = bvnTypeEdits[id];
    if (!edit) return;
    try {
      setSavingBvnTypeId(id);
      setErrorMsg(null);
      const res = await api.updateAdminModificationBvnType(id, {
        label: edit.label,
        selling_price: Number(edit.selling_price),
        wholesale_cost: Number(edit.wholesale_cost),
        is_active: edit.is_active,
      });
      if (res?.success) {
        setFeedbackMsg(res.message || 'BVN enrollment type updated.');
        await loadBvnTypes(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save BVN enrollment type.');
    } finally {
      setSavingBvnTypeId(null);
    }
  };

  const displayedServices =
    serviceCatFilter === 'NIN'
      ? ninServices
      : serviceCatFilter === 'BVN'
      ? bvnServices
      : [...ninServices, ...bvnServices];

  const isSelectedDestructiveStatus =
    (updateStatusVal === 'failed' || updateStatusVal === 'rejected') &&
    selectedRequest &&
    !selectedRequest.refund_reference &&
    selectedRequest.status !== 'refunded';

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Header & Top Action */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-emerald-400">
            Stage 3 &middot; Sovereign Manual Operations
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
            NIN &amp; BVN Modifications Management
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Manage strictly separated NIN and BVN modification queues, inspect uploaded documents, poll live 2SureVerify statuses, audit margins, and configure service turnaround rules.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleSyncLiveCatalog}
            disabled={syncingCatalog}
            className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingCatalog ? 'animate-spin' : ''}`} />
            <span>{syncingCatalog ? 'Syncing Catalog...' : 'Sync Live 2SureVerify Catalog'}</span>
          </button>
        </div>
      </div>

      {/* Feedback / Error Alerts */}
      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button type="button" onClick={() => setFeedbackMsg(null)} className="text-[11px] font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-[11px] font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Executive KPI Strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
              Total Requests
            </span>
            <span className="text-lg font-extrabold font-mono text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {stats.total_all ?? (stats as any).total ?? 0}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {stats.nin_count ?? 0} NIN &middot; {stats.bvn_count ?? 0} BVN
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
              Pending / Processing
            </span>
            <span className="text-lg font-extrabold font-mono text-amber-600 dark:text-amber-400 tabular-nums mt-0.5 block">
              {Number(stats.pending_count ?? (stats as any).pending ?? 0) +
                Number(stats.processing_count ?? (stats as any).processing ?? 0)}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {stats.query_count ?? (stats as any).query ?? 0} queries
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
              Completed
            </span>
            <span className="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">
              {stats.completed_count ?? (stats as any).completed ?? 0}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {stats.refunded_count ?? (stats as any).refunded ?? 0} refunded
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
              Customer Revenue
            </span>
            <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              ₦{Number(stats.total_revenue || 0).toLocaleString('en-NG')}
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
              Provider Wholesale Cost
            </span>
            <span className="text-base font-extrabold font-mono text-slate-600 dark:text-slate-300 tabular-nums mt-0.5 block">
              ₦{Number(stats.total_provider_cost || 0).toLocaleString('en-NG')}
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
              HAMBAK Net Margin
            </span>
            <span className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">
              +₦{Number(stats.total_margin || 0).toLocaleString('en-NG')}
            </span>
          </div>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'nin_requests', label: 'NIN Modification Requests', icon: ShieldCheck },
          { id: 'bvn_requests', label: 'BVN Modification Requests', icon: Layers },
          { id: 'all_requests', label: 'All Requests', icon: FileText },
          { id: 'services_config', label: 'Service & Pricing Config', icon: Settings },
          { id: 'bvn_types', label: 'BVN Enrollment Types', icon: DollarSign },
        ].map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id as AdminModTab);
                setPage(1);
              }}
              className={`px-3.5 py-2.5 rounded-xl font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition ${
                active
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. REQUEST QUEUES (NIN / BVN / ALL) */}
      {(activeTab === 'nin_requests' || activeTab === 'bvn_requests' || activeTab === 'all_requests') && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setPage(1);
                      loadRequests();
                    }
                  }}
                  placeholder="Search request #, customer name, email, or reference..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  loadRequests();
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-semibold"
              >
                Search
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'processing', label: 'Processing' },
                { id: 'query_required', label: 'Query Required' },
                { id: 'completed', label: 'Completed' },
                { id: 'refunded', label: 'Refunded' },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st.id);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                    statusFilter === st.id
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
              <button
                type="button"
                onClick={loadRequests}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                title="Refresh queue"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Request &amp; Service</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Domain &amp; Masked ID</th>
                  <th className="py-3 px-3 text-right">Customer / Cost / Margin</th>
                  <th className="py-3 px-3">Status &amp; Turnaround</th>
                  <th className="py-3 px-3">Submitted</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loadingRequests && requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      Loading modification requests...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                      No {activeTab === 'nin_requests' ? 'NIN' : activeTab === 'bvn_requests' ? 'BVN' : ''} modification requests match this filter.
                    </td>
                  </tr>
                ) : (
                  requests.map(req => {
                    const st = getModificationStatusStyle(req.status);
                    return (
                      <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            {req.request_number}
                          </div>
                          <div className="text-slate-700 dark:text-slate-300 font-semibold mt-0.5">
                            {req.service_name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            Pay: {req.payment_reference}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {req.customer_name || 'Customer'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {req.customer_email || ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              req.identity_type === 'BVN'
                                ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                                : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                            }`}
                          >
                            {req.identity_type}
                          </span>
                          <div className="font-mono text-slate-700 dark:text-slate-300 mt-1">
                            {req.masked_identifier}
                          </div>
                          {req.enrollment_type && (
                            <div className="text-[10px] text-slate-500">{req.enrollment_type}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          <div className="font-bold text-slate-900 dark:text-white">
                            ₦{Number(req.customer_price).toLocaleString('en-NG')}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Cost: ₦{Number(req.provider_cost || 0).toLocaleString('en-NG')}
                          </div>
                          <div
                            className={`text-[10px] font-bold ${
                              Number(req.profit || 0) >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-500'
                            }`}
                          >
                            Margin: +₦{Number(req.profit || 0).toLocaleString('en-NG')}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${st.classes}`}>
                            {st.label}
                          </span>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                            {req.estimated_completion_text}
                          </div>
                          {req.refund_reference && (
                            <div className="text-[10px] font-mono text-purple-600 dark:text-purple-300 mt-0.5">
                              {req.refund_reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                          {new Date(req.created_at).toLocaleString('en-NG')}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(req)}
                            className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. SERVICE & PRICING CONFIGURATION TAB */}
      {activeTab === 'services_config' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Modification Services Pricing, Turnaround &amp; Endpoints
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure customer selling prices, private wholesale tariffs, manual processing labels, and turnaround SLAs across all NIN &amp; BVN modification services.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {(['ALL', 'NIN', 'BVN'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setServiceCatFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                    serviceCatFilter === f
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {f === 'ALL'
                    ? `All (${ninServices.length + bvnServices.length})`
                    : f === 'NIN'
                    ? `NIN Mod (${ninServices.length})`
                    : `BVN Mod (${bvnServices.length})`}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Service &amp; 2SureVerify Endpoint</th>
                  <th className="py-3 px-3">Domain</th>
                  <th className="py-3 px-3 text-right">Wholesale Cost</th>
                  <th className="py-3 px-3 text-right">Customer Price</th>
                  <th className="py-3 px-3 text-right">Net Margin</th>
                  <th className="py-3 px-3">Turnaround &amp; Label</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loadingServices ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      Loading modification service catalog...
                    </td>
                  </tr>
                ) : (
                  displayedServices.map(srv => (
                    <tr key={srv.key || srv.service_key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{srv.name}</div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          {srv.service_key || srv.key} &middot; {srv.endpoint}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {(srv.form_schema || []).length} fields &middot; {(srv.required_documents || []).length} docs
                          {srv.provider_schema_verified === false && (
                            <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">
                              &middot; Verify provider schema
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            srv.identity_type === 'BVN'
                              ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                              : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {srv.identity_type} Modification
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                        ₦{Number(srv.wholesale_cost || 0).toLocaleString('en-NG')}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        ₦{Number(srv.selling_price || 0).toLocaleString('en-NG')}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            Number(srv.profit || 0) >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-500'
                          }`}
                        >
                          +₦{Number(srv.profit || 0).toLocaleString('en-NG')}
                        </span>
                        <div className="text-[10px] text-slate-500">({srv.margin_percent ?? 0}%)</div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="text-slate-900 dark:text-white font-semibold">
                          {srv.manual_label || 'Manual Processing'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {srv.estimated_turnaround}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            srv.is_active
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {srv.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditServiceModal(srv)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. BVN ENROLLMENT TYPES TAB */}
      {activeTab === 'bvn_types' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                BVN Modification Enrollment Types &amp; Bank Pricing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Set individual customer selling prices and review private wholesale costs synced from 2SureVerify /bvn_modification_banks.php.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadBvnTypes(true)}
              disabled={loadingBvnTypes}
              className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBvnTypes ? 'animate-spin' : ''}`} />
              <span>Fetch Live Bank Types</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Enrollment Type Code</th>
                  <th className="py-3 px-3">Customer Display Label</th>
                  <th className="py-3 px-3 text-right">Wholesale Cost (₦)</th>
                  <th className="py-3 px-3 text-right">Customer Price (₦)</th>
                  <th className="py-3 px-3 text-right">Margin</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {bvnTypes.map(bt => {
                  const edit = bvnTypeEdits[bt.id] || {
                    label: bt.label,
                    selling_price: bt.selling_price,
                    wholesale_cost: bt.wholesale_cost || 0,
                    is_active: bt.is_active,
                  };
                  const margin = Number(edit.selling_price) - Number(edit.wholesale_cost);
                  return (
                    <tr key={bt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {bt.enrollment_type}
                      </td>
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={edit.label}
                          onChange={e =>
                            setBvnTypeEdits(prev => ({
                              ...prev,
                              [bt.id]: { ...edit, label: e.target.value },
                            }))
                          }
                          className="w-full min-w-[180px] px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={edit.wholesale_cost}
                          onChange={e =>
                            setBvnTypeEdits(prev => ({
                              ...prev,
                              [bt.id]: { ...edit, wholesale_cost: Number(e.target.value) },
                            }))
                          }
                          className="w-28 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-right font-mono text-xs text-slate-700 dark:text-slate-300"
                        />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={edit.selling_price}
                          onChange={e =>
                            setBvnTypeEdits(prev => ({
                              ...prev,
                              [bt.id]: { ...edit, selling_price: Number(e.target.value) },
                            }))
                          }
                          className="w-28 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-right font-mono font-bold text-xs text-slate-900 dark:text-white"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold">
                        <span className={margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
                          +₦{margin.toLocaleString('en-NG')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setBvnTypeEdits(prev => ({
                              ...prev,
                              [bt.id]: { ...edit, is_active: !edit.is_active },
                            }))
                          }
                          className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                            edit.is_active
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {edit.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveBvnType(bt.id)}
                          disabled={savingBvnTypeId === bt.id}
                          className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          {savingBvnTypeId === bt.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          <span>Save</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REQUEST DETAIL & ACTION MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-8">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                    {selectedRequest.request_number}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                      getModificationStatusStyle(selectedRequest.status).classes
                    }`}
                  >
                    {getModificationStatusStyle(selectedRequest.status).label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedRequest.service_name} &middot; {selectedRequest.customer_name} ({selectedRequest.customer_email})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePollAdminRequest(selectedRequest.id)}
                  disabled={pollingId === selectedRequest.id}
                  className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pollingId === selectedRequest.id ? 'animate-spin' : ''}`} />
                  <span>Poll 2SureVerify</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
              {loadingDetail && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-emerald-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Refreshing full audit detail...</span>
                </div>
              )}

              {/* Financial & Audit Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">Customer Price</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ₦{Number(selectedRequest.customer_price).toLocaleString('en-NG')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">Provider Wholesale</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    ₦{Number(selectedRequest.provider_cost || 0).toLocaleString('en-NG')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">HAMBAK Margin</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    +₦{Number(selectedRequest.profit || 0).toLocaleString('en-NG')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 block">Provider Ref</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white break-all">
                    {selectedRequest.provider_reference || 'N/A'}
                  </span>
                </div>
              </div>

              {selectedRequest.refund_reference && (
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/25 text-xs text-purple-800 dark:text-purple-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Single Atomic Wallet Refund Completed &middot; Ref:{' '}
                    <strong className="font-mono">{selectedRequest.refund_reference}</strong>
                  </span>
                </div>
              )}

              {/* Submitted Form Fields */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Submitted Modification Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Object.entries(selectedRequest.submitted_fields || {}).map(([k, v]) => (
                    <div
                      key={k}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                        {k.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white break-words">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Supporting Documents */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Uploaded Supporting Documents
                </h4>
                {(selectedRequest.supporting_documents || []).length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No files uploaded with this request.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedRequest.supporting_documents.map(doc => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => handleOpenDocumentPreview(doc)}
                        disabled={loadingDocId === doc.id}
                        className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition"
                      >
                        {loadingDocId === doc.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
                        )}
                        <span>{doc.original_name || doc.file_name || doc.doc_key}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Admin Update Form */}
              <form
                onSubmit={handleSaveRequestUpdate}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Administrative Review &amp; Status Update
                </h4>

                {isSelectedDestructiveStatus && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Warning: Setting status to <strong>{updateStatusVal.toUpperCase()}</strong> will automatically issue a single atomic wallet refund (
                      <span className="font-mono">REFUND_{selectedRequest.payment_reference}</span>) to the customer and notify them by email.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Request Status
                    </label>
                    <select
                      value={updateStatusVal}
                      onChange={e => setUpdateStatusVal(e.target.value)}
                      disabled={selectedRequest.status === 'refunded'}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white disabled:opacity-60"
                    >
                      <option value="pending">Pending Manual Processing</option>
                      <option value="processing">Processing</option>
                      <option value="query_required">Query / Additional Info Required</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Rejected (Issues Single Refund)</option>
                      <option value="failed">Failed (Issues Single Refund)</option>
                      {selectedRequest.status === 'refunded' && (
                        <option value="refunded">Refunded</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Estimated Turnaround Text
                    </label>
                    <input
                      type="text"
                      value={estCompletionVal}
                      onChange={e => setEstCompletionVal(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Customer-Visible Remarks / Query Message
                  </label>
                  <textarea
                    rows={2}
                    value={providerRemarksVal}
                    onChange={e => setProviderRemarksVal(e.target.value)}
                    placeholder="Message sent to customer (e.g., query details, completion note, or rejection reason)..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Internal Admin Audit Notes (Hidden from customer)
                  </label>
                  <textarea
                    rows={2}
                    value={adminNotesVal}
                    onChange={e => setAdminNotesVal(e.target.value)}
                    placeholder="Internal review comments..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRequest(null)}
                    className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={savingUpdate}
                    className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-bold inline-flex items-center gap-1.5"
                  >
                    {savingUpdate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save &amp; Notify Customer</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SERVICE SCHEMA & CONFIGURATION MODAL */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl my-4">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-blue-700 dark:text-emerald-400">
                  {editingService.identity_type} Modification &middot; {editingService.service_key || editingService.key}
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Configure Service &amp; Form Schema: {editingService.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Configurator Sub-Tabs */}
            <div className="px-6 pt-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0">
              {[
                { id: 'general', label: 'General & Pricing' },
                { id: 'fields', label: `Form Fields (${(editingService.form_schema || []).length})` },
                { id: 'documents', label: `Supporting Docs (${(editingService.required_documents || []).length})` },
                { id: 'mapping', label: 'API Payload Mapping' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setServiceModalTab(tab.id as any)}
                  className={`px-3.5 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition ${
                    serviceModalTab === tab.id
                      ? 'border-blue-600 text-blue-700 dark:text-emerald-400 dark:border-emerald-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveServiceConfig} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {serviceModalTab === 'general' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Service Title
                        </label>
                        <input
                          type="text"
                          required
                          value={editingService.name}
                          onChange={e => setEditingService({ ...editingService, name: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Manual Processing Label
                        </label>
                        <input
                          type="text"
                          value={editingService.manual_label}
                          onChange={e => setEditingService({ ...editingService, manual_label: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Wholesale Cost (₦ Private)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editingService.wholesale_cost ?? 0}
                          onChange={e =>
                            setEditingService({ ...editingService, wholesale_cost: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Customer Selling Price (₦)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editingService.selling_price}
                          onChange={e =>
                            setEditingService({ ...editingService, selling_price: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Estimated Turnaround Time
                        </label>
                        <input
                          type="text"
                          value={editingService.estimated_turnaround}
                          onChange={e =>
                            setEditingService({ ...editingService, estimated_turnaround: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          2SureVerify Endpoint
                        </label>
                        <input
                          type="text"
                          value={editingService.endpoint || ''}
                          onChange={e => setEditingService({ ...editingService, endpoint: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Customer Service Description
                      </label>
                      <textarea
                        rows={2}
                        value={editingService.description}
                        onChange={e => setEditingService({ ...editingService, description: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Important Guidance / Notes
                      </label>
                      <textarea
                        rows={2}
                        value={editingService.supported_notes || ''}
                        onChange={e => setEditingService({ ...editingService, supported_notes: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingService.is_active}
                        onChange={e => setEditingService({ ...editingService, is_active: e.target.checked })}
                        className="rounded text-blue-600"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Service Active &amp; Visible to Customers
                      </span>
                    </label>
                  </>
                )}

                {serviceModalTab === 'fields' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Customize customer input fields, validation rules, help text, conditional visibility, and the mapped 2SureVerify parameter name for each field.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const current = editingService.form_schema || [];
                          setEditingService({
                            ...editingService,
                            form_schema: [
                              ...current,
                              {
                                key: `custom_field_${current.length + 1}`,
                                label: 'New Field',
                                type: 'text',
                                required: false,
                                placeholder: '',
                                help_text: '',
                                provider_param: `custom_field_${current.length + 1}`,
                              },
                            ],
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Field</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {(editingService.form_schema || []).map((field, idx) => {
                        const schemaList = editingService.form_schema || [];
                        const updateField = (patch: Partial<typeof field>) => {
                          const next = schemaList.map((item, i) => (i === idx ? { ...item, ...patch } : item));
                          setEditingService({ ...editingService, form_schema: next });
                        };
                        const moveField = (dir: -1 | 1) => {
                          const targetIdx = idx + dir;
                          if (targetIdx < 0 || targetIdx >= schemaList.length) return;
                          const next = [...schemaList];
                          const [moved] = next.splice(idx, 1);
                          next.splice(targetIdx, 0, moved);
                          setEditingService({ ...editingService, form_schema: next });
                        };
                        const removeField = () => {
                          setEditingService({
                            ...editingService,
                            form_schema: schemaList.filter((_, i) => i !== idx),
                          });
                        };

                        return (
                          <div
                            key={`${idx}_${field.key}`}
                            className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-slate-900 dark:text-white">
                                #{idx + 1} &middot; {field.label || field.key}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveField(-1)}
                                  disabled={idx === 0}
                                  className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-600 dark:text-slate-300"
                                  title="Move up"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveField(1)}
                                  disabled={idx === schemaList.length - 1}
                                  className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-600 dark:text-slate-300"
                                  title="Move down"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={removeField}
                                  className="p-1 rounded border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                                  title="Remove field"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Field Key
                                </label>
                                <input
                                  type="text"
                                  value={field.key}
                                  onChange={e => updateField({ key: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Customer Label
                                </label>
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={e => updateField({ label: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Input Type
                                </label>
                                <select
                                  value={field.type}
                                  onChange={e => updateField({ type: e.target.value as any })}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white"
                                >
                                  <option value="text">Text</option>
                                  <option value="tel">Phone / Numeric (tel)</option>
                                  <option value="email">Email</option>
                                  <option value="date">Date</option>
                                  <option value="select">Dropdown (select)</option>
                                  <option value="textarea">Multi-line (textarea)</option>
                                  <option value="password">Secret / Password</option>
                                  <option value="bvn_enrollment_type">BVN Enrollment Type</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Provider API Param
                                </label>
                                <input
                                  type="text"
                                  value={field.provider_param || field.key}
                                  onChange={e => updateField({ provider_param: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-indigo-700 dark:text-indigo-300"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Placeholder
                                </label>
                                <input
                                  type="text"
                                  value={field.placeholder || ''}
                                  onChange={e => updateField({ placeholder: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Help Text
                                </label>
                                <input
                                  type="text"
                                  value={field.help_text || field.helper || ''}
                                  onChange={e => updateField({ help_text: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white"
                                />
                              </div>
                              <div className="flex items-center gap-3 pb-1">
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(field.required)}
                                    onChange={e => updateField({ required: e.target.checked })}
                                    className="rounded text-blue-600"
                                  />
                                  <span>Required</span>
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-500">MaxLen</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={field.maxLength ?? ''}
                                    onChange={e =>
                                      updateField({
                                        maxLength: e.target.value ? Number(e.target.value) : undefined,
                                      })
                                    }
                                    className="w-16 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white"
                                  />
                                </div>
                              </div>
                            </div>

                            {field.type === 'select' && (
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Dropdown Options (comma-separated, optional value:Label)
                                </label>
                                <input
                                  type="text"
                                  value={(field.options || [])
                                    .map(o =>
                                      o.label && o.label !== o.value ? `${o.value}:${o.label}` : o.value
                                    )
                                    .join(', ')}
                                  onChange={e =>
                                    updateField({
                                      options: e.target.value.split(',').map(raw => {
                                        const part = raw.trim();
                                        const colonIdx = part.indexOf(':');
                                        if (colonIdx > 0) {
                                          return {
                                            value: part.slice(0, colonIdx).trim(),
                                            label: part.slice(colonIdx + 1).trim(),
                                          };
                                        }
                                        return { value: part, label: part };
                                      }),
                                    })
                                  }
                                  placeholder="Male, Female or dob:Date of Birth"
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white"
                                />
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Conditional Field Key (optional)
                                </label>
                                <input
                                  type="text"
                                  value={field.conditional_on?.field || ''}
                                  onChange={e =>
                                    updateField({
                                      conditional_on: e.target.value
                                        ? {
                                            field: e.target.value,
                                            values: field.conditional_on?.values || [],
                                          }
                                        : undefined,
                                    })
                                  }
                                  placeholder="e.g. field_to_modify"
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Show When Value Matches (comma-separated)
                                </label>
                                <input
                                  type="text"
                                  value={(field.conditional_on?.values || []).join(', ')}
                                  disabled={!field.conditional_on?.field}
                                  onChange={e =>
                                    updateField({
                                      conditional_on: field.conditional_on?.field
                                        ? {
                                            field: field.conditional_on.field,
                                            values: e.target.value.split(',').map(v => v.trim()),
                                          }
                                        : undefined,
                                    })
                                  }
                                  placeholder="dob, name_and_dob"
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white disabled:opacity-50"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {serviceModalTab === 'documents' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Configure required and optional supporting documents, accepted file formats, max upload size, and 2SureVerify multipart file parameter names.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const current = editingService.required_documents || [];
                          setEditingService({
                            ...editingService,
                            required_documents: [
                              ...current,
                              {
                                key: `supporting_doc_${current.length + 1}`,
                                label: 'Supporting Document',
                                required: true,
                                description: '',
                                accepted_formats: ['JPG', 'PNG', 'WEBP', 'PDF'],
                                max_size_mb: 5,
                                provider_file_param: `supporting_doc_${current.length + 1}`,
                              },
                            ],
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Document</span>
                      </button>
                    </div>

                    {(editingService.required_documents || []).map((doc, idx) => {
                      const docList = editingService.required_documents || [];
                      const updateDoc = (patch: Partial<typeof doc>) => {
                        setEditingService({
                          ...editingService,
                          required_documents: docList.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
                        });
                      };
                      return (
                        <div
                          key={`${idx}_${doc.key}`}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-900 dark:text-white">
                              Document #{idx + 1}: {doc.label || doc.key}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingService({
                                  ...editingService,
                                  required_documents: docList.filter((_, i) => i !== idx),
                                })
                              }
                              className="p-1 rounded border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Document Key
                              </label>
                              <input
                                type="text"
                                value={doc.key}
                                onChange={e => updateDoc({ key: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Customer Display Label
                              </label>
                              <input
                                type="text"
                                value={doc.label}
                                onChange={e => updateDoc({ label: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Provider File Parameter
                              </label>
                              <input
                                type="text"
                                value={doc.provider_file_param || doc.key}
                                onChange={e => updateDoc({ provider_file_param: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-indigo-700 dark:text-indigo-300"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Instructions / Description
                              </label>
                              <input
                                type="text"
                                value={doc.description || ''}
                                onChange={e => updateDoc({ description: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                Accepted Formats (comma-separated)
                              </label>
                              <input
                                type="text"
                                value={(doc.accepted_formats || ['JPG', 'PNG', 'WEBP', 'PDF']).join(', ')}
                                onChange={e =>
                                  updateDoc({
                                    accepted_formats: e.target.value.split(',').map(x => x.trim().toUpperCase()),
                                  })
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white"
                              />
                            </div>
                            <div className="flex items-center gap-3 pb-1">
                              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(doc.required)}
                                  onChange={e => updateDoc({ required: e.target.checked })}
                                  className="rounded text-blue-600"
                                />
                                <span>Mandatory</span>
                              </label>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">Max MB</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={25}
                                  value={doc.max_size_mb ?? 5}
                                  onChange={e => updateDoc({ max_size_mb: Number(e.target.value) || 5 })}
                                  className="w-16 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {serviceModalTab === 'mapping' && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start gap-2.5 text-[11px] leading-relaxed">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>2SureVerify Upstream Parameter Verification Notice:</strong>{' '}
                        {editingService.provider_schema_verified
                          ? 'Provider payload parameter mapping verified against live OpenAPI specification.'
                          : 'Public 2SureVerify API documentation (api_docs.php) verifies the endpoint URL, HTTP POST method, X-Api-Key/Bearer auth, and manual status polling, while exact per-endpoint parameter & multipart file keys require vendor OpenAPI confirmation. You can adjust any Provider API Param in the Form Fields & Supporting Docs tabs without code deployments.'}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                          Active Provider Endpoint
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white break-all">
                          POST https://2sureverify.com{editingService.endpoint}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                          Auth &amp; Status Polling
                        </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          X-Api-Key &middot; Poll GET /api/v1/status.php?reference=...
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                        <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400" />
                        <span className="text-[11px] font-bold text-slate-900 dark:text-white">
                          Field &amp; Document Parameter Dispatch Map
                        </span>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 text-[11px] font-mono">
                        {(editingService.form_schema || []).map(f => (
                          <div key={f.key} className="px-4 py-2 flex items-center justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-400">
                              form.{f.key} ({f.type}
                              {f.required ? ', req' : ''})
                            </span>
                            <span className="text-indigo-700 dark:text-indigo-300 font-bold">
                              &rarr; {f.provider_param || f.key}
                            </span>
                          </div>
                        ))}
                        {(editingService.required_documents || []).map(d => (
                          <div key={d.key} className="px-4 py-2 flex items-center justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-400">
                              file.{d.key} ({d.required ? 'mandatory' : 'optional'})
                            </span>
                            <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                              &rarr; multipart[{d.provider_file_param || d.key}]
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingService}
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-bold inline-flex items-center gap-1.5"
                >
                  {savingService ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Configuration &amp; Schema</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROTECTED SUPPORTING DOCUMENT PREVIEW MODAL */}
      {docPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{docPreview.name}</span>
              <div className="flex items-center gap-2">
                <a
                  href={docPreview.blobUrl}
                  download={docPreview.name}
                  className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(docPreview.blobUrl);
                    setDocPreview(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              {docPreview.mimeType === 'application/pdf' ? (
                <iframe src={docPreview.blobUrl} title={docPreview.name} className="w-full h-[65vh] rounded-lg bg-white" />
              ) : (
                <img
                  src={docPreview.blobUrl}
                  alt={docPreview.name}
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
