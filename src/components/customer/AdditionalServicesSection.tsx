import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileText,
  Upload,
  Lock,
  Loader2,
  Download,
  Eye,
  X,
  Search,
  Send,
  UserCheck,
  AlertTriangle,
  Info,
  ArrowLeft,
  ArrowRight,
  Ban,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  AdditionalServiceCatalogItem,
  AdditionalServiceRequest,
  DocumentChecklistEntry,
  ModificationDocumentAttachment,
  ModificationFormField,
  UnverifiedServiceNotice,
} from '../../types';

interface AdditionalServicesSectionProps {
  initialServiceKey?: string;
  lockedServiceKey?: string;
  allowedServiceKeys?: string[];
  serviceTitleOverride?: string;
  onBackToHub?: () => void;
  onRequestUpdated?: () => void;
  onOpenHistoryTab?: () => void;
}

export function getAdditionalServiceStatusStyle(status: string): {
  label: string;
  badgeClass: string;
} {
  const st = String(status || 'pending').toLowerCase();
  switch (st) {
    case 'completed':
      return {
        label: 'Completed',
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
      };
    case 'processing':
      return {
        label: 'Processing',
        badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
      };
    case 'under_review':
      return {
        label: 'Under Review',
        badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
      };
    case 'assigned':
      return {
        label: 'Assigned to Staff',
        badgeClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
      };
    case 'query_required':
      return {
        label: 'Query / Correction Needed',
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
      };
    case 'refunded':
      return {
        label: 'Refunded',
        badgeClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
      };
    case 'failed':
    case 'rejected':
      return {
        label: st === 'failed' ? 'Failed' : 'Rejected',
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
      };
    default:
      return {
        label: 'Pending',
        badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
      };
  }
}

