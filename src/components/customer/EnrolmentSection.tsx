/**
 * @file EnrolmentSection.tsx
 * Stage 4 — HAMBAK Enrolment Centre (Customer Workspace).
 * Supports strictly verified manual NIN Enrolment services:
 * - NIN Enrolment (Adult)
 * - NIN Enrolment (Child)
 * Provides a compact single-service selector, keyed dynamic forms,
 * admin-configured pricing & business-day turnaround estimates,
 * customer instructions, sample document previews/downloads,
 * supporting document uploads, order confirmation summary, Transaction PIN authorization,
 * duplicate-submission protection, and live Enrolment Order History tracking.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  EnrolmentOrderItem,
  EnrolmentSampleDocument,
  EnrolmentServiceItem,
  ModificationDocumentAttachment,
  ModificationFormField,
} from '../../types';
import { TransactionPinModal } from './TransactionPinModal';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Info,
  Loader2,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';

interface EnrolmentSectionProps {
  onOrderUpdated?: () => void;
  onOpenHistoryTab?: () => void;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `enr_${crypto.randomUUID()}`;
  }
  return `enr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getEnrolmentStatusStyle(status: string): {
  label: string;
  classes: string;
} {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'completed') {
    return {
      label: 'Completed',
      classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
    };
  }
  if (s === 'processing') {
    return {
      label: 'Processing',
      classes: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
    };
  }
  if (s === 'query_required') {
    return {
      label: 'Action Required',
      classes: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (s === 'refunded') {
    return {
      label: 'Refunded to Wallet',
      classes: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25',
    };
  }
  if (s === 'failed' || s === 'rejected') {
    return {
      label: s === 'rejected' ? 'Rejected' : 'Failed',
      classes: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25',
    };
  }
  return {
    label: 'Pending Manual Processing',
    classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
  };
}

export const EnrolmentSection: React.FC<EnrolmentSectionProps> = ({
  onOrderUpdated,
  onOpenHistoryTab,
}) => {
  const { user, refreshUser, updateBalance } = useAuth();

  const [services, setServices] = useState<EnrolmentServiceItem[]>([]);
  const [loadingServices, setLoadingServices] = useState<boolean>(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [selectedServiceKey, setSelectedServiceKey] = useState<string>('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, ModificationDocumentAttachment>>({});
  const [localDocPreviewUrls, setLocalDocPreviewUrls] = useState<Record<string, string>>({});
  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const inFlightRef = useRef<boolean>(false);
  const serviceSeqRef = useRef<number>(0);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => createIdempotencyKey());
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<EnrolmentOrderItem | null>(null);

  // Order history & live polling
  const [orders, setOrders] = useState<EnrolmentOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<EnrolmentOrderItem | null>(null);

  // Protected document / sample preview & download
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    mimeType?: string;
    blobUrl: string;
    isTemporaryObjectUrl?: boolean;
  } | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadOrders();
    }
  }, [user?.id, statusFilter]);

  const loadServices = async () => {
    try {
      setLoadingServices(true);
      setServicesError(null);
      const res = await api.getEnrolmentServices();
      if (res?.success) {
        const verifiedEnabled = (res.services || []).filter(
          s =>
            s.enabled !== false &&
            s.is_active !== false &&
            (s.service_key === 'bvn_enroll_adult' || s.service_key === 'bvn_enroll_child')
        );
        setServices(verifiedEnabled);
        if (
          selectedServiceKey &&
          !verifiedEnabled.some(s => (s.key || s.service_key) === selectedServiceKey)
        ) {
          setSelectedServiceKey('');
        }
      }
    } catch (err: any) {
      setServicesError(err?.message || 'Unable to load NIN Enrolment services right now.');
    } finally {
      setLoadingServices(false);
    }
  };

  const loadOrders = async () => {
    try {
      setLoadingOrders(true);
      const res = await api.getEnrolmentHistory({
        status: statusFilter,
        limit: 30,
      });
      if (res?.success) {
        setOrders(res.orders || []);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const selectedService = useMemo(() => {
    if (!selectedServiceKey) return null;
    return services.find(s => (s.key || s.service_key) === selectedServiceKey) || null;
  }, [services, selectedServiceKey]);

  const finalCharge = useMemo(() => {
    if (!selectedService) return 0;
    return Number(selectedService.selling_price ?? selectedService.price ?? 0);
  }, [selectedService]);

  const walletBalance = Number(user?.wallet_balance ?? 0);
  const insufficientBalance = selectedService ? walletBalance < finalCharge : false;

  const checklistProgress = useMemo(() => {
    const schema = selectedService?.form_schema || [];
    const reqFields = schema.filter(f => f.required);
    const filledReqFields = reqFields.filter(f => String(formValues[f.key] ?? '').trim() !== '').length;
    const reqDocs = (selectedService?.required_documents || []).filter(d => d.required);
    const uploadedReqDocs = reqDocs.filter(d => Boolean(uploadedDocs[d.key])).length;
    return {
      totalReqFields: reqFields.length,
      filledReqFields,
      totalReqDocs: reqDocs.length,
      uploadedReqDocs,
    };
  }, [selectedService, formValues, uploadedDocs]);

  const revokeLocalPreviews = (urls: Record<string, string>) => {
    Object.values(urls).forEach(u => {
      try {
        URL.revokeObjectURL(u);
      } catch {
      }
    });
  };

  const handleSelectService = (serviceKey: string) => {
    serviceSeqRef.current += 1;
    revokeLocalPreviews(localDocPreviewUrls);
    setSelectedServiceKey(serviceKey);
    setFormValues({});
    setFieldErrors({});
    setDocErrors({});
    setUploadedDocs({});
    setLocalDocPreviewUrls({});
    setUploadingDocKey(null);
    setConsentChecked(false);
    setConfirmModalOpen(false);
    setFormError(null);
    setSubmitSuccessMsg(null);
    setSubmittedOrder(null);
    setIdempotencyKey(createIdempotencyKey());
  };

  const handleFieldChange = (field: ModificationFormField, rawValue: string) => {
    let val = rawValue;
    if (field.key === 'parent_nin' || field.key === 'nin' || field.key === 'bvn') {
      val = rawValue.replace(/\D/g, '').slice(0, 11);
    } else if (field.key === 'phone') {
      val = rawValue.replace(/\D/g, '').slice(0, 13);
    }
    setFormValues(prev => ({ ...prev, [field.key]: val }));
    setFieldErrors(prev => {
      if (!prev[field.key]) return prev;
      const copy = { ...prev };
      delete copy[field.key];
      return copy;
    });
    setFormError(null);
  };

  const handleDocumentUpload = async (docKey: string, file: File | null) => {
    if (!file || !selectedService) return;
    const seqAtStart = serviceSeqRef.current;
    const docSpec = (selectedService.required_documents || []).find(d => d.key === docKey);
    const maxSizeMb = Number(docSpec?.max_size_mb || 5);
    const acceptedFormats = (docSpec?.accepted_formats || ['JPG', 'PNG', 'WEBP', 'PDF']).map(f => f.toUpperCase());

    setDocErrors(prev => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });

    if (file.size > maxSizeMb * 1024 * 1024) {
      setDocErrors(prev => ({
        ...prev,
        [docKey]: `File must not exceed ${maxSizeMb}MB.`,
      }));
      return;
    }

    const ext = (file.name.split('.').pop() || '').toUpperCase();
    const extMatches = acceptedFormats.some(fmt => fmt === ext || (fmt === 'JPG' && ext === 'JPEG') || (fmt === 'JPEG' && ext === 'JPG'));
    if (!extMatches) {
      setDocErrors(prev => ({
        ...prev,
        [docKey]: `Invalid file format. Accepted: ${acceptedFormats.join(', ')}.`,
      }));
      return;
    }

    try {
      setUploadingDocKey(docKey);
      const res = await api.uploadEnrolmentDocument(
        file,
        docKey,
        selectedService.service_key || selectedService.key
      );
      if (seqAtStart !== serviceSeqRef.current) return;
      if (res?.success && res.document) {
        const previewUrl = URL.createObjectURL(file);
        setLocalDocPreviewUrls(prev => {
          if (prev[docKey]) {
            try {
              URL.revokeObjectURL(prev[docKey]);
            } catch {
            }
          }
          return { ...prev, [docKey]: previewUrl };
        });
        setUploadedDocs(prev => ({
          ...prev,
          [docKey]: { ...res.document, doc_key: docKey },
        }));
        setFormError(null);
      }
    } catch (err: any) {
      if (seqAtStart !== serviceSeqRef.current) return;
      setDocErrors(prev => ({
        ...prev,
        [docKey]: err?.message || 'Upload failed. Please verify the file and retry.',
      }));
    } finally {
      if (seqAtStart === serviceSeqRef.current) {
        setUploadingDocKey(null);
      }
    }
  };

  const handleRemoveUploadedDoc = (docKey: string) => {
    setUploadedDocs(prev => {
      const copy = { ...prev };
      delete copy[docKey];
      return copy;
    });
    setLocalDocPreviewUrls(prev => {
      if (prev[docKey]) {
        try {
          URL.revokeObjectURL(prev[docKey]);
        } catch {
        }
      }
      const copy = { ...prev };
      delete copy[docKey];
      return copy;
    });
  };

  const validateBeforeSubmit = (): boolean => {
    if (!selectedService) {
      setFormError('Please select a verified NIN Enrolment service from the dropdown.');
      return false;
    }

    const nextFieldErrors: Record<string, string> = {};
    const nextDocErrors: Record<string, string> = {};
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const f of selectedService.form_schema || []) {
      const val = String(formValues[f.key] ?? '').trim();
      if (f.required && !val) {
        nextFieldErrors[f.key] = `${f.label} is required.`;
        continue;
      }
      if (!val) continue;

      if (f.key === 'parent_nin' || f.key === 'nin' || f.key === 'bvn') {
        if (!/^\d{11}$/.test(val)) {
          nextFieldErrors[f.key] = `${f.label} must be exactly 11 digits.`;
        }
      } else if (f.key === 'phone') {
        if (!/^\d{10,13}$/.test(val)) {
          nextFieldErrors[f.key] = 'Enter a valid 10–13 digit Nigerian phone number.';
        }
      } else if (f.key === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          nextFieldErrors[f.key] = 'Enter a valid email address.';
        }
      } else if (f.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || val > todayStr) {
          nextFieldErrors[f.key] = `${f.label} must be a valid date not in the future.`;
        }
      } else if (f.type === 'select' && Array.isArray(f.options) && f.options.length > 0) {
        if (!f.options.some(opt => opt.value === val)) {
          nextFieldErrors[f.key] = `Please choose a valid ${f.label}.`;
        }
      }
    }

    for (const doc of selectedService.required_documents || []) {
      if (doc.required && !uploadedDocs[doc.key]) {
        nextDocErrors[doc.key] = `Please upload ${doc.label}.`;
      }
    }

    setFieldErrors(nextFieldErrors);
    setDocErrors(nextDocErrors);

    if (Object.keys(nextFieldErrors).length > 0 || Object.keys(nextDocErrors).length > 0) {
      setFormError('Please correct the highlighted fields and upload all required supporting documents.');
      return false;
    }

    if (!consentChecked) {
      setFormError('Please confirm the applicant authorization and declaration checkbox before submitting.');
      return false;
    }

    if (insufficientBalance) {
      setFormError(
        `Insufficient wallet balance. Required: ₦${finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}, Available: ₦${walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`
      );
      return false;
    }

    return true;
  };

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitSuccessMsg(null);
    if (!validateBeforeSubmit()) return;
    setConfirmModalOpen(true);
  };

  const handleProceedFromConfirm = () => {
    setConfirmModalOpen(false);
    if (user?.has_transaction_pin) {
      setPinModalOpen(true);
    } else {
      executeSubmit();
    }
  };

  const executeSubmit = async (verifiedPin?: string) => {
    if (!selectedService || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setFormError(null);
    setSubmitSuccessMsg(null);

    try {
      const docIdMap: Record<string, string> = {};
      const supportingDocsList: Array<{ id: string; doc_key: string }> = [];
      Object.entries(uploadedDocs).forEach(([k, doc]) => {
        if (doc?.id) {
          docIdMap[k] = doc.id;
          supportingDocsList.push({ id: doc.id, doc_key: k });
        }
      });

      const res = await api.submitEnrolmentOrder({
        service_key: selectedService.service_key || selectedService.key,
        fields: formValues,
        document_ids: docIdMap,
        supporting_documents: supportingDocsList,
        consent: consentChecked,
        pin: verifiedPin,
        idempotency_key: idempotencyKey,
      });

      if (res?.success && res.order) {
        setSubmittedOrder(res.order);
        setSubmitSuccessMsg(
          res.message ||
            `${selectedService.name} submitted for manual processing (${res.order.order_number}).`
        );
        if (typeof res.balance_after === 'number') {
          updateBalance(res.balance_after);
        } else if (typeof res.newBalance === 'number') {
          updateBalance(res.newBalance);
        }
        await Promise.all([refreshUser(), loadOrders()]);
        onOrderUpdated?.();

        // Prepare fresh form & idempotency key for next distinct order
        revokeLocalPreviews(localDocPreviewUrls);
        setFormValues({});
        setUploadedDocs({});
        setLocalDocPreviewUrls({});
        setConsentChecked(false);
        setFieldErrors({});
        setDocErrors({});
        setIdempotencyKey(createIdempotencyKey());
      }
    } catch (err: any) {
      setFormError(
        err?.message ||
          'Unable to submit your NIN Enrolment order right now. Your wallet has not been charged unless an order record appears below.'
      );
      await loadOrders();
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handlePollOrder = async (orderId: string) => {
    try {
      setPollingId(orderId);
      setFormError(null);
      const res = await api.pollEnrolmentStatus(orderId);
      if (res?.success && res.order) {
        setOrders(prev => prev.map(o => (o.id === orderId ? res.order : o)));
        if (detailOrder?.id === orderId) {
          setDetailOrder(res.order);
        }
        if (submittedOrder?.id === orderId) {
          setSubmittedOrder(res.order);
        }
        setSubmitSuccessMsg(res.message);
        if (res.refund?.refunded) {
          await refreshUser();
          onOrderUpdated?.();
        }
      }
    } catch (err: any) {
      setFormError(err?.message || 'Unable to check live status right now.');
    } finally {
      setPollingId(null);
    }
  };

  const openProtectedFile = async (
    id: string,
    fileUrl: string,
    name: string,
    mimeType?: string,
    mode: 'preview' | 'download' = 'preview'
  ) => {
    try {
      setLoadingPreviewId(id);
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
        setPreviewDoc({
          name,
          mimeType,
          blobUrl,
          isTemporaryObjectUrl: true,
        });
      }
    } catch (err: any) {
      setFormError(err?.message || 'Unable to open document preview.');
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const closePreviewModal = () => {
    if (previewDoc?.isTemporaryObjectUrl) {
      try {
        URL.revokeObjectURL(previewDoc.blobUrl);
      } catch {
      }
    }
    setPreviewDoc(null);
  };

  const applicantFullName = useMemo(() => {
    return (
      [formValues.first_name, formValues.middle_name, formValues.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Applicant'
    );
  }, [formValues.first_name, formValues.middle_name, formValues.last_name]);

  return (
    <div className="space-y-6">
      {/* Compact Service Selection Bar */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              HAMBAK Enrolment Centre — NIN Enrolment
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Select a verified NIN Enrolment service below. Processing is manual and status updates are tracked directly in your order history.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenHistoryTab && (
              <button
                type="button"
                onClick={onOpenHistoryTab}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition whitespace-nowrap"
              >
                Full History
              </button>
            )}
            <button
              type="button"
              onClick={loadServices}
              disabled={loadingServices}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingServices ? 'animate-spin' : ''}`} />
              <span>Refresh Services</span>
            </button>
          </div>
        </div>

        {servicesError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{servicesError}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="enrolment-service-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Select NIN Enrolment Service
            </label>
            {selectedService && (
              <button
                type="button"
                onClick={() => handleSelectService('')}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
              >
                Clear Selection
              </button>
            )}
          </div>

          <select
            id="enrolment-service-select"
            value={selectedServiceKey}
            onChange={e => handleSelectService(e.target.value)}
            disabled={loadingServices}
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">
              {loadingServices ? 'Loading NIN Enrolment services...' : '-- Select NIN Enrolment Service --'}
            </option>
            {services.map(srv => (
              <option key={srv.service_key} value={srv.service_key}>
                {srv.name} — ₦{Number(srv.selling_price ?? srv.price ?? 0).toLocaleString('en-NG')} ({srv.manual_label || 'Manual Processing'})
              </option>
            ))}
          </select>

          {!loadingServices && services.length === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300 pt-1">
              No verified NIN Enrolment services are currently enabled. Please contact support.
            </p>
          )}
        </div>
      </div>

      {/* Feedback & Submitted Order Banner */}
      {submitSuccessMsg && submittedOrder && (
        <div className="rounded-3xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {submittedOrder.service_name} — Order Submitted
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {submitSuccessMsg}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 tabular-nums pt-1">
                  <span>Order: {submittedOrder.order_number}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>Status: {getEnrolmentStatusStyle(submittedOrder.status).label}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>Turnaround: {submittedOrder.estimated_completion_text}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handlePollOrder(submittedOrder.id)}
                disabled={pollingId === submittedOrder.id}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5 hover:bg-emerald-100/50 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pollingId === submittedOrder.id ? 'animate-spin' : ''}`} />
                <span>Check Live Status</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailOrder(submittedOrder)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition"
              >
                View Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Keyed Enrolment Service Form */}
      {selectedService && (
        <div
          key={selectedService.service_key}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {/* Left Panel: Requirements, Instructions & Samples */}
          <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="space-y-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedService.name}
                </h3>
                <span className="font-mono font-extrabold text-base text-blue-700 dark:text-emerald-400 tabular-nums shrink-0">
                  ₦{finalCharge.toLocaleString('en-NG')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{selectedService.manual_label || 'Manual Processing'}</span>
                </span>
                <span aria-hidden="true">&middot;</span>
                <span>Est. Turnaround: {selectedService.estimated_turnaround}</span>
              </div>
              {selectedService.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                  {selectedService.description}
                </p>
              )}
            </div>

            {selectedService.supported_notes && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Important Instructions</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                  {selectedService.supported_notes}
                </p>
              </div>
            )}

            {/* Admin-Uploaded Sample Documents */}
            {Array.isArray(selectedService.sample_documents) &&
              selectedService.sample_documents.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                    <span>Sample Reference Documents</span>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {selectedService.sample_documents.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedService.sample_documents.map((sample: EnrolmentSampleDocument) => (
                      <div
                        key={sample.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {sample.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {sample.original_name}
                            {sample.file_size ? ` · ${formatFileSize(sample.file_size)}` : ''}
                          </p>
                          {sample.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {sample.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              openProtectedFile(
                                `sample_${sample.id}`,
                                sample.file_url,
                                sample.original_name,
                                sample.mime_type,
                                'preview'
                              )
                            }
                            disabled={loadingPreviewId === `sample_${sample.id}`}
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 transition"
                          >
                            {loadingPreviewId === `sample_${sample.id}` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openProtectedFile(
                                `dl_${sample.id}`,
                                sample.file_url,
                                sample.original_name,
                                sample.mime_type,
                                'download'
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition"
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

            {/* Required Information Checklist */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                <span>Required Information Checklist</span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {checklistProgress.filledReqFields}/{checklistProgress.totalReqFields}
                </span>
              </div>
              <ul className="space-y-1.5 text-xs">
                {(selectedService.form_schema || []).map(f => {
                  const done = String(formValues[f.key] ?? '').trim() !== '';
                  return (
                    <li
                      key={f.key}
                      className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-700'
                          }`}
                        />
                        <span className="truncate">{f.label}</span>
                      </span>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {f.required ? 'Required' : 'Optional'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Required Documents Checklist */}
            {(selectedService.required_documents || []).length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                  <span>Required Supporting Documents</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {checklistProgress.uploadedReqDocs}/{checklistProgress.totalReqDocs}
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs">
                  {(selectedService.required_documents || []).map(doc => {
                    const uploaded = Boolean(uploadedDocs[doc.key]);
                    return (
                      <li
                        key={doc.key}
                        className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <FileCheck2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              uploaded ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                          <span className="truncate">{doc.label}</span>
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {doc.required ? 'Required' : 'Optional'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong className="text-slate-900 dark:text-white">Manual Wallet Refund Guarantee:</strong>{' '}
              Your order remains in <strong>Pending Manual Processing</strong> until verified completion. If an order cannot be processed or is rejected, your wallet receives a single automatic refund.
            </div>
          </div>

          {/* Right Panel: Applicant Form & Submission */}
          <form
            onSubmit={handleRequestSubmit}
            noValidate
            className="lg:col-span-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Applicant Details — {selectedService.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ensure all details match official applicant identification records accurately.
                </p>
              </div>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{formError}</div>
              </div>
            )}

            {/* Dynamic Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(selectedService.form_schema || []).map(field => {
                const val = formValues[field.key] ?? '';
                const err = fieldErrors[field.key];
                const isWide = field.type === 'textarea' || field.key === 'address' || field.key === 'email';
                const isNumericInput =
                  field.key === 'parent_nin' || field.key === 'nin' || field.key === 'bvn' || field.key === 'phone';

                return (
                  <div key={field.key} className={isWide ? 'sm:col-span-2 space-y-1.5' : 'space-y-1.5'}>
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`enr-field-${field.key}`}
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        {field.label}
                        {field.required && <span className="text-rose-600 dark:text-rose-400 ml-0.5">*</span>}
                      </label>
                      {(field.key === 'parent_nin' || field.key === 'nin' || field.key === 'bvn') && (
                        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                          {val.length}/11
                        </span>
                      )}
                    </div>

                    {field.type === 'select' ? (
                      <select
                        id={`enr-field-${field.key}`}
                        value={val}
                        onChange={e => handleFieldChange(field, e.target.value)}
                        className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          err ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <option value="">-- Select {field.label} --</option>
                        {(field.options || []).map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={`enr-field-${field.key}`}
                        rows={3}
                        value={val}
                        onChange={e => handleFieldChange(field, e.target.value)}
                        placeholder={field.placeholder || ''}
                        maxLength={field.maxLength}
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          err ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    ) : (
                      <input
                        id={`enr-field-${field.key}`}
                        type={field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
                        value={val}
                        max={field.type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
                        maxLength={field.maxLength}
                        onChange={e => handleFieldChange(field, e.target.value)}
                        placeholder={field.placeholder || ''}
                        className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isNumericInput ? 'font-mono tabular-nums' : ''
                        } ${err ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'}`}
                      />
                    )}

                    {(field.help_text || field.helper) && !err && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {field.help_text || field.helper}
                      </p>
                    )}
                    {err && (
                      <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Supporting Document Upload Slots */}
            {(selectedService.required_documents || []).length > 0 && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Supporting Document Uploads
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Upload clear scans or photos in accepted formats. Files are stored privately for verification only.
                  </p>
                </div>

                <div className="space-y-3">
                  {(selectedService.required_documents || []).map(doc => {
                    const uploaded = uploadedDocs[doc.key];
                    const err = docErrors[doc.key];
                    const isUploading = uploadingDocKey === doc.key;
                    const formats = (doc.accepted_formats || ['JPG', 'PNG', 'WEBP', 'PDF']).join(', ');
                    const maxMb = doc.max_size_mb || 5;

                    return (
                      <div
                        key={doc.key}
                        className={`p-4 rounded-2xl border space-y-2.5 ${
                          err
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-500/40'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-900 dark:text-white">
                              {doc.label}
                              {doc.required && <span className="text-rose-600 dark:text-rose-400 ml-0.5">*</span>}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {doc.description ? `${doc.description} · ` : ''}
                              {formats} · Max {maxMb}MB
                            </p>
                          </div>

                          <label className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition">
                            {isUploading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                <span>Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5" />
                                <span>{uploaded ? 'Replace File' : 'Upload File'}</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,.pdf"
                              className="sr-only"
                              disabled={isUploading}
                              onChange={e => {
                                const file = e.target.files?.[0] || null;
                                e.target.value = '';
                                handleDocumentUpload(doc.key, file);
                              }}
                            />
                          </label>
                        </div>

                        {uploaded && (
                          <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/30 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                {uploaded.original_name || uploaded.file_name}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
                                {formatFileSize(uploaded.file_size || uploaded.size_bytes)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const localUrl = localDocPreviewUrls[doc.key];
                                  if (localUrl) {
                                    setPreviewDoc({
                                      name: uploaded.original_name || doc.label,
                                      mimeType: uploaded.mime_type,
                                      blobUrl: localUrl,
                                      isTemporaryObjectUrl: false,
                                    });
                                  } else if (uploaded.file_url) {
                                    openProtectedFile(
                                      uploaded.id,
                                      uploaded.file_url,
                                      uploaded.original_name || doc.label,
                                      uploaded.mime_type,
                                      'preview'
                                    );
                                  }
                                }}
                                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                title="Preview uploaded file"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveUploadedDoc(doc.key)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                                title="Remove file"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {err && (
                          <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            {err}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legal Authorization Checkbox */}
            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={e => {
                  setConsentChecked(e.target.checked);
                  setFormError(null);
                }}
                className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                <strong className="text-slate-900 dark:text-white">Applicant Authorization &amp; Declaration:</strong>{' '}
                I confirm that all applicant details and supporting documents provided are accurate, authentic, and submitted with explicit legal consent under NIMC guidelines and Nigerian data protection regulations. I understand that this is a manual processing order.
              </span>
            </label>

            {/* Order Confirmation & Wallet Summary */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Selected Service</span>
                <span className="font-semibold text-slate-900 dark:text-white">{selectedService.name}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Processing &amp; Turnaround</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Manual · {selectedService.estimated_turnaround}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Available Wallet Balance</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                  ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Enrolment Service Charge</span>
                <span className="font-mono font-extrabold text-blue-700 dark:text-emerald-400 tabular-nums">
                  ₦{finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-semibold">
                <span className="text-slate-700 dark:text-slate-300">Balance After Debit</span>
                <span
                  className={`font-mono tabular-nums ${
                    insufficientBalance ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {insufficientBalance
                    ? 'Insufficient Wallet Balance'
                    : `₦${(walletBalance - finalCharge).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || uploadingDocKey !== null}
              className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Enrolment Order...</span>
                </>
              ) : (
                <>
                  <span>Review &amp; Submit Enrolment Order (₦{finalCharge.toLocaleString('en-NG')})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Enrolment Order History & Live Status Tracker */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              NIN Enrolment Order History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Track manual processing progress, inspect documents, or poll live provider updates.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'processing', label: 'Processing' },
                { id: 'completed', label: 'Completed' },
                { id: 'refunded', label: 'Refunded' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadOrders}
              disabled={loadingOrders}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Applicant</th>
                <th className="py-3 px-4">Charge</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loadingOrders && orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Loading NIN Enrolment orders...</span>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No NIN Enrolment orders found for this filter yet.
                  </td>
                </tr>
              ) : (
                orders.map(order => {
                  const st = getEnrolmentStatusStyle(order.status);
                  const canPoll =
                    order.status !== 'completed' &&
                    order.status !== 'refunded' &&
                    order.status !== 'failed' &&
                    order.status !== 'rejected';
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {order.order_number}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {order.service_name}
                        </div>
                        {order.refund_reference && (
                          <div className="text-[10px] font-mono text-purple-600 dark:text-purple-300 mt-0.5">
                            Refund: {order.refund_reference}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {order.applicant_name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                          {order.applicant_phone_masked}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                        ₦{Number(order.customer_price).toLocaleString('en-NG')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${st.classes}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(order.created_at).toLocaleString('en-NG')}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {canPoll && (
                          <button
                            type="button"
                            onClick={() => handlePollOrder(order.id)}
                            disabled={pollingId === order.id}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-semibold hover:bg-amber-500/25 inline-flex items-center gap-1 transition"
                          >
                            <RefreshCw className={`w-3 h-3 ${pollingId === order.id ? 'animate-spin' : ''}`} />
                            <span>{pollingId === order.id ? 'Checking...' : 'Check Status'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetailOrder(order)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-semibold transition"
                        >
                          Details
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

      {/* Pre-Submit Order Confirmation Summary Modal */}
      {confirmModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Confirm NIN Enrolment Order
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Service</span>
                  <span className="font-bold text-slate-900 dark:text-white text-right">
                    {selectedService.name}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Applicant Name</span>
                  <span className="font-semibold text-slate-900 dark:text-white text-right">
                    {applicantFullName}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Processing Mode</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300 text-right">
                    {selectedService.manual_label || 'Manual Processing'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Estimated Turnaround</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 text-right">
                    {selectedService.estimated_turnaround}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">Wallet Debit Amount</span>
                  <span className="font-mono font-extrabold text-blue-700 dark:text-emerald-400 tabular-nums">
                    ₦{finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Balance After Debit</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    ₦{(walletBalance - finalCharge).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                <Wallet className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Your wallet will be debited immediately and your order will remain{' '}
                  <strong>Pending Manual Processing</strong> until confirmed completed or refunded.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Edit Details
                </button>
                <button
                  type="button"
                  onClick={handleProceedFromConfirm}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold inline-flex items-center gap-1.5 transition"
                >
                  <span>
                    {user?.has_transaction_pin ? 'Enter Transaction PIN' : 'Confirm & Pay Wallet'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction PIN Modal */}
      <TransactionPinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={verifiedPin => {
          setPinModalOpen(false);
          executeSubmit(verifiedPin);
        }}
        title="Authorize NIN Enrolment Debit"
        description={`Enter your 4-digit Transaction PIN to submit ${selectedService?.name || 'NIN Enrolment'} for ₦${finalCharge.toLocaleString('en-NG')}.`}
        amount={finalCharge}
      />

      {/* Order Details Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {detailOrder.service_name}
                </h4>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  Order {detailOrder.order_number} · Payment {detailOrder.payment_reference}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[11px]">Status</span>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-[10px] font-bold ${getEnrolmentStatusStyle(detailOrder.status).classes}`}>
                    {getEnrolmentStatusStyle(detailOrder.status).label}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Amount Charged</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums mt-1 block">
                    ₦{Number(detailOrder.customer_price).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Estimated Turnaround</span>
                  <span className="text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {detailOrder.estimated_completion_text}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Submitted At</span>
                  <span className="text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {new Date(detailOrder.created_at).toLocaleString('en-NG')}
                  </span>
                </div>
              </div>

              {detailOrder.provider_remarks && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-slate-900 dark:text-white block mb-1">
                    Processing Remarks
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {detailOrder.provider_remarks}
                  </p>
                </div>
              )}

              {detailOrder.refund_reference && (
                <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200">
                  <strong>Wallet Refund Reference:</strong>{' '}
                  <span className="font-mono">{detailOrder.refund_reference}</span>
                </div>
              )}

              <div>
                <h5 className="font-bold text-slate-900 dark:text-white mb-2">
                  Submitted Applicant Fields
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  {Object.entries(detailOrder.submitted_fields || {}).map(([k, v]) => (
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

              {(detailOrder.supporting_documents || []).length > 0 && (
                <div>
                  <h5 className="font-bold text-slate-900 dark:text-white mb-2">
                    Supporting Documents
                  </h5>
                  <div className="space-y-2">
                    {detailOrder.supporting_documents.map(doc => (
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
                            <p className="text-[11px] text-slate-500">
                              {doc.doc_key.replace(/_/g, ' ')}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            openProtectedFile(
                              doc.id,
                              doc.file_url,
                              doc.original_name || doc.doc_key,
                              doc.mime_type,
                              'preview'
                            )
                          }
                          disabled={loadingPreviewId === doc.id}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 hover:bg-slate-100 transition shrink-0"
                        >
                          {loadingPreviewId === doc.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          <span>Preview</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-xs">
              {detailOrder.status !== 'completed' &&
              detailOrder.status !== 'refunded' &&
              detailOrder.status !== 'failed' &&
              detailOrder.status !== 'rejected' ? (
                <button
                  type="button"
                  onClick={() => handlePollOrder(detailOrder.id)}
                  disabled={pollingId === detailOrder.id}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold inline-flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pollingId === detailOrder.id ? 'animate-spin' : ''}`} />
                  <span>{pollingId === detailOrder.id ? 'Checking Provider...' : 'Check Live Status'}</span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Protected Document / Sample Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-bold text-slate-900 dark:text-white truncate pr-4">
                {previewDoc.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewDoc.blobUrl}
                  download={previewDoc.name}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold inline-flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={closePreviewModal}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              {previewDoc.mimeType?.includes('pdf') ? (
                <iframe
                  src={previewDoc.blobUrl}
                  title={previewDoc.name}
                  className="w-full h-[65vh] rounded-xl bg-white"
                />
              ) : (
                <img
                  src={previewDoc.blobUrl}
                  alt={previewDoc.name}
                  className="max-w-full max-h-[68vh] object-contain rounded-xl"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
