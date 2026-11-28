import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  AdditionalInfoHistoryEntry,
  DocumentChecklistEntry,
  ModificationDocumentAttachment,
} from '../../types';
import { getChecklistStatusBadge } from './AdditionalServicesSection';

interface AdditionalInfoSubmissionSectionProps {
  onBackToHub?: () => void;
  onSubmitted?: () => void;
  onOpenHistoryTab?: () => void;
}

type ClarificationDomain = 'modification' | 'enrolment' | 'additional';

interface UnifiedClarificationItem {
  id: string;
  domain: ClarificationDomain;
  domainLabel: string;
  referenceNumber: string;
  serviceKey: string;
  serviceName: string;
  identifier: string;
  status: string;
  queryReviewStatus?: string | null;
  requestedCorrections?: string | null;
  providerRemarks?: string | null;
  supportingDocuments: ModificationDocumentAttachment[];
  documentChecklist: Record<string, DocumentChecklistEntry>;
  additionalInfoHistory: AdditionalInfoHistoryEntry[];
  createdAt: string;
  needsAction: boolean;
  awaitingReview: boolean;
}

function getDomainBadgeClass(domain: ClarificationDomain): string {
  if (domain === 'enrolment') {
    return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
  }
  if (domain === 'additional') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  }
  return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
}