export function getChecklistStatusBadge(status?: string): {
  label: string;
  className: string;
} {
  const st = String(status || 'pending').toLowerCase();
  if (st === 'verified') {
    return {
      label: 'Verified',
      className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    };
  }
  if (st === 'needs_reupload') {
    return {
      label: 'Needs Re-upload',
      className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (st === 'rejected') {
    return {
      label: 'Rejected',
      className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    };
  }
  return {
    label: 'Pending Review',
    className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  };
}

function isFieldConditionMet(field: ModificationFormField, values: Record<string, any>): boolean {
  const cond = field.conditional_on;
  if (!cond || !cond.field || !Array.isArray(cond.values)) {
    return true;
  }
  const actual = String(values[cond.field] ?? '').trim();
  if (!actual) return false;
  return cond.values.map(v => String(v)).includes(actual);
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `add_${crypto.randomUUID()}`;
  }
  return `add_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const SECTION_TITLES: Record<string, { title: string; subtitle: string }> = {
  applicant: {
    title: '1. Applicant Biodata & Residential Address',
    subtitle: 'Enter the applicant details exactly as required on the NPC Birth Attestation record.',
  },
  father: {
    title: "2. Father's Details",
    subtitle: 'Provide father biodata, origin state/LGA, and residential address.',
  },
  mother: {
    title: "3. Mother's Details",
    subtitle: 'Provide mother biodata, origin state/LGA, and residential address.',
  },
};

export const AdditionalServicesSection: React.FC<AdditionalServicesSectionProps> = ({
  initialServiceKey,
  lockedServiceKey,
  allowedServiceKeys,
  serviceTitleOverride,
  onBackToHub,
  onRequestUpdated,
  onOpenHistoryTab,
}) => {
  const { user, refreshUser } = useAuth();
  const walletBalance = Number(user?.wallet_balance ?? 0);

  const scopedKeys = useMemo(() => {
    if (lockedServiceKey) return [lockedServiceKey];
    if (allowedServiceKeys && allowedServiceKeys.length > 0) return allowedServiceKeys;
    return null;
  }, [lockedServiceKey, allowedServiceKeys]);

  const isDedicatedMode = Boolean(scopedKeys && scopedKeys.length > 0);
  const preferredInitialKey = lockedServiceKey || allowedServiceKeys?.[0] || initialServiceKey || '';

  const [services, setServices] = useState<AdditionalServiceCatalogItem[]>([]);
  const [unverifiedServices, setUnverifiedServices] = useState<UnverifiedServiceNotice[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>(preferredInitialKey);
  const [filterByActiveService, setFilterByActiveService] = useState<boolean>(isDedicatedMode);

  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, ModificationDocumentAttachment>>({});
  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [nonRefundableAck, setNonRefundableAck] = useState(false);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateIdempotencyKey());
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // History / Tracker state
  const [requests, setRequests] = useState<AdditionalServiceRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pollingId, setPollingId] = useState<string | null>(null);

  // Detail & Clarification Drawer/Modal
  const [detailReq, setDetailReq] = useState<AdditionalServiceRequest | null>(null);
  const [infoNote, setInfoNote] = useState('');
  const [infoDocs, setInfoDocs] = useState<Record<string, ModificationDocumentAttachment>>({});
  const [uploadingInfoDoc, setUploadingInfoDoc] = useState(false);
  const [submittingInfo, setSubmittingInfo] = useState(false);

  // Protected Result PDF Preview
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await api.getAdditionalServicesCatalog();
      const list = Array.isArray(res.services) ? res.services : [];
      setServices(list);
      setUnverifiedServices(Array.isArray(res.unverified_services) ? res.unverified_services : []);
      if (list.length > 0) {
        setSelectedKey(prev => {
          if (lockedServiceKey && list.some(s => s.service_key === lockedServiceKey)) {
            return lockedServiceKey;
          }
          if (allowedServiceKeys && allowedServiceKeys.length > 0) {
            if (prev && allowedServiceKeys.includes(prev) && list.some(s => s.service_key === prev)) {
              return prev;
            }
            const firstMatch = list.find(s => allowedServiceKeys.includes(s.service_key));
            if (firstMatch) return firstMatch.service_key;
          }
          if (initialServiceKey && list.some(s => s.service_key === initialServiceKey)) {
            return initialServiceKey;
          }
          if (prev && list.some(s => s.service_key === prev)) {
            return prev;
          }
          return list[0].service_key;
        });
      }
    } catch (e: any) {
      setError(e?.message || 'Unable to load clearance & additional services catalog.');
    } finally {
      setLoadingCatalog(false);
    }
  }, [initialServiceKey, lockedServiceKey, allowedServiceKeys]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.getAdditionalServiceHistory({ limit: 50 });
      setRequests(Array.isArray(res.requests) ? res.requests : []);
    } catch {
      // Keep quiet on passive refresh
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadHistory();
  }, [loadCatalog, loadHistory]);

  useEffect(() => {
    setFilterByActiveService(isDedicatedMode);
    if (lockedServiceKey) {
      setSelectedKey(lockedServiceKey);
    } else if (allowedServiceKeys && allowedServiceKeys.length > 0) {
      setSelectedKey(prev => (prev && allowedServiceKeys.includes(prev) ? prev : allowedServiceKeys[0]));
    } else if (initialServiceKey) {
      setSelectedKey(initialServiceKey);
    }
  }, [isDedicatedMode, lockedServiceKey, allowedServiceKeys, initialServiceKey]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        try {
          URL.revokeObjectURL(previewBlobUrl);
        } catch {
        }
      }
    };
  }, [previewBlobUrl]);

  const visibleCatalogServices = useMemo(() => {
    if (!scopedKeys) return services;
    return services.filter(s => scopedKeys.includes(s.service_key));
  }, [services, scopedKeys]);

  const selectedService = useMemo(() => {
    const pool = visibleCatalogServices.length > 0 ? visibleCatalogServices : services;
    return pool.find(s => s.service_key === selectedKey) || pool[0] || null;
  }, [visibleCatalogServices, services, selectedKey]);

  // Initialize default select values when service changes
  useEffect(() => {
    if (!selectedService) return;
    setFormValues(prev => {
      const next: Record<string, any> = {};
      for (const f of selectedService.form_schema || []) {
        if (f.type === 'select' && f.options && f.options.length > 0) {
          next[f.key] = prev[f.key] && f.options.some(o => o.value === prev[f.key])
            ? prev[f.key]
            : f.options[0].value;
        }
      }
      return next;
    });
    setUploadedDocs({});
    setConsentChecked(false);
    setNonRefundableAck(false);
    setError(null);
    setSuccessMsg(null);
    setIdempotencyKey(generateIdempotencyKey());
  }, [selectedService?.service_key]);

  const visibleFields = useMemo(() => {
    if (!selectedService) return [];
    return (selectedService.form_schema || []).filter(f => isFieldConditionMet(f, formValues));
  }, [selectedService, formValues]);

  const groupedFieldSections = useMemo(() => {
    const hasSections = visibleFields.some(f => Boolean(f.section));
    if (!hasSections) return null;
    const order: string[] = [];
    const map: Record<string, ModificationFormField[]> = {};
    for (const f of visibleFields) {
      const sec = f.section || 'other';
      if (!map[sec]) {
        map[sec] = [];
        order.push(sec);
      }
      map[sec].push(f);
    }
    return order.map(sec => ({
      key: sec,
      meta: SECTION_TITLES[sec] || { title: sec.replace(/_/g, ' '), subtitle: '' },
      fields: map[sec],
    }));
  }, [visibleFields]);

  const handleFieldChange = (key: string, val: any) => {
    setFormValues(prev => ({ ...prev, [key]: val }));
    setError(null);
    setIdempotencyKey(generateIdempotencyKey());
  };

  const handleUploadDoc = async (docKey: string, file?: File | null) => {
    if (!file || !selectedService) return;
    setUploadingDocKey(docKey);
    setError(null);
    try {
      const res = await api.uploadAdditionalServiceDocument(file, docKey, selectedService.service_key);
      if (res.document) {
        setUploadedDocs(prev => ({ ...prev, [docKey]: res.document }));
      }
    } catch (e: any) {
      setError(e?.message || 'Document upload failed.');
    } finally {
      setUploadingDocKey(null);
    }
  };

  const validateBeforeSubmit = (): string | null => {
    if (!selectedService) return 'Please select a service.';
    for (const f of visibleFields) {
      const v = String(formValues[f.key] ?? '').trim();
      if (f.required && !v) {
        return `Please fill in ${f.label}.`;
      }
      if (f.maxLength && v.length > f.maxLength) {
        return `${f.label} cannot exceed ${f.maxLength} characters.`;
      }
      if (f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return `Please enter a valid ${f.label}.`;
      }
    }
    for (const d of selectedService.required_documents || []) {
      if (d.required && !uploadedDocs[d.key]?.id) {
        return `Please upload ${d.label}.`;
      }
    }
    if (!consentChecked) {
      return 'Please confirm authorization consent before submitting.';
    }
    if (!selectedService.is_refundable && !nonRefundableAck) {
      return 'Please acknowledge the Non-Refundable policy for this service before proceeding.';
    }
    const price = Number(selectedService.selling_price ?? selectedService.price ?? 0);
    if (walletBalance < price) {
      return `Insufficient wallet balance (₦${walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}). Required: ₦${price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`;
    }
    return null;
  };

  const handleOpenSubmitModal = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const err = validateBeforeSubmit();
    if (err) {
      setError(err);
      return;
    }
    setPinValue('');
    setPinModalOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedService) return;
    if (!pinValue.trim()) {
      setError('Please enter your transaction PIN.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const docIds: Record<string, string> = {};
      const supportingDocs: Array<{ id: string; doc_key: string }> = [];
      Object.entries(uploadedDocs).forEach(([dk, doc]) => {
        if (doc?.id) {
          docIds[dk] = doc.id;
          supportingDocs.push({ id: doc.id, doc_key: dk });
        }
      });

      const cleanFields: Record<string, any> = {};
      visibleFields.forEach(f => {
        const val = formValues[f.key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          cleanFields[f.key] = String(val).trim();
        }
      });

      const res = await api.submitAdditionalServiceRequest({
        service_key: selectedService.service_key,
        fields: cleanFields,
        document_ids: docIds,
        supporting_documents: supportingDocs,
        consent: consentChecked,
        pin: pinValue.trim(),
        idempotency_key: idempotencyKey,
      });

      setPinModalOpen(false);
      setPinValue('');
      setSuccessMsg(res.message || `Submitted ${res.request?.request_number || ''} successfully.`);
      setIdempotencyKey(generateIdempotencyKey());
      setFormValues(prev => {
        const reset: Record<string, any> = {};
        for (const f of selectedService.form_schema || []) {
          if (f.type === 'select' && f.options && f.options.length > 0) {
            reset[f.key] = prev[f.key] || f.options[0].value;
          }
        }
        return reset;
      });
      setUploadedDocs({});
      setConsentChecked(false);
      setNonRefundableAck(false);
      await Promise.all([loadHistory(), refreshUser()]);
      if (onRequestUpdated) onRequestUpdated();
      if (res.request) {
        setDetailReq(res.request);
      }
    } catch (e: any) {
      setPinModalOpen(false);
      setError(e?.message || 'Submission failed. Please check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePollStatus = async (req: AdditionalServiceRequest) => {
    setPollingId(req.id);
    setError(null);
    try {
      const res = await api.pollAdditionalServiceStatus(req.id);
      if (res.request) {
        setRequests(prev => prev.map(r => (r.id === res.request.id ? res.request : r)));
        if (detailReq?.id === res.request.id) {
          setDetailReq(res.request);
        }
        if (res.refund?.refunded) {
          await refreshUser();
        }
      }
      setSuccessMsg(res.message || 'Status refreshed.');
      if (onRequestUpdated) onRequestUpdated();
    } catch (e: any) {
      setError(e?.message || 'Unable to poll live status right now.');
    } finally {
      setPollingId(null);
    }
  };

  const handlePreviewPdf = async (
    req: AdditionalServiceRequest,
    docMeta?: AdditionalServiceRequest['result_document']
  ) => {
    const targetDoc = docMeta || req.result_document;
    const url =
      targetDoc?.preview_url ||
      targetDoc?.file_url ||
      `/api/additional-services/${encodeURIComponent(req.id)}/result-document`;
    setLoadingPreview(true);
    setError(null);
    try {
      const blobUrl = await api.fetchProtectedDocumentBlob(url);
      if (previewBlobUrl) {
        try {
          URL.revokeObjectURL(previewBlobUrl);
        } catch {
        }
      }
      setPreviewBlobUrl(blobUrl);
      const labelSuffix = docMeta && docMeta.id !== req.result_document?.id ? ` (${docMeta.source_label || 'Slip'})` : '';
      setPreviewTitle(`${req.service_name} — ${req.request_number}${labelSuffix}`);
    } catch (e: any) {
      setError(e?.message || 'Unable to load result PDF preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownloadPdf = async (
    req: AdditionalServiceRequest,
    docMeta?: AdditionalServiceRequest['result_document'],
    dlKeySuffix: string = 'primary'
  ) => {
    const targetDoc = docMeta || req.result_document;
    const url =
      targetDoc?.download_url ||
      (targetDoc?.file_url
        ? `${targetDoc.file_url}${targetDoc.file_url.includes('?') ? '&' : '?'}download=1`
        : `/api/additional-services/${encodeURIComponent(req.id)}/result-document?download=1`);
    setDownloadingId(`${req.id}_${dlKeySuffix}`);
    setError(null);
    try {
      const fname = targetDoc?.original_name || `${req.request_number}_${dlKeySuffix}.pdf`;
      await api.downloadProtectedFile(url, fname);
    } catch (e: any) {
      setError(e?.message || 'Unable to download PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUploadClarificationDoc = async (file?: File | null) => {
    if (!file || !detailReq) return;
    setUploadingInfoDoc(true);
    try {
      const res = await api.uploadAdditionalServiceDocument(file, 'query_response', detailReq.service_key);
      if (res.document) {
        setInfoDocs(prev => ({ ...prev, [res.document.id]: res.document }));
      }
    } catch (e: any) {
      setError(e?.message || 'Clarification file upload failed.');
    } finally {
      setUploadingInfoDoc(false);
    }
  };

  const handleSubmitClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailReq) return;
    const docIds: Record<string, string> = {};
    Object.values(infoDocs).forEach((d, i) => {
      docIds[`query_doc_${i + 1}`] = d.id;
    });
    if (!infoNote.trim() && Object.keys(docIds).length === 0) {
      setError('Please enter a clarification note or attach a document.');
      return;
    }
    setSubmittingInfo(true);
    setError(null);
    try {
      const res = await api.submitAdditionalServiceInfo(detailReq.id, {
        note: infoNote.trim(),
        document_ids: docIds,
      });
      if (res.request) {
        setDetailReq(res.request);
        setRequests(prev => prev.map(r => (r.id === res.request.id ? res.request : r)));
      }
      setInfoNote('');
      setInfoDocs({});
      setSuccessMsg(res.message || 'Clarification submitted for administrator review.');
      if (onRequestUpdated) onRequestUpdated();
    } catch (e: any) {
      setError(e?.message || 'Unable to submit clarification.');
    } finally {
      setSubmittingInfo(false);
    }
  };

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return requests.filter(r => {
      if (filterByActiveService && scopedKeys && !scopedKeys.includes(r.service_key)) {
        return false;
      }
      if (statusFilter !== 'all' && String(r.status).toLowerCase() !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        String(r.request_number || '').toLowerCase().includes(q) ||
        String(r.service_name || '').toLowerCase().includes(q) ||
        String(r.masked_identifier || '').toLowerCase().includes(q) ||
        String(r.payment_reference || '').toLowerCase().includes(q)
      );
    });
  }, [requests, filterByActiveService, scopedKeys, statusFilter, searchTerm]);

  const pollableStatuses = ['pending', 'under_review', 'assigned', 'processing', 'query_required'];
  const useWideFormColumn = visibleFields.length > 6;

  const renderFieldInput = (field: ModificationFormField) => {
    const val = formValues[field.key] ?? '';
    const isWide =
      field.type === 'textarea' ||
      field.key === 'address' ||
      field.key === 'father_address' ||
      field.key === 'mother_address' ||
      field.key === 'email';
    return (
      <div key={field.key} className={`${isWide ? 'sm:col-span-2 ' : ''}space-y-1.5`}>
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={`add-field-${field.key}`}
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            {field.label}
            {field.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
          {field.maxLength && (
            <span className="text-[10px] font-mono tabular-nums text-slate-400">
              {String(val).length}/{field.maxLength}
            </span>
          )}
        </div>

        {field.type === 'select' ? (
          <select
            id={`add-field-${field.key}`}
            value={val}
            onChange={e => handleFieldChange(field.key, e.target.value)}
            required={field.required}
            className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(field.options || []).map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            id={`add-field-${field.key}`}
            rows={3}
            value={val}
            maxLength={field.maxLength}
            onChange={e => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder || ''}
            required={field.required}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <input
            id={`add-field-${field.key}`}
            type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : field.type === 'date' ? 'date' : 'text'}
            value={val}
            maxLength={field.maxLength}
            onChange={e => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder || ''}
            required={field.required}
            className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        {(field.help_text || field.helper) && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {field.help_text || field.helper}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Main Grid: Service Catalog + Form | Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Service Selection & Dynamic Submission Form */}
        <div className={`${useWideFormColumn ? 'lg:col-span-7' : 'lg:col-span-6'} space-y-5`}>
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                {onBackToHub && (
                  <button
                    type="button"
                    onClick={onBackToHub}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-emerald-400 hover:underline mb-0.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Identity Services Hub</span>
                  </button>
                )}
                <span className="block text-[11px] font-mono uppercase tracking-wider text-blue-600 dark:text-emerald-400 font-bold">
                  {isDedicatedMode ? 'Dedicated Service Workspace' : 'Verified Async NIMC / Clearance Services'}
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {serviceTitleOverride || (isDedicatedMode && selectedService ? selectedService.name : 'Clearance, Validation & Personalisation')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isDedicatedMode && selectedService
                    ? selectedService.description
                    : 'Submit genuine async clearance, validation, personalisation, NPC attestation, or NIN delinking requests directly to NIMC/provider pipelines.'}
                </p>
              </div>
              {onOpenHistoryTab && (
                <button
                  type="button"
                  onClick={onOpenHistoryTab}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap transition"
                >
                  Full History
                </button>
              )}
            </div>

            {loadingCatalog ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading verified services...</span>
              </div>
            ) : (
              <>
                {/* Service Picker (Full 7-Service Grid in Hub Mode, Clean Option Switcher when multiple variants like Personalisation V1/V2) */}
                {(!isDedicatedMode || visibleCatalogServices.length > 1) && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {isDedicatedMode
                        ? `Select Personalisation Option (${visibleCatalogServices.length})`
                        : `Select Verified Service (${visibleCatalogServices.length})`}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {visibleCatalogServices.map(srv => {
                        const active = selectedService?.service_key === srv.service_key;
                        const price = Number(srv.selling_price ?? srv.price ?? 0);
                        return (
                          <button
                            key={srv.service_key}
                            type="button"
                            onClick={() => setSelectedKey(srv.service_key)}
                            className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-2 ${
                              active
                                ? 'bg-blue-50/80 dark:bg-emerald-500/10 border-blue-500 dark:border-emerald-500 ring-1 ring-blue-500/20 dark:ring-emerald-500/20'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                                {srv.name}
                              </span>
                              <span className="font-mono tabular-nums text-xs font-extrabold text-blue-700 dark:text-emerald-400 shrink-0">
                                ₦{price.toLocaleString('en-NG')}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px]">
                              <span className="text-slate-500 dark:text-slate-400 truncate">
                                {srv.estimated_turnaround}
                              </span>
                              {srv.is_refundable ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold whitespace-nowrap">
                                  Auto-Refund
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold whitespace-nowrap">
                                  Non-Refundable
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{error}</div>
                  </div>
                )}

                {successMsg && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{successMsg}</div>
                  </div>
                )}

                {selectedService && (
                  <form onSubmit={handleOpenSubmitModal} className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{selectedService.name}</span>
                        <span className="font-mono tabular-nums text-xs font-extrabold text-blue-700 dark:text-emerald-400">
                          ₦{Number(selectedService.selling_price ?? selectedService.price ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {selectedService.description}
                      </p>
                      {selectedService.supported_notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1 border-t border-slate-200/70 dark:border-slate-800/70">
                          {selectedService.supported_notes}
                        </p>
                      )}
                    </div>

                    {/* Non-Refundable Warning Banner for NIN Personalisation 1 & 2 */}
                    {!selectedService.is_refundable && (
                      <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 space-y-2">
                        <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300 text-xs font-bold">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>Non-Refundable Service Policy</span>
                        </div>
                        <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                          Once accepted into the NIMC / provider personalisation queue, this service is <strong>strictly non-refundable</strong> even if the tracking ID cannot be cleared or is rejected upstream. Verify your 15-character Tracking ID carefully before submitting.
                        </p>
                      </div>
                    )}

                    {/* Dynamic Form Schema Fields (Section-Grouped for NPC Attestation, Conditional-Aware) */}
                    {groupedFieldSections ? (
                      <div className="space-y-4">
                        {groupedFieldSections.map(group => (
                          <div
                            key={group.key}
                            className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3"
                          >
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                {group.meta.title}
                              </h4>
                              {group.meta.subtitle && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {group.meta.subtitle}
                                </p>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              {group.fields.map(renderFieldInput)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : visibleFields.length >= 4 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {visibleFields.map(renderFieldInput)}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {visibleFields.map(renderFieldInput)}
                      </div>
                    )}

                    {/* Supporting Documents (Optional / Required per Catalog) */}
                    {(selectedService.required_documents || []).length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Supporting Documents
                        </div>
                        {(selectedService.required_documents || []).map(doc => {
                          const uploaded = uploadedDocs[doc.key];
                          const isUploading = uploadingDocKey === doc.key;
                          return (
                            <div
                              key={doc.key}
                              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    {doc.label}
                                    {doc.required ? (
                                      <span className="text-rose-500 ml-1">*</span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 ml-1.5">(Optional)</span>
                                    )}
                                  </div>
                                  {doc.description && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{doc.description}</p>
                                  )}
                                </div>
                                <label className="shrink-0 cursor-pointer px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                                  {isUploading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="w-3.5 h-3.5" />
                                  )}
                                  <span>{uploaded ? 'Replace' : 'Upload'}</span>
                                  <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                                    className="hidden"
                                    disabled={isUploading}
                                    onChange={e => {
                                      const f = e.target.files?.[0];
                                      void handleUploadDoc(doc.key, f);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                              {uploaded && (
                                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2.5 py-1.5 rounded-xl">
                                  <span className="truncate">{uploaded.original_name || uploaded.file_name}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setUploadedDocs(prev => {
                                        const cp = { ...prev };
                                        delete cp[doc.key];
                                        return cp;
                                      })
                                    }
                                    className="text-rose-600 dark:text-rose-400 font-semibold ml-2"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Wallet Balance Summary */}
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>Wallet Balance</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>Service Charge</span>
                        <span className="font-mono tabular-nums font-bold text-blue-700 dark:text-emerald-400">
                          ₦{Number(selectedService.selling_price ?? selectedService.price ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-semibold">
                        <span className="text-slate-700 dark:text-slate-300">Balance After Debit</span>
                        <span
                          className={`font-mono tabular-nums ${
                            walletBalance < Number(selectedService.selling_price ?? selectedService.price ?? 0)
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {walletBalance < Number(selectedService.selling_price ?? selectedService.price ?? 0)
                            ? 'Insufficient Balance'
                            : `₦${(walletBalance - Number(selectedService.selling_price ?? selectedService.price ?? 0)).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                    </div>

                    {/* Authorization Consent */}
                    <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={e => setConsentChecked(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        <strong className="text-slate-900 dark:text-white">Authorization Consent:</strong> I confirm that the identity holder authorized this NIMC/clearance submission and all submitted details are accurate.
                      </span>
                    </label>

                    {!selectedService.is_refundable && (
                      <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={nonRefundableAck}
                          onChange={e => setNonRefundableAck(e.target.checked)}
                          className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                          I understand this service is <strong>non-refundable</strong> once accepted upstream by NIMC/2SureVerify.
                        </span>
                      </label>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[46px] py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        Authorize &amp; Submit (₦{Number(selectedService.selling_price ?? selectedService.price ?? 0).toLocaleString('en-NG')})
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          {/* Unverified / Not Yet Supported Services Disclosure Panel */}
          {!isDedicatedMode && unverifiedServices.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Services Not Yet Supported
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                The following requested identity services do not have an active, verified provider endpoint and cannot be purchased or submitted:
              </p>
              <div className="space-y-2">
                {unverifiedServices.map(notice => (
                  <div
                    key={notice.service_key}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 opacity-90"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {notice.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold whitespace-nowrap">
                        {notice.label || 'Not Yet Supported'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {notice.description}
                    </p>
                    {notice.alternative_label && notice.alternative_service_key && (
                      <button
                        type="button"
                        onClick={() => setSelectedKey(notice.alternative_service_key!)}
                        className="text-[11px] font-semibold text-blue-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        <span>{notice.alternative_label}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Customer Request Tracker & Status Polling */}
        <div className={`${useWideFormColumn ? 'lg:col-span-5' : 'lg:col-span-6'} rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-sm`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isDedicatedMode && selectedService
                  ? `${selectedService.name} Tracker`
                  : 'Clearance & Additional Request Tracker'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track live provider status, check document reviews, respond to queries, and download official PDFs.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {isDedicatedMode && (
                <button
                  type="button"
                  onClick={() => setFilterByActiveService(prev => !prev)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition whitespace-nowrap"
                >
                  {filterByActiveService ? 'Show All Clearance Orders' : 'Filter to This Service'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadHistory()}
                disabled={loadingHistory}
                className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Search & Status Filter Bar */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by Request ID, Service, or Payment Ref..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'under_review', label: 'Under Review' },
                { key: 'assigned', label: 'Assigned' },
                { key: 'processing', label: 'Processing' },
                { key: 'query_required', label: 'Query Needed' },
                { key: 'completed', label: 'Completed' },
                { key: 'refunded', label: 'Refunded' },
                { key: 'rejected', label: 'Rejected' },
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
                    statusFilter === f.key
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Requests List */}
          {loadingHistory ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading your submissions...</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
              <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No clearance or additional service requests found
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Select one of the verified services on the left to submit a clearance, validation, personalisation, NPC attestation, or delinking order.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
              {filteredRequests.map(req => {
                const st = getAdditionalServiceStatusStyle(req.status);
                const isManualDesk = req.fulfilment_mode === 'internal_manual' || req.provider_id === 'hambak_manual';
                const canPoll = !isManualDesk && pollableStatuses.includes(String(req.status || '').toLowerCase());
                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {req.request_number}
                          </span>
                          <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold whitespace-nowrap ${st.badgeClass}`}>
                            {st.label}
                          </span>
                          {isManualDesk && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[10px] font-semibold whitespace-nowrap">
                              Manual Desk{req.sla_due_at ? ` · Due ${new Date(req.sla_due_at).toLocaleDateString('en-NG')}` : ''}
                            </span>
                          )}
                          {req.is_refundable === false && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[10px] font-semibold">
                              Non-Refundable
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">
                          {req.service_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="font-mono">ID: {req.masked_identifier}</span>
                          <span>&bull;</span>
                          <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                            ₦{Number(req.customer_price || 0).toLocaleString('en-NG')}
                          </span>
                          <span>&bull;</span>
                          <span>{new Date(req.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {req.assigned_staff_name && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[11px] font-medium">
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Assigned Officer: {req.assigned_staff_name}</span>
                      </div>
                    )}

                    {req.requested_corrections && (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300">
                        <strong>Correction Requested:</strong> {req.requested_corrections}
                      </div>
                    )}

                    {req.provider_remarks && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
                        {req.provider_remarks}
                      </div>
                    )}

                    {req.result_details &&
                      Object.entries(req.result_details).some(([, v]) => v !== null && v !== undefined && String(v).trim() !== '') && (
                        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                          {Object.entries(req.result_details)
                            .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
                            .map(([k, v]) => (
                              <div
                                key={k}
                                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-500/25"
                              >
                                <span className="text-[9px] uppercase font-bold text-slate-500 block">
                                  {k.replace(/_/g, ' ')}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-slate-900 dark:text-emerald-300 break-all">
                                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailReq(req);
                          setInfoNote('');
                          setInfoDocs({});
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{req.status === 'query_required' ? 'Respond / Details' : 'Details & Timeline'}</span>
                      </button>

                      {canPoll && (
                        <button
                          type="button"
                          onClick={() => void handlePollStatus(req)}
                          disabled={pollingId === req.id}
                          className="px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5"
                        >
                          {pollingId === req.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          <span>Check Live Status</span>
                        </button>
                      )}

                      {req.has_result_document && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handlePreviewPdf(req)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Preview PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownloadPdf(req)}
                            disabled={downloadingId === `${req.id}_primary`}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5"
                          >
                            {downloadingId === `${req.id}_primary` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            <span>Download PDF</span>
                          </button>
                        </>
                      )}

                      {req.secondary_result_document && (
                        <button
                          type="button"
                          onClick={() => void handleDownloadPdf(req, req.secondary_result_document, 'secondary')}
                          disabled={downloadingId === `${req.id}_secondary`}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5"
                        >
                          {downloadingId === `${req.id}_secondary` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>{req.secondary_result_document.source_label || 'Premium Slip PDF'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Transaction PIN Modal */}
      {pinModalOpen && selectedService && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-600/15 text-blue-600 dark:text-emerald-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Authorize Request</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{selectedService.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">Wallet Debit Amount</span>
              <span className="font-mono tabular-nums font-extrabold text-slate-900 dark:text-white">
                ₦{Number(selectedService.selling_price ?? selectedService.price ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {!selectedService.is_refundable && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300">
                Reminder: This service is non-refundable once accepted upstream.
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="add-tx-pin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Transaction PIN
              </label>
              <input
                id="add-tx-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={pinValue}
                onChange={e => setPinValue(e.target.value)}
                placeholder="Enter 4–6 digit PIN"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-center tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSubmit()}
                disabled={submitting || !pinValue.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{submitting ? 'Submitting...' : 'Confirm & Pay'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Detail, Document Checklist & Clarification Modal */}
      {detailReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-emerald-400">
                    {detailReq.request_number}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                      getAdditionalServiceStatusStyle(detailReq.status).badgeClass
                    }`}
                  >
                    {getAdditionalServiceStatusStyle(detailReq.status).label}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {detailReq.service_name}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Payment Ref: {detailReq.payment_reference} &bull; ₦{Number(detailReq.customer_price || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailReq(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailReq.assigned_staff_name && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-800 dark:text-cyan-300">
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>Assigned Case Officer: <strong>{detailReq.assigned_staff_name}</strong></span>
              </div>
            )}

            {detailReq.requested_corrections && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Action / Correction Requested</span>
                </div>
                <p>{detailReq.requested_corrections}</p>
              </div>
            )}

            {detailReq.provider_remarks && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Status Remarks</div>
                <p>{detailReq.provider_remarks}</p>
              </div>
            )}

            {/* Official Result Document(s) & Returned Tracking / NIN Details */}
            {(detailReq.has_result_document ||
              detailReq.secondary_result_document ||
              (detailReq.result_details && Object.keys(detailReq.result_details).length > 0)) && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 space-y-3">
                {detailReq.has_result_document && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        Official Result PDF Available
                      </div>
                      <p className="text-[11px] text-emerald-700/90 dark:text-emerald-200/80">
                        {detailReq.result_document?.source_label || 'Verified Result Document'}
                        {detailReq.provider_tracking_id ? ` • Tracking ID: ${detailReq.provider_tracking_id}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => void handlePreviewPdf(detailReq)}
                        disabled={loadingPreview}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-600 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5"
                      >
                        {loadingPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadPdf(detailReq)}
                        disabled={downloadingId === `${detailReq.id}_primary`}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                )}

                {detailReq.secondary_result_document && (
                  <div className="pt-2.5 border-t border-emerald-200/70 dark:border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                        {detailReq.secondary_result_document.source_label || 'Secondary Official Slip PDF'}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {detailReq.secondary_result_document.original_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handlePreviewPdf(detailReq, detailReq.secondary_result_document)}
                        disabled={loadingPreview}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-500/50 text-xs font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Slip</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadPdf(detailReq, detailReq.secondary_result_document, 'secondary')}
                        disabled={downloadingId === `${detailReq.id}_secondary`}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Slip</span>
                      </button>
                    </div>
                  </div>
                )}

                {detailReq.result_details &&
                  Object.entries(detailReq.result_details).some(([, v]) => v !== null && v !== undefined && String(v).trim() !== '') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {Object.entries(detailReq.result_details)
                        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-slate-800"
                          >
                            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                              {k.replace(/_/g, ' ')}
                            </div>
                            <div className="text-xs font-mono font-bold text-slate-900 dark:text-emerald-300 mt-0.5 break-all">
                              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
              </div>
            )}

            {/* Submitted Parameters & Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(detailReq.submitted_fields || {})
                .filter(([k]) => !['query_review_status', 'customer_query_response', 'customer_query_responded_at', 'pin'].includes(k))
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                      {k.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs font-mono text-slate-900 dark:text-white mt-0.5 break-all">
                      {String(v || '—')}
                    </div>
                  </div>
                ))}
            </div>

            {/* Supporting Documents & Checklist Verification States */}
            {(detailReq.supporting_documents || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Supporting Documents &amp; Review Checklist
                </div>
                <div className="space-y-2">
                  {(detailReq.supporting_documents || []).map(doc => {
                    const chk: DocumentChecklistEntry | undefined =
                      detailReq.document_review_checklist?.[doc.doc_key] ||
                      detailReq.document_review_checklist?.[doc.id];
                    const chkBadge = getChecklistStatusBadge(chk?.status);
                    return (
                      <div
                        key={doc.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {doc.original_name || doc.file_name || doc.doc_key}
                          </div>
                          {chk?.note && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                              Reviewer Note: {chk.note}
                            </div>
                          )}
                        </div>
                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold self-start sm:self-center ${chkBadge.className}`}>
                          {chkBadge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Query Clarification Submission Box */}
            {detailReq.status === 'query_required' && (
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-3">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4" />
                  <span>Submit Clarification / Corrected Document</span>
                </div>
                {detailReq.query_review_status === 'submitted_for_admin_review' ? (
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Your clarification response has been received and is currently queued for administrator review.
                  </p>
                ) : (
                  <form onSubmit={handleSubmitClarification} className="space-y-3">
                    <textarea
                      rows={3}
                      value={infoNote}
                      onChange={e => setInfoNote(e.target.value)}
                      placeholder="Explain corrections or provide requested details..."
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/40 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/40 text-xs font-semibold text-amber-900 dark:text-amber-200 inline-flex items-center gap-1.5">
                        {uploadingInfoDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        <span>Attach Corrected Document</span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          className="hidden"
                          disabled={uploadingInfoDoc}
                          onChange={e => {
                            void handleUploadClarificationDoc(e.target.files?.[0]);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={submittingInfo}
                        className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        {submittingInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Submit Clarification</span>
                      </button>
                    </div>
                    {Object.values(infoDocs).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.values(infoDocs).map(d => (
                          <span key={d.id} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {d.original_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* Status History Timeline */}
            {(detailReq.status_history || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Status Timeline</span>
                </div>
                <div className="space-y-2">
                  {(detailReq.status_history || []).map(ev => (
                    <div
                      key={ev.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex items-start justify-between gap-2"
                    >
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 uppercase text-[10px]">
                          {ev.new_status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-2">by {ev.actor_type}</span>
                        {ev.remarks && <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{ev.remarks}</p>}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Protected Result PDF Preview Modal */}
      {previewBlobUrl && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl h-[85vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{previewTitle}</div>
              <button
                type="button"
                onClick={() => {
                  try {
                    URL.revokeObjectURL(previewBlobUrl);
                  } catch {
                  }
                  setPreviewBlobUrl(null);
                }}
                className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe src={previewBlobUrl} title={previewTitle} className="w-full flex-1 bg-slate-100" />
          </div>
        </div>
      )}
    </div>
  );
};
