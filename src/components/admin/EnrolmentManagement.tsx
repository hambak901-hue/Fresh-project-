/**
 * @file EnrolmentManagement.tsx
 * Stage 4 — Super Admin HAMBAK Enrolment Centre Console.
 * Manages verified manual NIN Enrolment orders (Adult & Child),
 * protected customer document inspection, live 2SureVerify status polling,
 * manual status updates with single atomic wallet refund protection,
 * private wholesale cost & HAMBAK margin telemetry, customer-facing sample documents,
 * field/document schema configuration, and unverified service policy notices.
 */

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  EnrolmentAdminStats,
  EnrolmentOrderItem,
  EnrolmentSampleDocument,
  EnrolmentServiceItem,
  EnrolmentUnverifiedNotice,
  ModificationFormField,
  ModificationRequiredDocument,
} from '../../types';
import { getEnrolmentStatusStyle } from '../customer/EnrolmentSection';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
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
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';

type AdminEnrolmentTab = 'orders' | 'services';

export const EnrolmentManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminEnrolmentTab>('orders');

  // Orders state
  const [orders, setOrders] = useState<EnrolmentOrderItem[]>([]);
  const [stats, setStats] = useState<EnrolmentAdminStats | null>(null);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Order Detail Modal state
  const [selectedOrder, setSelectedOrder] = useState<EnrolmentOrderItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [updateStatusVal, setUpdateStatusVal] = useState<string>('pending');
  const [providerRemarksVal, setProviderRemarksVal] = useState<string>('');
  const [adminNotesVal, setAdminNotesVal] = useState<string>('');
  const [estCompletionVal, setEstCompletionVal] = useState<string>('');
  const [triggerRefundVal, setTriggerRefundVal] = useState<boolean>(true);
  const [savingUpdate, setSavingUpdate] = useState<boolean>(false);
  const [retryingResultId, setRetryingResultId] = useState<string | null>(null);
  const [adminResultFile, setAdminResultFile] = useState<File | null>(null);
  const [adminResultTrackingId, setAdminResultTrackingId] = useState<string>('');
  const [adminResultRemarks, setAdminResultRemarks] = useState<string>('');
  const [adminResultMarkCompleted, setAdminResultMarkCompleted] = useState<boolean>(true);
  const [adminResultNotifyCustomer, setAdminResultNotifyCustomer] = useState<boolean>(true);
  const [uploadingResultPdf, setUploadingResultPdf] = useState<boolean>(false);

  // Services & Unverified Guardrails state
  const [services, setServices] = useState<EnrolmentServiceItem[]>([]);
  const [unverifiedNotices, setUnverifiedNotices] = useState<EnrolmentUnverifiedNotice[]>([]);
  const [loadingServices, setLoadingServices] = useState<boolean>(false);
  const [syncingCatalog, setSyncingCatalog] = useState<boolean>(false);

  // Service Editor Modal state
  const [editingService, setEditingService] = useState<EnrolmentServiceItem | null>(null);
  const [serviceModalTab, setServiceModalTab] = useState<'general' | 'samples' | 'fields' | 'documents'>('general');
  const [savingService, setSavingService] = useState<boolean>(false);

  // Sample Upload state inside Service Editor
  const [sampleTitle, setSampleTitle] = useState<string>('');
  const [sampleDesc, setSampleDesc] = useState<string>('');
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [uploadingSample, setUploadingSample] = useState<boolean>(false);
  const [deletingSampleId, setDeletingSampleId] = useState<string | null>(null);

  // Protected File Preview Modal
  const [docPreview, setDocPreview] = useState<{
    name: string;
    mimeType?: string;
    blobUrl: string;
  } | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

  // Global notifications
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders();
    } else {
      loadServices();
    }
  }, [activeTab, serviceFilter, statusFilter, page]);

  const loadOrders = async () => {
    try {
      setLoadingOrders(true);
      setErrorMsg(null);
      const res = await api.getAdminEnrolments({
        service_key: serviceFilter,
        status: statusFilter,
        search: searchQuery.trim() || undefined,
        page,
        limit: 25,
      });
      if (res?.success) {
        setOrders(res.orders || []);
        setStats(res.stats || null);
        setTotalPages(res.pagination?.total_pages || 1);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load NIN Enrolment orders.');
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadServices = async () => {
    try {
      setLoadingServices(true);
      setErrorMsg(null);
      const res = await api.getAdminEnrolmentServices();
      if (res?.success) {
        setServices(res.services || []);
        setUnverifiedNotices(res.unverified_services || []);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load NIN Enrolment service configuration.');
    } finally {
      setLoadingServices(false);
    }
  };

  const handleSyncCatalog = async () => {
    try {
      setSyncingCatalog(true);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const res = await api.syncAdminEnrolmentCatalog();
      if (res?.success) {
        setFeedbackMsg(
          res.message || `Synchronized ${res.updated_services} wholesale provider costs.`
        );
        await loadServices();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to sync wholesale costs from provider.');
    } finally {
      setSyncingCatalog(false);
    }
  };

  const handleOpenDetail = async (ord: EnrolmentOrderItem) => {
    setSelectedOrder(ord);
    setUpdateStatusVal(ord.status);
    setProviderRemarksVal(ord.provider_remarks || '');
    setAdminNotesVal(ord.admin_notes || '');
    setEstCompletionVal(ord.estimated_completion_text || '');
    setTriggerRefundVal(true);
    setAdminResultFile(null);
    setAdminResultTrackingId(ord.provider_tracking_id || '');
    setAdminResultRemarks('');
    setAdminResultMarkCompleted(true);
    setAdminResultNotifyCustomer(true);
    try {
      setLoadingDetail(true);
      const res = await api.getAdminEnrolmentDetail(ord.id);
      if (res?.success && res.order) {
        setSelectedOrder(res.order);
        setUpdateStatusVal(res.order.status);
        setProviderRemarksVal(res.order.provider_remarks || '');
        setAdminNotesVal(res.order.admin_notes || '');
        setEstCompletionVal(res.order.estimated_completion_text || '');
        setAdminResultTrackingId(res.order.provider_tracking_id || '');
      }
    } catch {
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePollOrder = async (id: string) => {
    try {
      setPollingId(id);
      setErrorMsg(null);
      const res = await api.pollAdminEnrolmentStatus(id);
      if (res?.success && res.order) {
        setFeedbackMsg(res.message);
        setSelectedOrder(res.order);
        setUpdateStatusVal(res.order.status);
        setProviderRemarksVal(res.order.provider_remarks || '');
        await loadOrders();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to poll 2SureVerify for status update.');
    } finally {
      setPollingId(null);
    }
  };

  const handleSaveOrderUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      setSavingUpdate(true);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const res = await api.updateAdminEnrolmentOrder(selectedOrder.id, {
        status: updateStatusVal,
        provider_remarks: providerRemarksVal,
        admin_notes: adminNotesVal,
        estimated_completion_text: estCompletionVal,
        trigger_refund: triggerRefundVal,
      });
      if (res?.success && res.order) {
        setSelectedOrder(res.order);
        setUpdateStatusVal(res.order.status);
        setFeedbackMsg(
          res.refund?.refunded
            ? `Order updated & wallet refunded cleanly (${res.refund.refund_reference}).`
            : res.message || 'Enrolment order updated.'
        );
        await loadOrders();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update enrolment order.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleRetryEnrolmentResultFetch = async (id: string) => {
    try {
      setRetryingResultId(id);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const res = await api.retryAdminEnrolmentResult(id);
      if (res?.success && res.order) {
        setFeedbackMsg(res.message);
        setSelectedOrder(res.order);
        setUpdateStatusVal(res.order.status);
        setProviderRemarksVal(res.order.provider_remarks || '');
        setAdminResultTrackingId(res.order.provider_tracking_id || '');
        await loadOrders();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to retry provider result fetch.');
    } finally {
      setRetryingResultId(null);
    }
  };

  const handleAdminUploadEnrolmentResultPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !adminResultFile) {
      setErrorMsg('Please select a valid PDF document before uploading.');
      return;
    }
    try {
      setUploadingResultPdf(true);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const fd = new FormData();
      fd.append('file', adminResultFile);
      if (adminResultTrackingId.trim()) fd.append('tracking_id', adminResultTrackingId.trim());
      if (adminResultRemarks.trim()) fd.append('remarks', adminResultRemarks.trim());
      fd.append('mark_completed', adminResultMarkCompleted ? '1' : '0');
      fd.append('notify_customer', adminResultNotifyCustomer ? '1' : '0');

      const res = await api.uploadAdminEnrolmentResultDocument(selectedOrder.id, fd);
      if (res?.success && res.order) {
        setFeedbackMsg(res.message || 'Official enrolment PDF uploaded cleanly.');
        setSelectedOrder(res.order);
        setUpdateStatusVal(res.order.status);
        setProviderRemarksVal(res.order.provider_remarks || '');
        setAdminResultFile(null);
        await loadOrders();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to upload official enrolment PDF.');
    } finally {
      setUploadingResultPdf(false);
    }
  };

  const handleToggleServiceActive = async (srv: EnrolmentServiceItem) => {
    try {
      setErrorMsg(null);
      setFeedbackMsg(null);
      const nextActive = !(srv.is_active !== false);
      const res = await api.updateAdminEnrolmentService(srv.service_key || srv.key, {
        is_active: nextActive,
      });
      if (res?.success) {
        setFeedbackMsg(
          `${srv.name} ${nextActive ? 'enabled' : 'disabled'} for customer selection.`
        );
        await loadServices();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to update service status.');
    }
  };

  const handleOpenServiceEditor = (srv: EnrolmentServiceItem, tab: 'general' | 'samples' | 'fields' | 'documents' = 'general') => {
    setEditingService({
      ...srv,
      form_schema: JSON.parse(JSON.stringify(srv.form_schema || [])),
      required_documents: JSON.parse(JSON.stringify(srv.required_documents || [])),
      sample_documents: [...(srv.sample_documents || [])],
    });
    setServiceModalTab(tab);
    setSampleTitle('');
    setSampleDesc('');
    setSampleFile(null);
  };

  const handleSaveServiceConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    try {
      setSavingService(true);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const reqFields = (editingService.form_schema || [])
        .filter(f => f.required && f.key.trim() !== '')
        .map(f => f.key.trim());
      const res = await api.updateAdminEnrolmentService(
        editingService.service_key || editingService.key,
        {
          name: editingService.name,
          description: editingService.description,
          selling_price: Number(editingService.selling_price || 0),
          wholesale_cost: Number(editingService.wholesale_cost || 0),
          is_active: editingService.is_active !== false,
          manual_label: editingService.manual_label,
          estimated_turnaround: editingService.estimated_turnaround,
          supported_notes: editingService.supported_notes,
          required_fields: reqFields,
          form_schema: editingService.form_schema,
          required_documents: editingService.required_documents,
        }
      );
      if (res?.success && res.service) {
        setEditingService(res.service);
        setFeedbackMsg(`Saved configuration for ${res.service.name}.`);
        await loadServices();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save enrolment service configuration.');
    } finally {
      setSavingService(false);
    }
  };

  const handleUploadSampleDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService || !sampleFile) {
      setErrorMsg('Please choose a sample file to upload.');
      return;
    }
    try {
      setUploadingSample(true);
      setErrorMsg(null);
      const res = await api.uploadAdminEnrolmentSample(
        editingService.service_key || editingService.key,
        sampleFile,
        sampleTitle.trim() || sampleFile.name,
        sampleDesc.trim()
      );
      if (res?.success && res.sample) {
        setEditingService(prev =>
          prev
            ? { ...prev, sample_documents: [res.sample, ...(prev.sample_documents || [])] }
            : prev
        );
        setSampleTitle('');
        setSampleDesc('');
        setSampleFile(null);
        setFeedbackMsg('Customer-facing sample document uploaded.');
        await loadServices();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to upload sample document.');
    } finally {
      setUploadingSample(false);
    }
  };

  const handleDeleteSampleDoc = async (sample: EnrolmentSampleDocument) => {
    try {
      setDeletingSampleId(sample.id);
      setErrorMsg(null);
      const res = await api.deleteAdminEnrolmentSample(sample.id);
      if (res?.success) {
        setEditingService(prev =>
          prev
            ? {
                ...prev,
                sample_documents: (prev.sample_documents || []).filter(s => s.id !== sample.id),
              }
            : prev
        );
        setFeedbackMsg('Sample document removed.');
        await loadServices();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to delete sample document.');
    } finally {
      setDeletingSampleId(null);
    }
  };

  const openProtectedDocument = async (
    id: string,
    fileUrl: string,
    name: string,
    mimeType?: string,
    mode: 'preview' | 'download' = 'preview'
  ) => {
    try {
      setLoadingDocId(id);
      const blobUrl = await api.fetchProtectedDocumentBlob(fileUrl);
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {
          }
        }, 4000);
      } else {
        setDocPreview({ name, mimeType, blobUrl });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to retrieve protected document.');
    } finally {
      setLoadingDocId(null);
    }
  };

  const closeDocPreview = () => {
    if (docPreview?.blobUrl) {
      try {
        URL.revokeObjectURL(docPreview.blobUrl);
      } catch {
      }
    }
    setDocPreview(null);
  };

  const updateSchemaField = (idx: number, patch: Partial<ModificationFormField>) => {
    if (!editingService) return;
    const next = [...(editingService.form_schema || [])];
    next[idx] = { ...next[idx], ...patch };
    setEditingService({ ...editingService, form_schema: next });
  };

  const moveSchemaField = (idx: number, dir: -1 | 1) => {
    if (!editingService) return;
    const list = [...(editingService.form_schema || [])];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const tmp = list[idx];
    list[idx] = list[target];
    list[target] = tmp;
    setEditingService({ ...editingService, form_schema: list });
  };

  const removeSchemaField = (idx: number) => {
    if (!editingService) return;
    const list = (editingService.form_schema || []).filter((_, i) => i !== idx);
    setEditingService({ ...editingService, form_schema: list });
  };

  const addSchemaField = () => {
    if (!editingService) return;
    const list = [...(editingService.form_schema || [])];
    list.push({
      key: `field_${list.length + 1}`,
      label: 'New Applicant Field',
      type: 'text',
      required: false,
      placeholder: '',
      help_text: '',
      provider_param: '',
    });
    setEditingService({ ...editingService, form_schema: list });
  };

  const updateRequiredDoc = (idx: number, patch: Partial<ModificationRequiredDocument>) => {
    if (!editingService) return;
    const next = [...(editingService.required_documents || [])];
    next[idx] = { ...next[idx], ...patch };
    setEditingService({ ...editingService, required_documents: next });
  };

  const removeRequiredDoc = (idx: number) => {
    if (!editingService) return;
    const list = (editingService.required_documents || []).filter((_, i) => i !== idx);
    setEditingService({ ...editingService, required_documents: list });
  };

  const addRequiredDoc = () => {
    if (!editingService) return;
    const list = [...(editingService.required_documents || [])];
    list.push({
      key: `doc_${list.length + 1}`,
      label: 'Supporting Document',
      required: false,
      description: '',
      accepted_formats: ['JPG', 'PNG', 'WEBP', 'PDF'],
      max_size_mb: 5,
      provider_file_param: '',
    });
    setEditingService({ ...editingService, required_documents: list });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            HAMBAK Enrolment Centre (Manual NIN Enrolment)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Manage verified NIN Enrolment (Adult &amp; Child) orders, protected documents, sample guides, pricing, turnaround estimates, and live provider synchronization.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSyncCatalog}
            disabled={syncingCatalog}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingCatalog ? 'animate-spin' : ''}`} />
            <span>{syncingCatalog ? 'Syncing Costs...' : 'Sync 2SureVerify Costs'}</span>
          </button>
          <button
            type="button"
            onClick={() => (activeTab === 'orders' ? loadOrders() : loadServices())}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Banners */}
      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button type="button" onClick={() => setFeedbackMsg(null)} className="p-1 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="p-1 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Executive KPI Strip */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Total Orders</span>
              <Layers className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums mt-1">
              {stats.total_all}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
              Adult: {stats.adult_count} &middot; Child: {stats.child_count}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Active Manual Queue</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-300 tabular-nums mt-1">
              {stats.pending_count + stats.processing_count + stats.query_count}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
              Completed: {stats.completed_count} &middot; Refunded: {stats.refunded_count}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Customer Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums mt-1">
              ₦{Number(stats.total_revenue || 0).toLocaleString('en-NG')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Excludes refunded orders</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Provider Wholesale Cost</span>
              <ShieldCheck className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums mt-1">
              ₦{Number(stats.total_provider_cost || 0).toLocaleString('en-NG')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Admin-only private metric</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>HAMBAK Net Margin</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
              ₦{Number(stats.total_margin || 0).toLocaleString('en-NG')}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Net realized spread</div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          NIN Enrolment Orders
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
            activeTab === 'services'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Services, Samples &amp; Unverified Policy
        </button>
      </div>

      {/* TAB 1: ORDERS QUEUE */}
      {activeTab === 'orders' ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {/* Filters */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={serviceFilter}
                onChange={e => {
                  setServiceFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
              >
                <option value="ALL">All NIN Enrolment Services</option>
                <option value="bvn_enroll_adult">NIN Enrolment (Adult)</option>
                <option value="bvn_enroll_child">NIN Enrolment (Child)</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending Manual Processing</option>
                <option value="processing">Processing</option>
                <option value="query_required">Action Required</option>
                <option value="completed">Completed</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed / Rejected</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setPage(1);
                      loadOrders();
                    }
                  }}
                  placeholder="Search order #, applicant, customer..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  loadOrders();
                }}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
              >
                Search
              </button>
            </div>
          </div>

          {/* Orders Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Service &amp; Applicant</th>
                  <th className="py-3 px-4 text-right">Sell / Cost / Profit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {loadingOrders && orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      <span>Loading enrolment orders...</span>
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      No NIN Enrolment orders match the current filters.
                    </td>
                  </tr>
                ) : (
                  orders.map(order => {
                    const st = getEnrolmentStatusStyle(order.status);
                    return (
                      <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          <div>{order.order_number}</div>
                          {order.provider_reference && (
                            <div className="text-[10px] font-normal text-slate-500">
                              Ref: {order.provider_reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {order.customer_name || 'Customer'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                            {order.customer_email || order.user_id}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {order.service_name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {order.applicant_name} &middot; {order.applicant_phone_masked}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-white">
                            ₦{Number(order.customer_price).toLocaleString('en-NG')}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Cost: ₦{Number(order.provider_cost || 0).toLocaleString('en-NG')} &middot; Margin: ₦{Number(order.profit || 0).toLocaleString('en-NG')}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${st.classes}`}>
                            {st.label}
                          </span>
                          {order.refund_reference && (
                            <div className="text-[10px] font-mono text-purple-600 dark:text-purple-300 mt-1">
                              {order.refund_reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(order.created_at).toLocaleString('en-NG')}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(order)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-semibold transition"
                          >
                            Manage
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
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: SERVICES, SAMPLES & UNVERIFIED GUARDRAILS */
        <div className="space-y-6">
          {/* Verified Services */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Verified NIN Enrolment Services (2SureVerify Confirmed Endpoints)
            </h3>
            {loadingServices ? (
              <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                <span>Loading enrolment service settings...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {services.map(srv => {
                  const isEnabled = srv.is_active !== false;
                  const margin = Number(srv.profit ?? Number(srv.selling_price) - Number(srv.wholesale_cost || 0));
                  return (
                    <div
                      key={srv.service_key}
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-bold text-slate-900 dark:text-white">
                            {srv.name}
                          </h4>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {srv.service_key} &middot; {srv.endpoint}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleServiceActive(srv)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                            isEnabled
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums">
                        <div>
                          <span className="text-[10px] font-sans text-slate-500 block">Selling Price</span>
                          <span className="font-bold text-blue-700 dark:text-emerald-400">
                            ₦{Number(srv.selling_price).toLocaleString('en-NG')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-sans text-slate-500 block">Wholesale Cost</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            ₦{Number(srv.wholesale_cost || 0).toLocaleString('en-NG')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-sans text-slate-500 block">Net Margin</span>
                          <span className={`font-bold ${margin >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                            ₦{margin.toLocaleString('en-NG')} ({srv.margin_percent ?? 0}%)
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <div>
                          <strong className="text-slate-800 dark:text-slate-200">Processing:</strong>{' '}
                          {srv.manual_label} &middot; {srv.estimated_turnaround}
                        </div>
                        <div>
                          <strong className="text-slate-800 dark:text-slate-200">Schema:</strong>{' '}
                          {(srv.form_schema || []).length} fields &middot; {(srv.required_documents || []).length} doc slots &middot;{' '}
                          {(srv.sample_documents || []).length} sample files
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleOpenServiceEditor(srv, 'general')}
                          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>Configure Pricing, Fields &amp; Samples</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenServiceEditor(srv, 'samples')}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Samples ({(srv.sample_documents || []).length})</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Read-Only Unverified Services Policy Notice */}
          <div className="rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 p-5 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Unverified Services — Disabled by Policy
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  The following enrolment/arrangement concepts do not have confirmed submission endpoints on the configured provider and remain strictly blocked from customer ordering until officially documented.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {unverifiedNotices.map(notice => (
                <div
                  key={notice.service_key}
                  className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/25 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{notice.name}</span>
                    <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300">
                      DISABLED / UNVERIFIED
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{notice.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ORDER DETAIL & MANUAL UPDATE MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-8">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedOrder.service_name} &middot; {selectedOrder.order_number}
                </h4>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Payment Ref: {selectedOrder.payment_reference}
                  {selectedOrder.provider_reference ? ` · Provider Ref: ${selectedOrder.provider_reference}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs max-h-[78vh] overflow-y-auto">
              {loadingDetail && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Refreshing order details...</span>
                </div>
              )}

              {/* Financial & Customer Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono tabular-nums">
                <div>
                  <span className="font-sans text-[10px] text-slate-500 block">Customer</span>
                  <span className="font-sans font-semibold text-slate-900 dark:text-white">
                    {selectedOrder.customer_name || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-slate-500 block">Customer Price</span>
                  <span className="font-bold text-blue-700 dark:text-emerald-400">
                    ₦{Number(selectedOrder.customer_price).toLocaleString('en-NG')}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-slate-500 block">Wholesale Cost</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    ₦{Number(selectedOrder.provider_cost || 0).toLocaleString('en-NG')}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-slate-500 block">Net Margin</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    ₦{Number(selectedOrder.profit || 0).toLocaleString('en-NG')}
                  </span>
                </div>
              </div>

              {/* Submitted Fields */}
              <div>
                <h5 className="font-bold text-slate-900 dark:text-white mb-2">
                  Submitted Applicant Fields
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  {Object.entries(selectedOrder.submitted_fields || {}).map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <span className="text-[11px] text-slate-500 capitalize block">
                        {k.replace(/_/g, ' ')}
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white break-words">
                        {String(v || '—')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Supporting Documents */}
              {(selectedOrder.supporting_documents || []).length > 0 && (
                <div>
                  <h5 className="font-bold text-slate-900 dark:text-white mb-2">
                    Customer Supporting Documents
                  </h5>
                  <div className="space-y-2">
                    {selectedOrder.supporting_documents.map(doc => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {doc.original_name || doc.doc_key}
                            </p>
                            <p className="text-[11px] text-slate-500">{doc.doc_key.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              openProtectedDocument(
                                doc.id,
                                doc.file_url,
                                doc.original_name || doc.doc_key,
                                doc.mime_type,
                                'preview'
                              )
                            }
                            disabled={loadingDocId === doc.id}
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"
                          >
                            {loadingDocId === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openProtectedDocument(
                                `dl_${doc.id}`,
                                doc.file_url,
                                doc.original_name || doc.doc_key,
                                doc.mime_type,
                                'download'
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 2: Official Result Retrieval, Tracking ID & Manual Admin PDF Upload */}
              <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white">
                      Official Enrolment Result &amp; Document Delivery
                    </h5>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Status: <span className="font-mono font-semibold">{selectedOrder.result_retrieval_status || 'not_fetched'}</span>
                      {selectedOrder.provider_tracking_id ? ` · Tracking ID: ${selectedOrder.provider_tracking_id}` : ''}
                    </p>
                  </div>
                  {selectedOrder.provider_reference && (
                    <button
                      type="button"
                      onClick={() => handleRetryEnrolmentResultFetch(selectedOrder.id)}
                      disabled={retryingResultId === selectedOrder.id}
                      className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold inline-flex items-center gap-1.5 shrink-0 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${retryingResultId === selectedOrder.id ? 'animate-spin' : ''}`} />
                      <span>{retryingResultId === selectedOrder.id ? 'Fetching...' : 'Retry Provider Result Fetch'}</span>
                    </button>
                  )}
                </div>

                {selectedOrder.result_retrieval_error && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-[11px]">
                    <strong>Last Retrieval Error:</strong> {selectedOrder.result_retrieval_error}
                  </div>
                )}

                {selectedOrder.result_details && Object.keys(selectedOrder.result_details).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(selectedOrder.result_details).map(([k, v]) => (
                      <div key={k} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] uppercase text-slate-500 block">{k.replace(/_/g, ' ')}</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white break-words">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedOrder.has_result_document && selectedOrder.result_document ? (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                          selectedOrder.result_document.is_provider_issued
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                        }`}
                      >
                        {selectedOrder.result_document.is_provider_issued
                          ? 'Provider-Issued Official Document'
                          : 'Admin-Uploaded Official Document'}
                      </span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                        {selectedOrder.result_document.original_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          openProtectedDocument(
                            `res_prev_${selectedOrder.id}`,
                            selectedOrder.result_document!.file_url,
                            selectedOrder.result_document!.original_name || `HAMBAK_ENROLMENT_${selectedOrder.order_number}.pdf`,
                            selectedOrder.result_document!.mime_type || 'application/pdf',
                            'preview'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openProtectedDocument(
                            `res_dl_${selectedOrder.id}`,
                            selectedOrder.result_document!.file_url,
                            selectedOrder.result_document!.original_name || `HAMBAK_ENROLMENT_${selectedOrder.order_number}.pdf`,
                            selectedOrder.result_document!.mime_type || 'application/pdf',
                            'download'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    No official PDF document is stored yet for this order.
                  </p>
                )}

                <form
                  onSubmit={handleAdminUploadEnrolmentResultPdf}
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5"
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    Upload Official Enrolment PDF (Strictly Labeled: Admin-Uploaded Official Document)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Official PDF File (Max 15MB)
                      </label>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={e => setAdminResultFile(e.target.files?.[0] || null)}
                        className="w-full text-[11px] text-slate-700 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Tracking ID (Optional)
                      </label>
                      <input
                        type="text"
                        value={adminResultTrackingId}
                        onChange={e => setAdminResultTrackingId(e.target.value)}
                        placeholder="e.g. NIMC/2SURE Tracking ID"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={adminResultRemarks}
                    onChange={e => setAdminResultRemarks(e.target.value)}
                    placeholder="Optional customer-visible delivery remarks..."
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-4 text-[11px] text-slate-700 dark:text-slate-300">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={adminResultMarkCompleted}
                          onChange={e => setAdminResultMarkCompleted(e.target.checked)}
                        />
                        <span>Mark Completed</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={adminResultNotifyCustomer}
                          onChange={e => setAdminResultNotifyCustomer(e.target.checked)}
                        />
                        <span>Notify Customer</span>
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={uploadingResultPdf || !adminResultFile}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5"
                    >
                      {uploadingResultPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>Upload Admin Result PDF</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Live Provider Poll & Manual Update Form */}
              <form onSubmit={handleSaveOrderUpdate} className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="font-bold text-slate-900 dark:text-white">
                    Manual Processing &amp; Status Controls
                  </h5>
                  {selectedOrder.provider_reference && (
                    <button
                      type="button"
                      onClick={() => handlePollOrder(selectedOrder.id)}
                      disabled={pollingId === selectedOrder.id}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold inline-flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${pollingId === selectedOrder.id ? 'animate-spin' : ''}`} />
                      <span>{pollingId === selectedOrder.id ? 'Polling Provider...' : 'Poll 2SureVerify Status'}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Order Status
                    </label>
                    <select
                      value={updateStatusVal}
                      onChange={e => setUpdateStatusVal(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="pending">Pending Manual Processing</option>
                      <option value="processing">Processing</option>
                      <option value="query_required">Query / Info Required</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Rejected</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Estimated Completion Text
                    </label>
                    <input
                      type="text"
                      value={estCompletionVal}
                      onChange={e => setEstCompletionVal(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Customer-Visible Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={providerRemarksVal}
                    onChange={e => setProviderRemarksVal(e.target.value)}
                    placeholder="Reason, instructions, or completion message shown to customer..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Internal Admin Notes
                  </label>
                  <textarea
                    rows={2}
                    value={adminNotesVal}
                    onChange={e => setAdminNotesVal(e.target.value)}
                    placeholder="Internal review notes (never shown to customer)..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                {['failed', 'rejected', 'refunded'].includes(updateStatusVal) &&
                  !selectedOrder.refund_reference && (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={triggerRefundVal}
                        onChange={e => setTriggerRefundVal(e.target.checked)}
                        className="mt-0.5 rounded"
                      />
                      <span>
                        <strong className="inline-flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Issue Single Atomic Wallet Refund (₦{Number(selectedOrder.customer_price).toLocaleString('en-NG')})</span>
                        </strong>
                        <span className="block text-[11px] opacity-90 mt-0.5">
                          Safely credits customer wallet once and marks order refunded. Duplicate refunds are blocked by payment reference lock.
                        </span>
                      </span>
                    </label>
                  )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={savingUpdate}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold inline-flex items-center gap-1.5"
                  >
                    {savingUpdate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{savingUpdate ? 'Saving...' : 'Save Order Update'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SERVICE CONFIGURATION MODAL */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl my-8">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Configure {editingService.name}
                </h4>
                <p className="text-[11px] font-mono text-slate-500">
                  {editingService.service_key} &middot; {editingService.endpoint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
              {[
                { id: 'general', label: 'Pricing, Turnaround & Instructions' },
                { id: 'samples', label: `Sample Documents (${(editingService.sample_documents || []).length})` },
                { id: 'fields', label: `Form Fields (${(editingService.form_schema || []).length})` },
                { id: 'documents', label: `Required Docs (${(editingService.required_documents || []).length})` },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setServiceModalTab(t.id as any)}
                  className={`px-3 py-2 border-b-2 font-semibold whitespace-nowrap transition ${
                    serviceModalTab === t.id
                      ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto text-xs space-y-4">
              {serviceModalTab === 'samples' ? (
                /* SAMPLE DOCUMENTS TAB */
                <div className="space-y-5">
                  <form
                    onSubmit={handleUploadSampleDoc}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <h5 className="font-bold text-slate-900 dark:text-white">
                      Upload Customer-Facing Sample Guide Document
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Sample Title
                        </label>
                        <input
                          type="text"
                          value={sampleTitle}
                          onChange={e => setSampleTitle(e.target.value)}
                          placeholder="e.g. Sample Birth Certificate / Consent Letter"
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Description (Optional)
                        </label>
                        <input
                          type="text"
                          value={sampleDesc}
                          onChange={e => setSampleDesc(e.target.value)}
                          placeholder="Brief guidance for customers"
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={e => setSampleFile(e.target.files?.[0] || null)}
                        className="text-xs text-slate-600 dark:text-slate-300"
                      />
                      <button
                        type="submit"
                        disabled={uploadingSample || !sampleFile}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5 shrink-0"
                      >
                        {uploadingSample ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        <span>{uploadingSample ? 'Uploading...' : 'Upload Sample'}</span>
                      </button>
                    </div>
                  </form>

                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-900 dark:text-white">
                      Uploaded Sample Documents
                    </h5>
                    {(editingService.sample_documents || []).length === 0 ? (
                      <p className="text-slate-500 py-4 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                        No sample documents uploaded for this service yet.
                      </p>
                    ) : (
                      editingService.sample_documents.map(sample => (
                        <div
                          key={sample.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate">
                              {sample.title}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {sample.original_name}
                              {sample.description ? ` · ${sample.description}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                openProtectedDocument(
                                  sample.id,
                                  sample.file_url,
                                  sample.original_name,
                                  sample.mime_type,
                                  'preview'
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold"
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSampleDoc(sample)}
                              disabled={deletingSampleId === sample.id}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                              title="Delete sample document"
                            >
                              {deletingSampleId === sample.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* GENERAL / FIELDS / DOCUMENTS FORM */
                <form id="service-config-form" onSubmit={handleSaveServiceConfig} className="space-y-4">
                  {serviceModalTab === 'general' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Service Name (NIN Enrolment Required)
                          </label>
                          <input
                            type="text"
                            value={editingService.name}
                            onChange={e => setEditingService({ ...editingService, name: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Processing Label
                          </label>
                          <input
                            type="text"
                            value={editingService.manual_label}
                            onChange={e => setEditingService({ ...editingService, manual_label: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Customer Selling Price (₦)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="50"
                            value={editingService.selling_price}
                            onChange={e =>
                              setEditingService({ ...editingService, selling_price: Number(e.target.value) })
                            }
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Provider Wholesale Cost (₦, Private)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="50"
                            value={editingService.wholesale_cost || 0}
                            onChange={e =>
                              setEditingService({ ...editingService, wholesale_cost: Number(e.target.value) })
                            }
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Business-Day Turnaround Estimate
                          </label>
                          <input
                            type="text"
                            value={editingService.estimated_turnaround}
                            onChange={e =>
                              setEditingService({ ...editingService, estimated_turnaround: e.target.value })
                            }
                            placeholder="e.g. 3 – 7 Business Days"
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Short Description
                        </label>
                        <textarea
                          rows={2}
                          value={editingService.description}
                          onChange={e => setEditingService({ ...editingService, description: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Customer Instructions &amp; Notes
                        </label>
                        <textarea
                          rows={3}
                          value={editingService.supported_notes || ''}
                          onChange={e => setEditingService({ ...editingService, supported_notes: e.target.value })}
                          placeholder="Instructions displayed inside the customer checklist panel..."
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>

                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingService.is_active !== false}
                          onChange={e => setEditingService({ ...editingService, is_active: e.target.checked })}
                          className="rounded"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Service Enabled for Customer Orders
                        </span>
                      </label>
                    </div>
                  )}

                  {serviceModalTab === 'fields' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Applicant Form Fields &amp; Provider Mapping
                        </span>
                        <button
                          type="button"
                          onClick={addSchemaField}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Field</span>
                        </button>
                      </div>

                      {(editingService.form_schema || []).map((field, idx) => (
                        <div
                          key={`${field.key}-${idx}`}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-blue-700 dark:text-emerald-400">
                              #{idx + 1} &middot; {field.key}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveSchemaField(idx, -1)}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSchemaField(idx, 1)}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSchemaField(idx)}
                                className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                            <input
                              type="text"
                              value={field.key}
                              onChange={e => updateSchemaField(idx, { key: e.target.value })}
                              placeholder="Internal key"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                            />
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => updateSchemaField(idx, { label: e.target.value })}
                              placeholder="Customer Label"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            />
                            <select
                              value={field.type}
                              onChange={e => updateSchemaField(idx, { type: e.target.value as any })}
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            >
                              <option value="text">Text</option>
                              <option value="tel">Phone (tel)</option>
                              <option value="email">Email</option>
                              <option value="date">Date</option>
                              <option value="select">Select</option>
                              <option value="textarea">Textarea</option>
                            </select>
                            <input
                              type="text"
                              value={field.provider_param || ''}
                              onChange={e => updateSchemaField(idx, { provider_param: e.target.value })}
                              placeholder="Provider param"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                            <input
                              type="text"
                              value={field.placeholder || ''}
                              onChange={e => updateSchemaField(idx, { placeholder: e.target.value })}
                              placeholder="Placeholder"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            />
                            <input
                              type="text"
                              value={field.help_text || ''}
                              onChange={e => updateSchemaField(idx, { help_text: e.target.value })}
                              placeholder="Help text"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            />
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required !== false}
                                onChange={e => updateSchemaField(idx, { required: e.target.checked })}
                                className="rounded"
                              />
                              <span>Required field</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {serviceModalTab === 'documents' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Supporting Document Upload Slots
                        </span>
                        <button
                          type="button"
                          onClick={addRequiredDoc}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Document Slot</span>
                        </button>
                      </div>

                      {(editingService.required_documents || []).map((doc, idx) => (
                        <div
                          key={`${doc.key}-${idx}`}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-blue-700 dark:text-emerald-400">
                              {doc.key}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeRequiredDoc(idx)}
                              className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <input
                              type="text"
                              value={doc.key}
                              onChange={e => updateRequiredDoc(idx, { key: e.target.value })}
                              placeholder="Document key"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                            />
                            <input
                              type="text"
                              value={doc.label}
                              onChange={e => updateRequiredDoc(idx, { label: e.target.value })}
                              placeholder="Document Label"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            />
                            <input
                              type="text"
                              value={doc.provider_file_param || ''}
                              onChange={e => updateRequiredDoc(idx, { provider_file_param: e.target.value })}
                              placeholder="Provider multipart param"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                            <input
                              type="text"
                              value={doc.description || ''}
                              onChange={e => updateRequiredDoc(idx, { description: e.target.value })}
                              placeholder="Upload instructions"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            />
                            <input
                              type="number"
                              min={1}
                              max={25}
                              value={doc.max_size_mb || 5}
                              onChange={e => updateRequiredDoc(idx, { max_size_mb: Number(e.target.value) })}
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                            />
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={doc.required !== false}
                                onChange={e => updateRequiredDoc(idx, { required: e.target.checked })}
                                className="rounded"
                              />
                              <span>Mandatory upload</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
              >
                Close
              </button>
              {serviceModalTab !== 'samples' && (
                <button
                  type="submit"
                  form="service-config-form"
                  disabled={savingService}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold inline-flex items-center gap-1.5"
                >
                  {savingService ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{savingService ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROTECTED DOCUMENT / SAMPLE PREVIEW MODAL */}
      {docPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-bold text-slate-900 dark:text-white truncate pr-4">
                {docPreview.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={docPreview.blobUrl}
                  download={docPreview.name}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={closeDocPreview}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              {docPreview.mimeType?.includes('pdf') ? (
                <iframe src={docPreview.blobUrl} title={docPreview.name} className="w-full h-[65vh] rounded-xl bg-white" />
              ) : (
                <img src={docPreview.blobUrl} alt={docPreview.name} className="max-w-full max-h-[68vh] object-contain rounded-xl" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
