/**
 * @file ModificationSection.tsx
 * Stage 3 Customer Workspace for Manual NIN Modification and Manual BVN Modification.
 * Strictly isolates NIN Modification and BVN Modification workflows, dynamic schemas,
 * supporting document uploads, wallet balance & dynamic charge validation,
 * pending manual confirmation, live status polling, and admin query responses.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  ModificationBvnTypeItem,
  ModificationDocumentAttachment,
  ModificationFormField,
  ModificationRequestItem,
  ModificationServiceItem,
} from '../../types';
import { TransactionPinModal } from './TransactionPinModal';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';

interface ModificationSectionProps {
  mode: 'NIN' | 'BVN';
  services: ModificationServiceItem[];
  loadingServices?: boolean;
  onOpenHistoryTab?: () => void;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `mod_${crypto.randomUUID()}`;
  }
  return `mod_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getModificationStatusStyle(status: string): {
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
      label: 'Action / Info Required',
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

function isFieldVisible(field: ModificationFormField, values: Record<string, string>): boolean {
  if (!field.conditional_on || !field.conditional_on.field || !Array.isArray(field.conditional_on.values)) {
    return true;
  }
  const current = String(values[field.conditional_on.field] ?? '').trim();
  return field.conditional_on.values.includes(current);
}

export const ModificationSection: React.FC<ModificationSectionProps> = ({
  mode,
  services,
  loadingServices = false,
  onOpenHistoryTab,
}) => {
  const { user, refreshUser, updateBalance } = useAuth();

  // Strictly scope services to active identity domain (NIN or BVN only)
  const domainServices = useMemo(() => {
    const targetCat = mode === 'BVN' ? 'bvn_modification' : 'nin_modification';
    return (services || []).filter(
      s =>
        s.enabled !== false &&
        s.is_active !== false &&
        (s.identity_type === mode || s.category === targetCat)
    );
  }, [services, mode]);

  const [ninStep, setNinStep] = useState<'select' | 'form'>('select');
  const [selectedServiceKey, setSelectedServiceKey] = useState<string>('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  const [passwordVisible, setPasswordVisible] = useState<boolean>(false);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, ModificationDocumentAttachment>>({});
  const [localDocPreviewUrls, setLocalDocPreviewUrls] = useState<Record<string, string>>({});
  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);

  // BVN Modification enrollment types
  const [bvnTypes, setBvnTypes] = useState<ModificationBvnTypeItem[]>([]);
  const [loadingBvnTypes, setLoadingBvnTypes] = useState<boolean>(false);
  const [bvnTypesNote, setBvnTypesNote] = useState<string | null>(null);

  // Submission & Confirmation state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const inFlightRef = useRef<boolean>(false);
  const serviceSeqRef = useRef<number>(0);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => createIdempotencyKey());
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<ModificationRequestItem | null>(null);

  // Domain-scoped request history & tracker
  const [requests, setRequests] = useState<ModificationRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pollingId, setPollingId] = useState<string | null>(null);

  // Query response inline state
  const [queryTargetId, setQueryTargetId] = useState<string | null>(null);
  const [queryNote, setQueryNote] = useState<string>('');
  const [queryDocs, setQueryDocs] = useState<Record<string, ModificationDocumentAttachment>>({});
  const [uploadingQueryDoc, setUploadingQueryDoc] = useState<boolean>(false);
  const [submittingQuery, setSubmittingQuery] = useState<boolean>(false);

  // Protected Document Preview Modal
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    mimeType?: string;
    blobUrl: string;
    isTemporaryObjectUrl?: boolean;
  } | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  // Reset form completely when mode switches (ensures zero NIN/BVN field leakage)
  useEffect(() => {
    serviceSeqRef.current += 1;
    Object.values(localDocPreviewUrls).forEach(u => {
      try {
        URL.revokeObjectURL(u);
      } catch {
      }
    });
    setNinStep('select');
    setFormValues({});
    setFieldErrors({});
    setDocErrors({});
    setUploadedDocs({});
    setLocalDocPreviewUrls({});
    setUploadingDocKey(null);
    setConsentChecked(false);
    setFormError(null);
    setSubmitSuccessMsg(null);
    setSubmittedRequest(null);
    setPasswordVisible(false);
    setQueryTargetId(null);
    setIdempotencyKey(createIdempotencyKey());
    if (mode === 'BVN' && domainServices.length > 0) {
      setSelectedServiceKey(domainServices[0].key || domainServices[0].service_key);
    } else {
      setSelectedServiceKey('');
    }
  }, [mode]);

  // Ensure selected service stays valid in current domain without auto-selecting a NIN card before user chooses
  useEffect(() => {
    if (domainServices.length === 0) return;
    const valid = domainServices.some(s => (s.key || s.service_key) === selectedServiceKey);
    if (mode === 'NIN') {
      if (selectedServiceKey && !valid) {
        setSelectedServiceKey('');
        setNinStep('select');
      }
      return;
    }
    if (!selectedServiceKey || !valid) {
      setSelectedServiceKey(domainServices[0].key || domainServices[0].service_key);
    }
  }, [domainServices, selectedServiceKey, mode]);

  // Fetch BVN Enrollment Types strictly in BVN mode
  useEffect(() => {
    if (mode === 'BVN') {
      loadBvnTypes(false);
    }
  }, [mode]);

  useEffect(() => {
    loadRequests();
  }, [mode, statusFilter]);

  const loadBvnTypes = async (refresh = false) => {
    try {
      setLoadingBvnTypes(true);
      const res = await api.getModificationBvnTypes(refresh);
      if (res?.success) {
        const list = (res.bvn_types || []).filter(t => t.is_active !== false);
        setBvnTypes(list);
        setBvnTypesNote(res.sync_note || null);
        if (list.length > 0 && !formValues.enrollment_type) {
          setFormValues(prev => ({
            ...prev,
            enrollment_type: prev.enrollment_type || list[0].enrollment_type,
          }));
        }
      }
    } catch (err: any) {
      setBvnTypesNote(err?.message || 'Unable to load enrollment types right now.');
    } finally {
      setLoadingBvnTypes(false);
    }
  };

  const loadRequests = async () => {
    try {
      setLoadingRequests(true);
      const res = await api.getModificationHistory({
        identity_type: mode,
        status: statusFilter,
        limit: 30,
      });
      if (res?.success) {
        setRequests(res.requests || []);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const selectedService = useMemo(() => {
    if (domainServices.length === 0) return null;
    if (mode === 'NIN') {
      if (!selectedServiceKey) return null;
      return domainServices.find(s => (s.key || s.service_key) === selectedServiceKey) || null;
    }
    return (
      domainServices.find(s => (s.key || s.service_key) === selectedServiceKey) ||
      domainServices[0] ||
      null
    );
  }, [domainServices, selectedServiceKey, mode]);

  const activeBvnTypes = useMemo(() => {
    return bvnTypes.filter(t => t.is_active !== false);
  }, [bvnTypes]);

  const selectedBvnType = useMemo(() => {
    if (mode !== 'BVN') return null;
    const chosen = formValues.enrollment_type;
    if (chosen) {
      return activeBvnTypes.find(t => t.enrollment_type === chosen) || null;
    }
    return activeBvnTypes[0] || null;
  }, [mode, formValues.enrollment_type, activeBvnTypes]);

  const finalCharge = useMemo(() => {
    if (!selectedService) return 0;
    if (mode === 'BVN' && selectedBvnType && Number(selectedBvnType.selling_price) > 0) {
      return Number(selectedBvnType.selling_price);
    }
    return Number(selectedService.selling_price ?? selectedService.price ?? 0);
  }, [selectedService, mode, selectedBvnType]);

  const walletBalance = Number(user?.wallet_balance ?? 0);
  const insufficientBalance = walletBalance < finalCharge;

  const visibleSchemaFields = useMemo(() => {
    if (!selectedService) return [];
    return (selectedService.form_schema || []).filter(f => isFieldVisible(f, formValues));
  }, [selectedService, formValues]);

  const checklistProgress = useMemo(() => {
    const reqFields = visibleSchemaFields.filter(f => f.required);
    const filledReqFields = reqFields.filter(f => String(formValues[f.key] ?? '').trim() !== '').length;
    const reqDocs = (selectedService?.required_documents || []).filter(d => d.required);
    const uploadedReqDocs = reqDocs.filter(d => Boolean(uploadedDocs[d.key])).length;
    return {
      totalReqFields: reqFields.length,
      filledReqFields,
      totalReqDocs: reqDocs.length,
      uploadedReqDocs,
    };
  }, [visibleSchemaFields, formValues, selectedService, uploadedDocs]);

  const handleSelectService = (srv: ModificationServiceItem | null) => {
    serviceSeqRef.current += 1;
    Object.values(localDocPreviewUrls).forEach(u => {
      try {
        URL.revokeObjectURL(u);
      } catch {
      }
    });
    setSelectedServiceKey(srv ? (srv.key || srv.service_key) : '');
    if (!srv && mode === 'NIN') {
      setNinStep('select');
    }
    setFormValues(prev => {
      const next: Record<string, string> = {};
      if (mode === 'BVN' && prev.enrollment_type) {
        next.enrollment_type = prev.enrollment_type;
      }
      return next;
    });
    setFieldErrors({});
    setDocErrors({});
    setUploadedDocs({});
    setLocalDocPreviewUrls({});
    setUploadingDocKey(null);
    setConsentChecked(false);
    setPasswordVisible(false);
    setFormError(null);
    setSubmitSuccessMsg(null);
    setSubmittedRequest(null);
    setIdempotencyKey(createIdempotencyKey());
  };

  const handleFieldChange = (key: string, val: string) => {
    setFormValues(prev => {
      const next = { ...prev, [key]: val };
      // Clear any newly hidden conditional fields so stale data never leaks
      if (selectedService) {
        for (const f of selectedService.form_schema || []) {
          if (f.conditional_on && !isFieldVisible(f, next) && next[f.key] !== undefined) {
            delete next[f.key];
          }
        }
      }
      return next;
    });
    setFieldErrors(prev => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setFormError(null);
  };

  const handleDocumentUpload = async (
    docKey: string,
    file: File | null,
    acceptedFormats?: string[],
    maxSizeMb?: number
  ) => {
    if (!file) return;
    setFormError(null);
    setDocErrors(prev => {
      const copy = { ...prev };
      delete copy[docKey];
      return copy;
    });

    const allowedExts = (acceptedFormats && acceptedFormats.length > 0 ? acceptedFormats : ['JPG', 'PNG', 'WEBP', 'PDF'])
      .flatMap(f => {
        const lower = f.toLowerCase().trim();
        return lower === 'jpg' ? ['jpg', 'jpeg'] : [lower];
      });
    const maxBytes = (maxSizeMb && maxSizeMb > 0 ? maxSizeMb : 5) * 1024 * 1024;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExts.includes(ext)) {
      const msg = `Invalid format (.${ext || 'unknown'}). Allowed: ${(acceptedFormats || ['JPG', 'PNG', 'WEBP', 'PDF']).join(', ')}.`;
      setDocErrors(prev => ({ ...prev, [docKey]: msg }));
      setFormError(msg);
      return;
    }
    if (file.size > maxBytes) {
      const msg = `"${file.name}" exceeds the ${maxSizeMb || 5}MB maximum file limit.`;
      setDocErrors(prev => ({ ...prev, [docKey]: msg }));
      setFormError(msg);
      return;
    }

    const uploadSeq = serviceSeqRef.current;
    try {
      setUploadingDocKey(docKey);
      const activeSvcKey = selectedService?.key || selectedService?.service_key;
      const res = await api.uploadModificationDocument(file, docKey, activeSvcKey);
      if (serviceSeqRef.current !== uploadSeq) {
        return;
      }
      if (res?.success && res.document) {
        const objUrl = URL.createObjectURL(file);
        setLocalDocPreviewUrls(prev => {
          if (prev[docKey]) {
            try {
              URL.revokeObjectURL(prev[docKey]);
            } catch {
            }
          }
          return { ...prev, [docKey]: objUrl };
        });
        setUploadedDocs(prev => ({
          ...prev,
          [docKey]: res.document,
        }));
      } else {
        const msg = 'Document upload did not return file confirmation.';
        setDocErrors(prev => ({ ...prev, [docKey]: msg }));
        setFormError(msg);
      }
    } catch (err: any) {
      if (serviceSeqRef.current !== uploadSeq) {
        return;
      }
      const msg = err?.message || 'Unable to upload supporting document. Please try again.';
      setDocErrors(prev => ({ ...prev, [docKey]: msg }));
      setFormError(msg);
    } finally {
      if (serviceSeqRef.current === uploadSeq) {
        setUploadingDocKey(null);
      }
    }
  };

  const handleRemoveDocument = (docKey: string) => {
    setUploadedDocs(prev => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
    setLocalDocPreviewUrls(prev => {
      if (prev[docKey]) {
        try {
          URL.revokeObjectURL(prev[docKey]);
        } catch {
        }
      }
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
    setDocErrors(prev => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
  };

  const validateBeforeSubmit = (): string | null => {
    if (!selectedService) {
      return `No ${mode} Modification service is currently active.`;
    }

    const nextFieldErrors: Record<string, string> = {};
    const nextDocErrors: Record<string, string> = {};
    let firstError: string | null = null;

    const schema: ModificationFormField[] = selectedService.form_schema || [];
    for (const f of schema) {
      if (!isFieldVisible(f, formValues)) continue;
      const val = String(formValues[f.key] ?? '').trim();
      if (f.required && !val) {
        const msg = `${f.label} is required.`;
        nextFieldErrors[f.key] = msg;
        if (!firstError) firstError = msg;
        continue;
      }
      if (val) {
        if (['nin', 'parent_nin', 'bvn'].includes(f.key)) {
          const digits = val.replace(/\D/g, '');
          if (digits.length !== 11) {
            const msg = `${f.label} must be exactly 11 digits.`;
            nextFieldErrors[f.key] = msg;
            if (!firstError) firstError = msg;
          }
        }
        if (['phone', 'previous_phone'].includes(f.key)) {
          const digits = val.replace(/\D/g, '');
          if (digits.length < 10 || digits.length > 13) {
            const msg = `${f.label} must be a valid Nigerian phone number (10–13 digits).`;
            nextFieldErrors[f.key] = msg;
            if (!firstError) firstError = msg;
          }
        }
        if (f.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          const msg = 'Please provide a valid email address.';
          nextFieldErrors[f.key] = msg;
          if (!firstError) firstError = msg;
        }
        if (f.type === 'date') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
            const msg = `${f.label} must be a valid date (YYYY-MM-DD).`;
            nextFieldErrors[f.key] = msg;
            if (!firstError) firstError = msg;
          } else {
            const parsed = new Date(`${val}T00:00:00`);
            const todayIso = new Date().toISOString().split('T')[0];
            if (Number.isNaN(parsed.getTime()) || val > todayIso) {
              const msg = `${f.label} cannot be in the future.`;
              nextFieldErrors[f.key] = msg;
              if (!firstError) firstError = msg;
            }
          }
        }
      }
    }

    if (mode === 'BVN' && activeBvnTypes.length > 0 && !formValues.enrollment_type && !selectedBvnType) {
      const msg = 'Please select your BVN Modification enrollment bank / type.';
      nextFieldErrors.enrollment_type = msg;
      if (!firstError) firstError = msg;
    }

    const reqDocs = selectedService.required_documents || [];
    for (const d of reqDocs) {
      if (d.required && !uploadedDocs[d.key]) {
        const msg = `Required document missing: ${d.label}.`;
        nextDocErrors[d.key] = msg;
        if (!firstError) firstError = msg;
      }
    }

    setFieldErrors(nextFieldErrors);
    setDocErrors(nextDocErrors);

    if (firstError) {
      return firstError;
    }

    if (!consentChecked) {
      return 'Please accept the legal authorization declaration before submitting your request.';
    }

    if (insufficientBalance) {
      return `Insufficient wallet balance. Available: ₦${walletBalance.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
      })}, Required: ₦${finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`;
    }

    return null;
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || inFlightRef.current) return;

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (user?.has_transaction_pin) {
      setPinModalOpen(true);
    } else {
      executeSubmit();
    }
  };

  const executeSubmit = async (verifiedPin?: string) => {
    if (!selectedService || submitting || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setFormError(null);
    setSubmitSuccessMsg(null);

    try {
      // Strictly include only visible fields belonging to the active service schema
      const payloadFields: Record<string, any> = {};
      for (const f of visibleSchemaFields) {
        const v = formValues[f.key];
        if (v !== undefined && String(v).trim() !== '') {
          payloadFields[f.key] = String(v).trim();
        }
      }
      if (mode === 'BVN' && !payloadFields.enrollment_type && selectedBvnType) {
        payloadFields.enrollment_type = selectedBvnType.enrollment_type;
      }

      const documentIdsMap: Record<string, string> = {};
      const supportingDocsArr: Array<{ id: string; doc_key: string }> = [];
      Object.entries(uploadedDocs).forEach(([key, doc]) => {
        if (doc?.id) {
          documentIdsMap[key] = doc.id;
          supportingDocsArr.push({ id: doc.id, doc_key: doc.doc_key || key });
        }
      });

      const res = await api.submitModificationRequest({
        identity_type: mode,
        service_key: selectedService.key || selectedService.service_key,
        fields: payloadFields,
        document_ids: documentIdsMap,
        supporting_documents: supportingDocsArr,
        consent: true,
        pin: verifiedPin,
        idempotency_key: idempotencyKey,
      });

      if (res?.success && res.request) {
        if (typeof res.balance_after === 'number') {
          updateBalance(res.balance_after);
        } else if (typeof res.newBalance === 'number') {
          updateBalance(res.newBalance);
        }

        setSubmittedRequest(res.request);
        setSubmitSuccessMsg(
          res.message ||
            `${mode} modification request ${res.request.request_number} submitted for manual processing.`
        );
        // Clear sensitive fields cleanly after successful submission
        setFormValues(prev => {
          const next: Record<string, string> = {};
          if (mode === 'BVN' && prev.enrollment_type) {
            next.enrollment_type = prev.enrollment_type;
          }
          return next;
        });
        setFieldErrors({});
        setDocErrors({});
        setUploadedDocs({});
        setLocalDocPreviewUrls({});
        setConsentChecked(false);
        setPasswordVisible(false);
        setIdempotencyKey(createIdempotencyKey());
        void Promise.allSettled([refreshUser(), loadRequests()]);
      } else {
        setFormError(res?.message || 'Unable to submit modification request.');
      }
    } catch (err: any) {
      if (err?.payload?.requires_pin || err?.payload?.data?.requires_pin) {
        setPinModalOpen(true);
        setFormError(null);
      } else {
        setFormError(err?.message || 'Modification submission failed. Please review your details and try again.');
        void Promise.allSettled([refreshUser(), loadRequests()]);
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handlePollStatus = async (reqId: string) => {
    try {
      setPollingId(reqId);
      setFormError(null);
      const res = await api.pollModificationStatus(reqId);
      if (res?.success && res.request) {
        setSubmitSuccessMsg(res.message);
        if (submittedRequest?.id === reqId) {
          setSubmittedRequest(res.request);
        }
        await Promise.allSettled([loadRequests(), refreshUser()]);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Unable to refresh live status right now.');
    } finally {
      setPollingId(null);
    }
  };

  const handleViewDocument = async (doc: ModificationDocumentAttachment) => {
    try {
      setLoadingPreviewId(doc.id);
      const blobUrl = await api.fetchProtectedDocumentBlob(doc.file_url);
      setPreviewDoc({
        name: doc.original_name || doc.file_name || doc.doc_key,
        mimeType: doc.mime_type,
        blobUrl,
      });
    } catch (err: any) {
      setFormError(err?.message || 'Unable to open document preview.');
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const handleUploadQueryDoc = async (file: File | null) => {
    if (!file) return;
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExts.includes(ext)) {
      setFormError('Invalid file format. Upload JPG, PNG, WEBP, or PDF files only.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('File exceeds the 5MB maximum size limit.');
      return;
    }
    try {
      setUploadingQueryDoc(true);
      const key = `query_doc_${Object.keys(queryDocs).length + 1}`;
      const res = await api.uploadModificationDocument(file, key);
      if (res?.success && res.document) {
        setQueryDocs(prev => ({ ...prev, [key]: res.document }));
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to upload additional document.');
    } finally {
      setUploadingQueryDoc(false);
    }
  };

  const handleSubmitQueryInfo = async (reqId: string) => {
    if (!queryNote.trim() && Object.keys(queryDocs).length === 0) {
      setFormError('Enter an explanation note or upload a requested document before sending.');
      return;
    }
    try {
      setSubmittingQuery(true);
      const docIds: Record<string, string> = {};
      Object.entries(queryDocs).forEach(([k, d]) => {
        if (d?.id) docIds[k] = d.id;
      });
      const res = await api.submitModificationAdditionalInfo(reqId, {
        note: queryNote.trim(),
        document_ids: docIds,
      });
      if (res?.success) {
        setSubmitSuccessMsg(res.message || 'Additional information submitted for review.');
        setQueryTargetId(null);
        setQueryNote('');
        setQueryDocs({});
        await loadRequests();
      }
    } catch (err: any) {
      setFormError(err?.message || 'Unable to submit response to query.');
    } finally {
      setSubmittingQuery(false);
    }
  };

  const sectionTitle = mode === 'BVN' ? 'BVN Modification Services' : 'NIN Modification Services';
  const sectionSubtitle =
    mode === 'BVN'
      ? 'Manual Bank Verification Number (BVN) updates submitted for official NIBSS / bank processing. Supporting documents and legal consent are required.'
      : 'Select a specific NIMC NIN Modification service below. Every request requires accurate supporting details, documents, and manual verification processing.';

  return (
    <div className="space-y-6 font-sans">
      {submittedRequest && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Request Submitted for Manual Processing
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {submittedRequest.service_name} &middot; Ref{' '}
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {submittedRequest.request_number}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handlePollStatus(submittedRequest.id)}
              disabled={pollingId === submittedRequest.id}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pollingId === submittedRequest.id ? 'animate-spin' : ''}`} />
              <span>Check Live Status</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                Current Status
              </span>
              <span className="font-bold text-amber-700 dark:text-amber-300 mt-0.5 block">
                {getModificationStatusStyle(submittedRequest.status).label}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                Amount Charged
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                ₦{Number(submittedRequest.customer_price).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                Payment Reference
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block break-all">
                {submittedRequest.payment_reference}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                Submitted &amp; Est. Time
              </span>
              <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                {submittedRequest.estimated_completion_text}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                {new Date(submittedRequest.created_at).toLocaleString('en-NG')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Compact Step 1 for NIN Modification: Single Dropdown + Selected Service Preview & Continue */}
      {mode === 'NIN' && ninStep === 'select' ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                NIN Modification
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Choose a NIMC modification service to review its pricing and estimated timeframe before continuing.
              </p>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 shrink-0 tabular-nums">
              <span className="font-medium text-amber-700 dark:text-amber-300">Manual Processing</span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-mono font-semibold">{domainServices.length} Services</span>
            </div>
          </div>

          <div className="max-w-2xl space-y-2">
            <label
              htmlFor="nin-modification-select"
              className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200"
            >
              Select a modification service:
            </label>
            {loadingServices && domainServices.length === 0 ? (
              <div className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading NIN modification services...</span>
              </div>
            ) : (
              <select
                id="nin-modification-select"
                value={selectedServiceKey}
                onChange={e => {
                  const key = e.target.value;
                  const found = domainServices.find(s => (s.key || s.service_key) === key) || null;
                  handleSelectService(found);
                }}
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose NIN Modification</option>
                {domainServices.map(srv => {
                  const key = srv.key || srv.service_key;
                  const price = Number(srv.selling_price ?? srv.price ?? 0);
                  return (
                    <option key={key} value={key}>
                      {srv.name} — ₦{price.toLocaleString('en-NG')} ({srv.estimated_turnaround || 'Manual Processing'})
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Display ONLY the selected service summary + Continue button once picked */}
          {selectedService && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{selectedService.manual_label || 'Manual Processing'}</span>
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {selectedService.estimated_turnaround || '3 – 10 Business Days'}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {selectedService.name}
                  </h3>

                  {selectedService.description && (
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                      {selectedService.description}
                    </p>
                  )}

                  {selectedService.supported_notes && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                      {selectedService.supported_notes} Estimated timeframes are customer-facing guidelines and are not guaranteed completion dates.
                    </p>
                  )}
                </div>

                <div className="sm:text-right shrink-0">
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 block">
                    HAMBAK Customer Price
                  </span>
                  <span className="text-2xl font-extrabold font-mono text-blue-700 dark:text-emerald-400 tabular-nums mt-0.5 block">
                    ₦{finalCharge.toLocaleString('en-NG')}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Service-specific fields and required document uploads load on the next step.
                </span>
                <button
                  id="nin-mod-continue-btn"
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setSubmitSuccessMsg(null);
                    setNinStep('form');
                  }}
                  className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Compact switcher header when a NIN Modification form is active */}
          {mode === 'NIN' && selectedService && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <button
                type="button"
                id="nin-mod-back-btn"
                onClick={() => setNinStep('select')}
                className="inline-flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap w-fit transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change NIN Service</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[320px]">
                <label htmlFor="nin-modification-select" className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:inline">
                  Service:
                </label>
                <select
                  id="nin-modification-select"
                  value={selectedServiceKey}
                  onChange={e => {
                    const key = e.target.value;
                    const found = domainServices.find(s => (s.key || s.service_key) === key) || null;
                    handleSelectService(found);
                  }}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {domainServices.map(srv => {
                    const key = srv.key || srv.service_key;
                    const price = Number(srv.selling_price ?? srv.price ?? 0);
                    return (
                      <option key={key} value={key}>
                        {srv.name} — ₦{price.toLocaleString('en-NG')}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {/* Main Split Workspace: Left Requirements (plus BVN header in BVN mode), Right Service-Specific Form */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Column 1: Mandatory Checklist & Service Summary */}
            <div className="lg:col-span-5 space-y-4">
              {mode === 'BVN' && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-blue-700 dark:text-emerald-400">
                      NIBSS / Bank BVN Workflow
                    </span>
                    <span className="font-medium text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Manual Processing</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {sectionTitle}
                    </h2>
                    <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                      {domainServices.length} {domainServices.length === 1 ? 'Service' : 'Services'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {sectionSubtitle}
                  </p>
                </div>
              )}

              {/* Mandatory Requirements Summary Card for Selected Service */}
              {selectedService && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Service Checklist &amp; Requirements
                    </h3>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{selectedService.manual_label || 'Manual Processing'}</span>
                    </span>
                  </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedService.description}
              </p>

              {selectedService.supported_notes && (
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/20 text-[11px] text-blue-900 dark:text-blue-200 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                  <span className="leading-relaxed">{selectedService.supported_notes}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                    Customer Price
                  </span>
                  <span className="text-sm font-extrabold font-mono text-blue-700 dark:text-emerald-400 tabular-nums mt-0.5 block">
                    ₦{finalCharge.toLocaleString('en-NG')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                    Estimated Turnaround
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
                    {selectedService.estimated_turnaround || '3 – 10 Business Days'}
                  </span>
                </div>
              </div>

              {/* Required Information Checklist */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Required Information
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {visibleSchemaFields.map(field => (
                    <li key={field.key} className="flex items-center gap-2">
                      <CheckCircle2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          String(formValues[field.key] ?? '').trim()
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span>
                        {field.label}
                        {!field.required && (
                          <span className="text-slate-400 ml-1">(Optional)</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Required Supporting Documents Checklist */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Required Supporting Documents
                </h4>
                {(selectedService.required_documents || []).length > 0 ? (
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {selectedService.required_documents.map(doc => (
                      <li key={doc.key} className="flex items-start gap-2">
                        <Paperclip className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">
                            {doc.label}
                            {doc.required ? ' (Required)' : ' (Optional)'}
                          </span>
                          {doc.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {doc.description}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No mandatory document upload required for this request type (optional upload available).
                  </p>
                )}
              </div>

              {/* Manual Wallet Refund Policy Note */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                <strong className="text-slate-800 dark:text-slate-200">Processing &amp; Refund Policy:</strong>{' '}
                Your wallet is debited when submitted. Because this service undergoes manual processing, wallet balance remains held while Pending or Processing. A single automatic refund is issued if a request is confirmed failed or rejected.
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Dynamic Submission Form */}
        <div className="lg:col-span-7 space-y-5">
          {selectedService ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-emerald-400">
                      {mode} Modification Form
                    </span>
                    <span className="text-[11px] text-slate-400">&middot;</span>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      {selectedService.manual_label || 'Manual Processing'}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
                    {selectedService.name}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Complete all required details accurately and attach clear supporting documents.
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
                    Total Charge
                  </span>
                  <span className="text-xl font-extrabold font-mono text-blue-700 dark:text-emerald-400 tabular-nums">
                    ₦{finalCharge.toLocaleString('en-NG')}
                  </span>
                </div>
              </div>

              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{formError}</span>
                </div>
              )}

              {submitSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{submitSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmitForm} noValidate className="space-y-5">
                {/* Dynamic Input Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {visibleSchemaFields.map(field => {
                    const helpMsg = field.help_text || field.helper || '';
                    const inlineErr = fieldErrors[field.key];
                    const isFullWidth =
                      field.type === 'textarea' ||
                      field.type === 'bvn_enrollment_type' ||
                      field.key === 'address' ||
                      field.key === 'reason' ||
                      field.key === 'password';

                    if (field.type === 'bvn_enrollment_type') {
                      return (
                        <div key={field.key} className="sm:col-span-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`mod-field-${field.key}`}
                              className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                            >
                              {field.label} {field.required && <span className="text-rose-500">*</span>}
                            </label>
                            <button
                              type="button"
                              onClick={() => loadBvnTypes(true)}
                              disabled={loadingBvnTypes}
                              className="text-[11px] font-semibold text-blue-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                            >
                              <RefreshCw className={`w-3 h-3 ${loadingBvnTypes ? 'animate-spin' : ''}`} />
                              <span>Refresh Bank List</span>
                            </button>
                          </div>

                          <select
                            id={`mod-field-${field.key}`}
                            value={formValues[field.key] || selectedBvnType?.enrollment_type || ''}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            required={field.required}
                            aria-invalid={Boolean(inlineErr)}
                            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                              inlineErr
                                ? 'border-rose-500 focus:ring-rose-500'
                                : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                            }`}
                          >
                            {activeBvnTypes.length === 0 ? (
                              <option value="">
                                {loadingBvnTypes ? 'Loading BVN enrollment types...' : 'Standard BVN Enrollment Bank'}
                              </option>
                            ) : (
                              activeBvnTypes.map(bt => (
                                <option key={bt.id} value={bt.enrollment_type}>
                                  {bt.label} — ₦{Number(bt.selling_price).toLocaleString('en-NG')}
                                </option>
                              ))
                            )}
                          </select>

                          {bvnTypesNote && activeBvnTypes.length === 0 && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                              {bvnTypesNote}
                            </p>
                          )}
                          {inlineErr ? (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{inlineErr}</p>
                          ) : (
                            helpMsg && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{helpMsg}</p>
                            )
                          )}
                        </div>
                      );
                    }

                    if (field.type === 'select') {
                      return (
                        <div key={field.key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                          <label
                            htmlFor={`mod-field-${field.key}`}
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                          >
                            {field.label} {field.required && <span className="text-rose-500">*</span>}
                          </label>
                          <select
                            id={`mod-field-${field.key}`}
                            value={formValues[field.key] || ''}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            required={field.required}
                            aria-invalid={Boolean(inlineErr)}
                            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                              inlineErr
                                ? 'border-rose-500 focus:ring-rose-500'
                                : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                            }`}
                          >
                            <option value="">Select {field.label}</option>
                            {(field.options || []).map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {inlineErr ? (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">{inlineErr}</p>
                          ) : (
                            helpMsg && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{helpMsg}</p>
                            )
                          )}
                        </div>
                      );
                    }

                    if (field.type === 'textarea') {
                      return (
                        <div key={field.key} className="sm:col-span-2">
                          <label
                            htmlFor={`mod-field-${field.key}`}
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                          >
                            {field.label} {field.required && <span className="text-rose-500">*</span>}
                          </label>
                          <textarea
                            id={`mod-field-${field.key}`}
                            rows={3}
                            value={formValues[field.key] || ''}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder || ''}
                            required={field.required}
                            aria-invalid={Boolean(inlineErr)}
                            className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 ${
                              inlineErr
                                ? 'border-rose-500 focus:ring-rose-500'
                                : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                            }`}
                          />
                          {inlineErr ? (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">{inlineErr}</p>
                          ) : (
                            helpMsg && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{helpMsg}</p>
                            )
                          )}
                        </div>
                      );
                    }

                    if (field.type === 'password') {
                      return (
                        <div key={field.key} className="sm:col-span-2">
                          <label
                            htmlFor={`mod-field-${field.key}`}
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                          >
                            {field.label} {field.required && <span className="text-rose-500">*</span>}
                          </label>
                          <div className="relative">
                            <input
                              id={`mod-field-${field.key}`}
                              type={passwordVisible ? 'text' : 'password'}
                              value={formValues[field.key] || ''}
                              onChange={e => handleFieldChange(field.key, e.target.value)}
                              placeholder={field.placeholder || 'Enter portal password'}
                              required={field.required}
                              autoComplete="new-password"
                              aria-invalid={Boolean(inlineErr)}
                              className={`w-full min-h-[44px] pl-3.5 pr-11 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                                inlineErr
                                  ? 'border-rose-500 focus:ring-rose-500'
                                  : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setPasswordVisible(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                              tabIndex={-1}
                            >
                              {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {inlineErr ? (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">{inlineErr}</p>
                          ) : (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                              <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>
                                {helpMsg ||
                                  'Used strictly for encrypted portal submission and never stored in plain text.'}
                              </span>
                            </p>
                          )}
                        </div>
                      );
                    }

                    const isDigitId = ['nin', 'parent_nin', 'bvn'].includes(field.key);
                    return (
                      <div key={field.key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                        <label
                          htmlFor={`mod-field-${field.key}`}
                          className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                        >
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </label>
                        <input
                          id={`mod-field-${field.key}`}
                          type={field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
                          max={field.type === 'date' ? new Date().toISOString().split('T')[0] : undefined}
                          maxLength={field.maxLength || (isDigitId ? 11 : field.type === 'tel' ? 13 : undefined)}
                          inputMode={isDigitId || field.type === 'tel' ? 'numeric' : undefined}
                          value={formValues[field.key] || ''}
                          onChange={e => {
                            const val = isDigitId
                              ? e.target.value.replace(/\D/g, '').slice(0, 11)
                              : e.target.value;
                            handleFieldChange(field.key, val);
                          }}
                          placeholder={field.placeholder || ''}
                          required={field.required}
                          aria-invalid={Boolean(inlineErr)}
                          className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 ${
                            inlineErr
                              ? 'border-rose-500 focus:ring-rose-500'
                              : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'
                          } ${isDigitId || field.type === 'tel' ? 'font-mono tracking-wider' : ''}`}
                        />
                        {inlineErr ? (
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">{inlineErr}</p>
                        ) : (
                          helpMsg && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              {helpMsg}
                            </p>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Supporting Document Upload Section */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Supporting Documents Upload
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Private, role-restricted identity uploads. Accepted formats and size limits are shown on each document card.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {((selectedService.required_documents || []).length > 0
                      ? selectedService.required_documents
                      : [
                          {
                            key: 'supporting_document',
                            label: 'Supporting Evidence / Slip (Optional)',
                            required: false,
                            accepted_formats: ['JPG', 'PNG', 'WEBP', 'PDF'],
                            max_size_mb: 5,
                            description: 'Optional clear photo or PDF copy.',
                          },
                        ]
                    ).map(docSpec => {
                      const uploaded = uploadedDocs[docSpec.key];
                      const isUploading = uploadingDocKey === docSpec.key;
                      const dErr = docErrors[docSpec.key];
                      const formats = docSpec.accepted_formats && docSpec.accepted_formats.length > 0
                        ? docSpec.accepted_formats
                        : ['JPG', 'PNG', 'WEBP', 'PDF'];
                      const maxMb = docSpec.max_size_mb || 5;
                      const acceptAttr = formats
                        .flatMap(f => {
                          const l = f.toLowerCase().trim();
                          return l === 'jpg' ? ['.jpg', '.jpeg'] : [`.${l}`];
                        })
                        .join(',');

                      return (
                        <div
                          key={docSpec.key}
                          className={`p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border space-y-2.5 ${
                            dErr
                              ? 'border-rose-400 dark:border-rose-500/50'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                                {docSpec.label}
                                {docSpec.required && <span className="text-rose-500 ml-1">*</span>}
                              </span>
                              {docSpec.description && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                                  {docSpec.description}
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block mt-1">
                                Formats: {formats.join(', ')} &middot; Max {maxMb}MB
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                uploaded
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : docSpec.required
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {uploaded ? 'Uploaded' : docSpec.required ? 'Required' : 'Optional'}
                            </span>
                          </div>

                          {uploaded ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                                      {uploaded.original_name || uploaded.file_name || docSpec.label}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {formatFileSize(uploaded.file_size ?? uploaded.size_bytes)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const localUrl = localDocPreviewUrls[docSpec.key];
                                      if (localUrl) {
                                        setPreviewDoc({
                                          name: uploaded.original_name || uploaded.file_name || docSpec.label,
                                          mimeType: uploaded.mime_type,
                                          blobUrl: localUrl,
                                          isTemporaryObjectUrl: false,
                                        });
                                      } else {
                                        void handleViewDocument(uploaded);
                                      }
                                    }}
                                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600"
                                    title="Preview uploaded file"
                                  >
                                    Preview
                                  </button>
                                  <label
                                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 cursor-pointer"
                                    title="Replace document"
                                  >
                                    Replace
                                    <input
                                      type="file"
                                      accept={acceptAttr}
                                      className="sr-only"
                                      disabled={isUploading}
                                      onChange={e => {
                                        const f = e.target.files?.[0] || null;
                                        e.target.value = '';
                                        void handleDocumentUpload(docSpec.key, f, formats, maxMb);
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDocument(docSpec.key)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition"
                                    title="Remove document"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-emerald-500 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer transition">
                              {isUploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                  <span>Uploading...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
                                  <span>Choose File</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept={acceptAttr}
                                className="sr-only"
                                disabled={isUploading}
                                onChange={e => {
                                  const f = e.target.files?.[0] || null;
                                  e.target.value = '';
                                  void handleDocumentUpload(docSpec.key, f, formats, maxMb);
                                }}
                              />
                            </label>
                          )}

                          {dErr && (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{dErr}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pre-Submit Summary & Wallet Charge Breakdown */}
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white">Pre-Submission Summary</span>
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      {selectedService.manual_label || 'Manual Processing'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Selected Service</span>
                      <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px] text-right">
                        {selectedService.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Required Fields Completed</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {checklistProgress.filledReqFields} / {checklistProgress.totalReqFields}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Required Documents Attached</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {checklistProgress.uploadedReqDocs} / {checklistProgress.totalReqDocs}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Estimated Turnaround</span>
                      <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px] text-right">
                        {selectedService.estimated_turnaround || '3 – 10 Business Days'}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Available Wallet Balance</span>
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        ₦{walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Customer Service Charge</span>
                      <span className="font-mono font-extrabold text-blue-700 dark:text-emerald-400 tabular-nums">
                        ₦{finalCharge.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-slate-700 dark:text-slate-300">Balance After Submission</span>
                      <span
                        className={`font-mono tabular-nums ${
                          insufficientBalance
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {insufficientBalance
                          ? 'Insufficient Wallet Balance'
                          : `₦${(walletBalance - finalCharge).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Legal Authorization & Consent Checkbox */}
                <label className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
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
                    <strong className="text-slate-900 dark:text-white">Authorization Declaration:</strong>{' '}
                    {mode === 'BVN'
                      ? 'I confirm that all BVN modification details and uploaded documents are genuine and submitted with explicit legal consent from the BVN holder in compliance with CBN, NIBSS, and Nigerian data protection laws (NDPR).'
                      : 'I confirm that all NIN modification details and uploaded documents are genuine and submitted with explicit legal consent from the identity holder in compliance with NIMC regulations and Nigerian data protection laws (NDPR).'}
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting || uploadingDocKey !== null}
                  className="w-full min-h-[48px] py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Request (₦{finalCharge.toLocaleString('en-NG')})</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
        </div>
      )}

      {/* Domain-Isolated Modification Requests Tracker */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
              <span>Your {mode} Modification Requests</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Track live manual processing status, respond to administrator queries, or check provider updates.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap max-w-full">
            <div className="flex items-center flex-wrap gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 max-w-full">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'processing', label: 'Processing' },
                { id: 'query_required', label: 'Query' },
                { id: 'completed', label: 'Completed' },
                { id: 'refunded', label: 'Refunded' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                    statusFilter === f.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadRequests}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              title="Refresh requests"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRequests ? 'animate-spin' : ''}`} />
            </button>
            {onOpenHistoryTab && (
              <button
                type="button"
                onClick={onOpenHistoryTab}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition"
              >
                Full History
              </button>
            )}
          </div>
        </div>

        {loadingRequests && requests.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span>Loading {mode} modification requests...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="py-10 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            You have not submitted any {mode} modification requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const st = getModificationStatusStyle(req.status);
              const isQueryOpen = queryTargetId === req.id;

              return (
                <div
                  key={req.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {req.request_number}
                        </span>
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${st.classes}`}>
                          {st.label}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(req.created_at).toLocaleString('en-NG')}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {req.service_name}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center flex-wrap gap-2">
                        <span>
                          {req.identity_type}: <strong className="font-mono">{req.masked_identifier}</strong>
                        </span>
                        {req.enrollment_type && (
                          <>
                            <span>&middot;</span>
                            <span>Bank / Type: {req.enrollment_type}</span>
                          </>
                        )}
                        <span>&middot;</span>
                        <span>Est: {req.estimated_completion_text}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-center">
                      <div className="text-left sm:text-right">
                        <span className="text-xs font-extrabold font-mono text-slate-900 dark:text-white tabular-nums block">
                          ₦{Number(req.customer_price).toLocaleString('en-NG')}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {req.payment_reference}
                        </span>
                      </div>

                      {['pending', 'processing', 'query_required'].includes(String(req.status).toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => handlePollStatus(req.id)}
                          disabled={pollingId === req.id}
                          className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${pollingId === req.id ? 'animate-spin' : ''}`} />
                          <span>Check Status</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {req.provider_remarks && (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-bold text-slate-900 dark:text-white">Update Note: </span>
                      {req.provider_remarks}
                    </div>
                  )}

                  {req.refund_reference && (
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-xs text-purple-800 dark:text-purple-200 flex items-center justify-between gap-2">
                      <span>
                        Wallet Refund Issued: <strong className="font-mono">{req.refund_reference}</strong>
                      </span>
                    </div>
                  )}

                  {/* Supporting Documents & Query Action Row */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(req.supporting_documents || []).map(doc => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleViewDocument(doc)}
                          disabled={loadingPreviewId === doc.id}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-[11px] font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition"
                        >
                          {loadingPreviewId === doc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <FileText className="w-3 h-3 text-blue-600 dark:text-emerald-400" />
                          )}
                          <span>{doc.original_name || doc.file_name || doc.doc_key}</span>
                        </button>
                      ))}
                    </div>

                    {req.status === 'query_required' && (
                      <button
                        type="button"
                        onClick={() => {
                          setQueryTargetId(isQueryOpen ? null : req.id);
                          setQueryNote('');
                          setQueryDocs({});
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{isQueryOpen ? 'Close Response' : 'Respond to Query'}</span>
                      </button>
                    )}
                  </div>

                  {/* Respond to Admin Query Drawer */}
                  {isQueryOpen && (
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/40 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        Submit Requested Clarification / Additional Document
                      </h4>
                      <textarea
                        rows={3}
                        value={queryNote}
                        onChange={e => setQueryNote(e.target.value)}
                        placeholder="Provide the requested explanation or updated details..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer w-fit">
                          {uploadingQueryDoc ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>Attach Supporting File</span>
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            className="sr-only"
                            disabled={uploadingQueryDoc}
                            onChange={e => {
                              const f = e.target.files?.[0] || null;
                              e.target.value = '';
                              void handleUploadQueryDoc(f);
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => handleSubmitQueryInfo(req.id)}
                          disabled={submittingQuery || uploadingQueryDoc}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition"
                        >
                          {submittingQuery && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>Send Response</span>
                        </button>
                      </div>

                      {Object.values(queryDocs).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(queryDocs).map(([k, d]) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px]"
                            >
                              <FileCheck2 className="w-3 h-3" />
                              <span>{d.original_name || d.file_name || k}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction PIN Modal */}
      <TransactionPinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={pin => {
          setPinModalOpen(false);
          void executeSubmit(pin);
        }}
        title={`Authorize ${mode} Modification`}
        description={`Enter your 4-digit Transaction PIN to submit this manual request and debit ₦${finalCharge.toLocaleString('en-NG')}.`}
        amount={finalCharge}
      />

      {/* Protected Supporting Document Viewer Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate pr-4">
                {previewDoc.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewDoc.blobUrl}
                  download={previewDoc.name}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (previewDoc.isTemporaryObjectUrl !== false) {
                      URL.revokeObjectURL(previewDoc.blobUrl);
                    }
                    setPreviewDoc(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              {previewDoc.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewDoc.blobUrl}
                  title={previewDoc.name}
                  className="w-full h-[65vh] rounded-lg bg-white"
                />
              ) : (
                <img
                  src={previewDoc.blobUrl}
                  alt={previewDoc.name}
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