export const AdditionalInfoSubmissionSection: React.FC<AdditionalInfoSubmissionSectionProps> = ({
  onBackToHub,
  onSubmitted,
  onOpenHistoryTab,
}) => {
  const [items, setItems] = useState<UnifiedClarificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<'needs_action' | 'awaiting_review' | 'all'>('needs_action');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('');

  // Form state for the currently selected query item
  const [note, setNote] = useState<string>('');
  const [attachedDocs, setAttachedDocs] = useState<Record<string, ModificationDocumentAttachment>>({});
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Protected preview modal
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    mimeType?: string;
    blobUrl: string;
  } | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [modRes, enrRes, addRes] = await Promise.all([
        api.getModificationHistory({ identity_type: 'ALL', limit: 100 }).catch(() => null),
        api.getEnrolmentHistory({ limit: 100 }).catch(() => null),
        api.getAdditionalServiceHistory({ limit: 100 }).catch(() => null),
      ]);

      const collected: UnifiedClarificationItem[] = [];

      for (const m of modRes?.requests || []) {
        const st = String(m.status || '').toLowerCase();
        const rev = String(m.query_review_status || '').toLowerCase();
        const hasFlaggedChecklist = Object.values(m.document_review_checklist || {}).some(
          c => c?.status === 'needs_reupload' || c?.status === 'rejected'
        );
        const hasHistory = Array.isArray(m.additional_info_history) && m.additional_info_history.length > 0;
        const isRelevant = st === 'query_required' || Boolean(m.requested_corrections) || hasFlaggedChecklist || hasHistory;
        if (!isRelevant) continue;

        const awaitingReview = st === 'query_required' && rev === 'submitted_for_admin_review';
        const needsAction = st === 'query_required' && !awaitingReview;
        collected.push({
          id: `mod_${m.id}`,
          domain: 'modification',
          domainLabel: m.identity_type === 'BVN' ? 'BVN Modification' : 'NIN Modification',
          referenceNumber: m.request_number,
          serviceKey: m.service_key,
          serviceName: m.service_name,
          identifier: m.masked_identifier || '—',
          status: m.status,
          queryReviewStatus: m.query_review_status,
          requestedCorrections: m.requested_corrections,
          providerRemarks: m.provider_remarks,
          supportingDocuments: m.supporting_documents || [],
          documentChecklist: m.document_review_checklist || {},
          additionalInfoHistory: m.additional_info_history || [],
          createdAt: m.updated_at || m.created_at,
          needsAction,
          awaitingReview,
        });
      }

      for (const o of enrRes?.orders || []) {
        const st = String(o.status || '').toLowerCase();
        const rev = String(o.query_review_status || '').toLowerCase();
        const hasFlaggedChecklist = Object.values(o.document_review_checklist || {}).some(
          c => c?.status === 'needs_reupload' || c?.status === 'rejected'
        );
        const hasHistory = Array.isArray(o.additional_info_history) && o.additional_info_history.length > 0;
        const isRelevant = st === 'query_required' || Boolean(o.requested_corrections) || hasFlaggedChecklist || hasHistory;
        if (!isRelevant) continue;

        const awaitingReview = st === 'query_required' && rev === 'submitted_for_admin_review';
        const needsAction = st === 'query_required' && !awaitingReview;
        collected.push({
          id: `enr_${o.id}`,
          domain: 'enrolment',
          domainLabel: 'NIN Enrolment',
          referenceNumber: o.order_number,
          serviceKey: o.service_key,
          serviceName: o.service_name,
          identifier: o.applicant_name || o.applicant_phone_masked || '—',
          status: o.status,
          queryReviewStatus: o.query_review_status,
          requestedCorrections: o.requested_corrections,
          providerRemarks: o.provider_remarks,
          supportingDocuments: o.supporting_documents || [],
          documentChecklist: o.document_review_checklist || {},
          additionalInfoHistory: o.additional_info_history || [],
          createdAt: o.updated_at || o.created_at,
          needsAction,
          awaitingReview,
        });
      }

      for (const r of addRes?.requests || []) {
        const st = String(r.status || '').toLowerCase();
        const rev = String(r.query_review_status || '').toLowerCase();
        const hasFlaggedChecklist = Object.values(r.document_review_checklist || {}).some(
          c => c?.status === 'needs_reupload' || c?.status === 'rejected'
        );
        const hasHistory = Array.isArray(r.additional_info_history) && r.additional_info_history.length > 0;
        const isRelevant = st === 'query_required' || Boolean(r.requested_corrections) || hasFlaggedChecklist || hasHistory;
        if (!isRelevant) continue;

        const awaitingReview = st === 'query_required' && rev === 'submitted_for_admin_review';
        const needsAction = st === 'query_required' && !awaitingReview;
        collected.push({
          id: `add_${r.id}`,
          domain: 'additional',
          domainLabel: 'Clearance & Additional',
          referenceNumber: r.request_number,
          serviceKey: r.service_key,
          serviceName: r.service_name,
          identifier: r.masked_identifier || '—',
          status: r.status,
          queryReviewStatus: r.query_review_status,
          requestedCorrections: r.requested_corrections,
          providerRemarks: r.provider_remarks,
          supportingDocuments: r.supporting_documents || [],
          documentChecklist: r.document_review_checklist || {},
          additionalInfoHistory: r.additional_info_history || [],
          createdAt: r.updated_at || r.created_at,
          needsAction,
          awaitingReview,
        });
      }

      collected.sort((a, b) => {
        if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
        if (a.awaitingReview !== b.awaitingReview) return a.awaitingReview ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setItems(collected);
      setSelectedId(prev => {
        if (prev && collected.some(c => c.id === prev)) return prev;
        return collected[0]?.id || '';
      });
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load clarification requests right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    return () => {
      if (previewDoc?.blobUrl) {
        try {
          URL.revokeObjectURL(previewDoc.blobUrl);
        } catch {
        }
      }
    };
  }, [previewDoc]);

  const counts = useMemo(() => {
    return {
      needsAction: items.filter(i => i.needsAction).length,
      awaitingReview: items.filter(i => i.awaitingReview).length,
      total: items.length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return items.filter(item => {
      if (filterMode === 'needs_action' && !item.needsAction) return false;
      if (filterMode === 'awaiting_review' && !item.awaitingReview) return false;
      if (!q) return true;
      return (
        item.referenceNumber.toLowerCase().includes(q) ||
        item.serviceName.toLowerCase().includes(q) ||
        item.identifier.toLowerCase().includes(q) ||
        item.domainLabel.toLowerCase().includes(q)
      );
    });
  }, [items, filterMode, searchTerm]);

  useEffect(() => {
    if (filteredItems.length === 0) return;
    if (!filteredItems.some(i => i.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  const selectedItem = useMemo(
    () => items.find(i => i.id === selectedId) || null,
    [items, selectedId]
  );

  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setNote('');
    setAttachedDocs({});
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const rawRecordId = (item: UnifiedClarificationItem): string => {
    return item.id.replace(/^(mod|enr|add)_/, '');
  };

  const handleUploadFile = async (file?: File | null) => {
    if (!file || !selectedItem) return;
    setUploadingDoc(true);
    setSubmitError(null);
    try {
      let uploaded: ModificationDocumentAttachment | undefined;
      if (selectedItem.domain === 'modification') {
        const res = await api.uploadModificationDocument(file, 'query_response', selectedItem.serviceKey);
        uploaded = res.document;
      } else if (selectedItem.domain === 'enrolment') {
        const res = await api.uploadEnrolmentDocument(file, 'query_response', selectedItem.serviceKey);
        uploaded = res.document;
      } else {
        const res = await api.uploadAdditionalServiceDocument(file, 'query_response', selectedItem.serviceKey);
        uploaded = res.document;
      }
      if (uploaded?.id) {
        setAttachedDocs(prev => ({ ...prev, [uploaded!.id]: uploaded! }));
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to upload supporting document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmitResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setSubmitError(null);
    setSubmitSuccess(null);

    const docIds: Record<string, string> = {};
    Object.values(attachedDocs).forEach((d, idx) => {
      docIds[`query_doc_${idx + 1}`] = d.id;
    });

    if (!note.trim() && Object.keys(docIds).length === 0) {
      setSubmitError('Please enter your clarification response or upload at least one updated document.');
      return;
    }

    setSubmitting(true);
    const id = rawRecordId(selectedItem);
    try {
      let message = 'Additional information submitted for administrator review.';
      if (selectedItem.domain === 'modification') {
        const res = await api.submitModificationAdditionalInfo(id, {
          note: note.trim(),
          document_ids: docIds,
        });
        if (res?.message) message = res.message;
      } else if (selectedItem.domain === 'enrolment') {
        const res = await api.submitEnrolmentAdditionalInfo(id, {
          note: note.trim(),
          document_ids: docIds,
        });
        if (res?.message) message = res.message;
      } else {
        const res = await api.submitAdditionalServiceInfo(id, {
          note: note.trim(),
          document_ids: docIds,
        });
        if (res?.message) message = res.message;
      }

      setNote('');
      setAttachedDocs({});
      setSubmitSuccess(message);
      await loadQueue();
      onSubmitted?.();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit clarification response.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviewExistingDoc = async (doc: ModificationDocumentAttachment) => {
    if (!doc.file_url) return;
    setLoadingPreviewId(doc.id);
    try {
      const blobUrl = await api.fetchProtectedDocumentBlob(doc.file_url);
      if (previewDoc?.blobUrl) {
        try {
          URL.revokeObjectURL(previewDoc.blobUrl);
        } catch {
        }
      }
      setPreviewDoc({
        name: doc.original_name || doc.file_name || doc.doc_key,
        mimeType: doc.mime_type,
        blobUrl,
      });
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to load document preview.');
    } finally {
      setLoadingPreviewId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            {onBackToHub && (
              <button
                type="button"
                onClick={onBackToHub}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-emerald-400 hover:underline mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Identity Services Hub</span>
              </button>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Additional-Information &amp; Clarification Submission
              </h2>
              {counts.needsAction > 0 && (
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                  {counts.needsAction} Action Required
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-3xl">
              Respond to admin queries, review flagged supporting documents, and submit corrected files or clarifications across your NIN/BVN Modifications, Enrolments, and Clearance orders — with zero duplicate charge.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenHistoryTab && (
              <button
                type="button"
                onClick={onOpenHistoryTab}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Order History
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadQueue()}
              disabled={loading}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>

        {/* Summary & Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'needs_action', label: `Needs Your Response (${counts.needsAction})` },
              { id: 'awaiting_review', label: `Awaiting Admin Review (${counts.awaitingReview})` },
              { id: 'all', label: `All Queries & History (${counts.total})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  filterMode === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Request #, Service, or ID..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-14 text-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-emerald-400 mx-auto" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Scanning Modification, Enrolment, and Clearance orders for pending queries...
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {filterMode === 'needs_action'
                ? 'No Orders Currently Require Additional Information'
                : 'No Matching Clarification Records'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {filterMode === 'needs_action'
                ? 'Whenever an administrator or verification desk requests a clearer document or correction on your NIN/BVN Modification, Enrolment, or Clearance order, it appears right here for direct reply.'
                : 'Try switching the filter tab above or clearing your search query.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {filterMode !== 'all' && counts.total > 0 && (
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
              >
                View Past Clarifications ({counts.total})
              </button>
            )}
            {onBackToHub && (
              <button
                type="button"
                onClick={onBackToHub}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Browse Services
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Queue List */}
          <div className="lg:col-span-5 space-y-3">
            {filteredItems.map(item => {
              const active = selectedItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectItem(item.id)}
                  className={`w-full p-4 rounded-2xl border text-left transition space-y-2 ${
                    active
                      ? 'bg-blue-50/70 dark:bg-emerald-500/10 border-blue-500 dark:border-emerald-500 ring-1 ring-blue-500/20'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {item.referenceNumber}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${getDomainBadgeClass(item.domain)}`}>
                      {item.domainLabel}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {item.serviceName}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono truncate">{item.identifier}</span>
                    {item.needsAction ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold shrink-0">
                        Response Needed
                      </span>
                    ) : item.awaitingReview ? (
                      <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] font-bold shrink-0">
                        Awaiting Review
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold uppercase shrink-0">
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {item.requestedCorrections && (
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 line-clamp-2 pt-1 border-t border-slate-200/70 dark:border-slate-800/70">
                      {item.requestedCorrections}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Active Case Detail & Clarification Submission Form */}
          {selectedItem && (
            <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-emerald-400">
                      {selectedItem.referenceNumber}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${getDomainBadgeClass(selectedItem.domain)}`}>
                      {selectedItem.domainLabel}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {selectedItem.serviceName}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Identifier: <span className="font-mono">{selectedItem.identifier}</span> &bull; Updated{' '}
                    {new Date(selectedItem.createdAt).toLocaleString('en-NG')}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold shrink-0 ${
                    selectedItem.needsAction
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-300'
                      : selectedItem.awaitingReview
                      ? 'bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {selectedItem.needsAction
                    ? 'Action Required'
                    : selectedItem.awaitingReview
                    ? 'Submitted for Admin Review'
                    : selectedItem.status.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>

              {(selectedItem.requestedCorrections || selectedItem.providerRemarks) && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Admin / Desk Query Instructions</span>
                  </div>
                  <p className="leading-relaxed">
                    {selectedItem.requestedCorrections || selectedItem.providerRemarks}
                  </p>
                </div>
              )}

              {/* Existing Supporting Documents & Review Checklist */}
              {selectedItem.supportingDocuments.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-blue-600 dark:text-emerald-400" />
                    <span>Uploaded Documents &amp; Verification Status</span>
                  </div>
                  <div className="space-y-2">
                    {selectedItem.supportingDocuments.map(doc => {
                      const chk =
                        selectedItem.documentChecklist[doc.doc_key] ||
                        selectedItem.documentChecklist[doc.id];
                      const badge = getChecklistStatusBadge(chk?.status);
                      return (
                        <div
                          key={doc.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900 dark:text-white truncate">
                                {doc.original_name || doc.file_name || doc.doc_key}
                              </span>
                              <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badge.className}`}>
                                {badge.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Slot: {doc.doc_key.replace(/_/g, ' ')}
                              {chk?.note ? ` · Reviewer Note: ${chk.note}` : ''}
                            </div>
                          </div>
                          {doc.file_url && (
                            <button
                              type="button"
                              onClick={() => void handlePreviewExistingDoc(doc)}
                              disabled={loadingPreviewId === doc.id}
                              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 inline-flex items-center gap-1 shrink-0 self-start sm:self-center"
                            >
                              {loadingPreviewId === doc.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                              <span>Preview</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Previous Clarification History */}
              {selectedItem.additionalInfoHistory.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Clarification Submission Log</span>
                  </div>
                  <div className="space-y-2">
                    {selectedItem.additionalInfoHistory.map((entry, idx) => (
                      <div
                        key={`${entry.submitted_at}_${idx}`}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                          <span>
                            {entry.submitted_at
                              ? new Date(entry.submitted_at).toLocaleString('en-NG')
                              : 'Submitted'}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold">
                            {(entry.review_state || entry.review_status || 'submitted_for_admin_review').replace(/_/g, ' ')}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{entry.note}</p>
                        )}
                        {Array.isArray(entry.documents) && entry.documents.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {entry.documents.map(d => (
                              <span
                                key={d.id}
                                className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300"
                              >
                                {d.original_name || d.id}
                              </span>
                            ))}
                          </div>
                        )}
                        {entry.admin_feedback && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-300 pt-1 border-t border-slate-200 dark:border-slate-800">
                            Admin Feedback: {entry.admin_feedback}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Submission Form */}
              {selectedItem.needsAction ? (
                <form
                  onSubmit={handleSubmitResponse}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-amber-300 dark:border-amber-500/40 space-y-4"
                >
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Submit Corrected Details or Updated Document</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      No additional fee is charged. Your response goes straight to our review team.
                    </p>
                  </div>

                  {submitError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {submitSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{submitSuccess}</span>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="add-info-note"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Clarification Note / Corrected Information
                    </label>
                    <textarea
                      id="add-info-note"
                      rows={4}
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Provide the requested clarification details, corrected spellings/dates, or explanation for the review team..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition">
                      {uploadingDoc ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingDoc ? 'Uploading Document...' : 'Attach Corrected Document (JPG/PNG/WEBP/PDF)'}</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        className="hidden"
                        disabled={uploadingDoc}
                        onChange={e => {
                          void handleUploadFile(e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={submitting || uploadingDoc}
                      className="min-h-[40px] px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm"
                    >
                      {submitting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>{submitting ? 'Submitting Response...' : 'Submit Clarification'}</span>
                    </button>
                  </div>

                  {Object.values(attachedDocs).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.values(attachedDocs).map(doc => (
                        <span
                          key={doc.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/30 text-[11px] font-medium text-slate-800 dark:text-slate-200"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{doc.original_name || doc.file_name || doc.doc_key}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachedDocs(prev => {
                                const next = { ...prev };
                                delete next[doc.id];
                                return next;
                              })
                            }
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </form>
              ) : selectedItem.awaitingReview ? (
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block">Clarification Received — Awaiting Admin Review</strong>
                    <p className="mt-0.5 leading-relaxed opacity-90">
                      Your updated response is currently in the review queue. Duplicate submissions are paused until an administrator reviews this update.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    This query has been processed and the order is currently{' '}
                    <strong className="uppercase">{selectedItem.status.replace(/_/g, ' ')}</strong>.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-bold text-slate-900 dark:text-white truncate pr-4">
                {previewDoc.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  try {
                    URL.revokeObjectURL(previewDoc.blobUrl);
                  } catch {
                  }
                  setPreviewDoc(null);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
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
