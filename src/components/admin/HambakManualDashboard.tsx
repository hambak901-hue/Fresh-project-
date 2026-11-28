import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  History,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  ManualFulfilmentDomain,
  ManualFulfilmentOrder,
  ManualFulfilmentQueueKey,
  StaffAssigneeItem,
} from '../../types';

const QUEUE_TABS: Array<{ key: ManualFulfilmentQueueKey; label: string }> = [
  { key: 'all_manual', label: 'All Active & Manual' },
  { key: 'unclaimed', label: 'Unclaimed' },
  { key: 'my_claimed', label: 'Claimed By Me' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'awaiting_clarification', label: 'Clarification' },
  { key: 'awaiting_completion_review', label: 'Senior Review' },
  { key: 'sla_breached', label: 'SLA Breached' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected_refunded', label: 'Rejected / Refunded' },
];

const DOMAIN_OPTIONS: Array<{ key: ManualFulfilmentDomain; label: string }> = [
  { key: 'all', label: 'All Domains' },
  { key: 'nin_modification', label: 'NIN Modification' },
  { key: 'bvn_modification', label: 'BVN Modification' },
  { key: 'additional_service', label: 'Clearance & Additional' },
  { key: 'enrolment', label: 'NIN Enrolment' },
  { key: 'verification', label: 'Identity Verification' },
];

function getDomainLabel(domain: string): string {
  switch (domain) {
    case 'nin_modification':
      return 'NIN Modification';
    case 'bvn_modification':
      return 'BVN Modification';
    case 'additional_service':
      return 'Additional / Clearance';
    case 'enrolment':
      return 'NIN Enrolment';
    case 'verification':
      return 'Verification';
    default:
      return domain;
  }
}

function getStatusBadgeClass(status: string, awaitingReview?: boolean): string {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  }
  if (awaitingReview) {
    return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
  }
  if (s === 'query_required') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
  if (['rejected', 'failed', 'refunded'].includes(s)) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
  }
  if (['processing', 'assigned', 'under_review'].includes(s)) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
  }
  return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30';
}

function formatSlaLabel(order: ManualFulfilmentOrder): { text: string; urgent: boolean } {
  const s = String(order.status || '').toLowerCase();
  if (['completed', 'rejected', 'failed', 'refunded'].includes(s)) {
    return { text: 'Closed', urgent: false };
  }
  if (order.sla_breached) {
    const mins = Math.abs(Number(order.sla_remaining_minutes || 0));
    const hrs = Math.floor(mins / 60);
    return {
      text: hrs > 0 ? `Breached (${hrs}h ${mins % 60}m overdue)` : `Breached (${mins}m overdue)`,
      urgent: true,
    };
  }
  if (order.sla_remaining_minutes == null) {
    return { text: 'SLA Pending', urgent: false };
  }
  const mins = Math.max(0, Number(order.sla_remaining_minutes));
  const hrs = Math.floor(mins / 60);
  return {
    text: hrs > 0 ? `${hrs}h ${mins % 60}m left` : `${mins}m left`,
    urgent: mins <= 120,
  };
}

export function HambakManualDashboard() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<ManualFulfilmentQueueKey>('all_manual');
  const [domainFilter, setDomainFilter] = useState<ManualFulfilmentDomain>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [orders, setOrders] = useState<ManualFulfilmentOrder[]>([]);
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({});
  const [staffMembers, setStaffMembers] = useState<StaffAssigneeItem[]>([]);
  const [canApproveCompletion, setCanApproveCompletion] = useState<boolean>(false);

  const [selectedOrder, setSelectedOrder] = useState<ManualFulfilmentOrder | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Workbench Form States
  const [assignStaffId, setAssignStaffId] = useState<string>('');
  const [checklistDraft, setChecklistDraft] = useState<
    Record<string, { status: 'pending' | 'verified' | 'rejected' | 'needs_reupload'; note?: string }>
  >({});
  const [clarificationText, setClarificationText] = useState<string>('');
  const [reviewRemarks, setReviewRemarks] = useState<string>('');
  const [nextReviewStatus, setNextReviewStatus] = useState<'under_review' | 'assigned' | 'processing'>('processing');

  // Result PDF staging & senior completion
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [trackingIdInput, setTrackingIdInput] = useState<string>('');
  const [operatorRemarks, setOperatorRemarks] = useState<string>('');
  const [adminNotesInput, setAdminNotesInput] = useState<string>('');
  const [completionNote, setCompletionNote] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');

  // Protected document preview modal
  const [previewDoc, setPreviewDoc] = useState<{
    url: string;
    name: string;
    mime: string;
  } | null>(null);
  const [loadingDocKey, setLoadingDocKey] = useState<string | null>(null);

  const syncOrderDrafts = useCallback((order: ManualFulfilmentOrder | null) => {
    if (!order) return;
    setAssignStaffId(order.assigned_to || order.claimed_by || '');
    const initialChecklist: Record<
      string,
      { status: 'pending' | 'verified' | 'rejected' | 'needs_reupload'; note?: string }
    > = {};
    (order.supporting_documents || []).forEach(doc => {
      const key = doc.doc_key || doc.id;
      const existing = order.document_review_checklist?.[key];
      const st = (existing?.status || 'pending') as any;
      initialChecklist[key] = {
        status: ['pending', 'verified', 'rejected', 'needs_reupload'].includes(st) ? st : 'pending',
        note: existing?.note || '',
      };
    });
    setChecklistDraft(initialChecklist);
    setTrackingIdInput(order.provider_tracking_id || '');
    setOperatorRemarks(order.provider_remarks || '');
    setAdminNotesInput(order.admin_notes || '');
    setClarificationText('');
    setReviewRemarks('');
    setCompletionNote('');
    setRejectReason('');
    setResultFile(null);
  }, []);

  const fetchOrders = useCallback(
    async (keepSelected = true) => {
      setLoadingList(true);
      setErrorMsg(null);
      try {
        const res = await api.getManualFulfilmentOrders({
          queue,
          domain: domainFilter,
          search: searchQuery.trim() || undefined,
          assigned_to: assignedFilter || undefined,
          limit: 100,
        });
        const list = res.orders || [];
        setOrders(list);
        setQueueCounts(res.queue_counts || {});
        setDomainCounts(res.domain_counts || {});
        setStaffMembers(res.staff_members || []);
        setCanApproveCompletion(Boolean(res.can_approve_completion));

        if (keepSelected && selectedOrder) {
          const updated = list.find(
            o => o.id === selectedOrder.id && o.domain === selectedOrder.domain
          );
          if (updated) {
            setSelectedOrder(updated);
          } else if (list.length > 0) {
            setSelectedOrder(list[0]);
            syncOrderDrafts(list[0]);
          } else {
            setSelectedOrder(null);
          }
        } else if (list.length > 0 && !selectedOrder) {
          setSelectedOrder(list[0]);
          syncOrderDrafts(list[0]);
        } else if (list.length === 0) {
          setSelectedOrder(null);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Failed to load HAMBAK MANUAL queue.');
      } finally {
        setLoadingList(false);
      }
    },
    [queue, domainFilter, searchQuery, assignedFilter, selectedOrder, syncOrderDrafts]
  );

  useEffect(() => {
    void fetchOrders(false);
  }, [queue, domainFilter, assignedFilter]);

  const handleSelectOrder = async (order: ManualFulfilmentOrder) => {
    setSelectedOrder(order);
    syncOrderDrafts(order);
    setLoadingDetail(true);
    try {
      const res = await api.getManualFulfilmentOrderDetail(order.domain, order.id);
      if (res?.order) {
        setSelectedOrder(res.order);
        syncOrderDrafts(res.order);
        setCanApproveCompletion(Boolean(res.can_approve_completion));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to refresh order details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const applyMutatedOrder = async (updated: ManualFulfilmentOrder, message: string) => {
    setSelectedOrder(updated);
    syncOrderDrafts(updated);
    setSuccessMsg(message);
    await fetchOrders(true);
  };

  const handleClaimToggle = async () => {
    if (!selectedOrder) return;
    const isMine = selectedOrder.claimed_by && user?.id && selectedOrder.claimed_by === user.id;
    setActionLoading('claim');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.claimManualFulfilmentOrder(
        selectedOrder.domain,
        selectedOrder.id,
        isMine ? 'unclaim' : 'claim'
      );
      await applyMutatedOrder(res.order, res.message || (isMine ? 'Claim released.' : 'Order claimed.'));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to update order claim.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssign = async () => {
    if (!selectedOrder || !assignStaffId) return;
    setActionLoading('assign');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.assignManualFulfilmentOrder(
        selectedOrder.domain,
        selectedOrder.id,
        assignStaffId
      );
      await applyMutatedOrder(res.order, res.message || 'Order assigned to operator.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to assign order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveChecklist = async () => {
    if (!selectedOrder) return;
    setActionLoading('checklist');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.updateManualFulfilmentChecklist(
        selectedOrder.domain,
        selectedOrder.id,
        checklistDraft
      );
      await applyMutatedOrder(res.order, res.message || 'Document checklist updated.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to update document checklist.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    if (clarificationText.trim().length < 5) {
      setErrorMsg('Please describe the requested clarification or re-upload (min 5 characters).');
      return;
    }
    setActionLoading('clarify');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.requestManualFulfilmentClarification(
        selectedOrder.domain,
        selectedOrder.id,
        clarificationText.trim()
      );
      await applyMutatedOrder(res.order, res.message || 'Clarification requested from customer.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to request clarification.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReviewClarification = async (decision: 'approve' | 'request_more' | 'reject') => {
    if (!selectedOrder) return;
    if ((decision === 'request_more' || decision === 'reject') && reviewRemarks.trim().length < 4) {
      setErrorMsg('Please enter review remarks (min 4 characters) before sending this decision.');
      return;
    }
    setActionLoading(`review_${decision}`);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.reviewManualFulfilmentClarification(
        selectedOrder.domain,
        selectedOrder.id,
        {
          decision,
          remarks: reviewRemarks.trim() || undefined,
          next_status: decision === 'approve' ? nextReviewStatus : undefined,
        }
      );
      await applyMutatedOrder(res.order, res.message || 'Customer clarification reviewed.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to review customer clarification.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateStage = async (
    nextStatus?: string,
    submitForReview = false
  ) => {
    if (!selectedOrder) return;
    setActionLoading(submitForReview ? 'submit_review' : `stage_${nextStatus}`);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.updateManualFulfilmentStatus(
        selectedOrder.domain,
        selectedOrder.id,
        {
          status: nextStatus,
          submit_for_completion_review: submitForReview,
          provider_remarks: operatorRemarks.trim() || undefined,
          admin_notes: adminNotesInput.trim() || undefined,
        }
      );
      await applyMutatedOrder(
        res.order,
        res.message || (submitForReview ? 'Submitted for senior completion approval.' : 'Order status updated.')
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update order status.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUploadResultPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !resultFile) {
      setErrorMsg('Please select an official PDF document to upload.');
      return;
    }
    setActionLoading('upload_result');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.uploadManualFulfilmentResultDocument(
        selectedOrder.domain,
        selectedOrder.id,
        resultFile,
        {
          tracking_id: trackingIdInput.trim() || undefined,
          provider_remarks: operatorRemarks.trim() || undefined,
        }
      );
      await applyMutatedOrder(
        res.order,
        res.message || 'Official result PDF staged and queued for senior completion review.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to upload result PDF.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveCompletion = async () => {
    if (!selectedOrder) return;
    setActionLoading('approve_completion');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.approveManualFulfilmentCompletion(
        selectedOrder.domain,
        selectedOrder.id,
        {
          verification_note: completionNote.trim() || undefined,
          tracking_id: trackingIdInput.trim() || undefined,
        }
      );
      await applyMutatedOrder(res.order, res.message || 'Order approved and marked completed.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to approve completion.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectAndRefund = async () => {
    if (!selectedOrder) return;
    if (rejectReason.trim().length < 4) {
      setErrorMsg('Rejection requires a clear customer-facing explanation (min 4 characters).');
      return;
    }
    setActionLoading('reject_refund');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.updateManualFulfilmentStatus(
        selectedOrder.domain,
        selectedOrder.id,
        {
          status: 'rejected',
          remarks: rejectReason.trim(),
          admin_notes: adminNotesInput.trim() || rejectReason.trim(),
          trigger_refund: true,
        }
      );
      await applyMutatedOrder(res.order, res.message || 'Order rejected and wallet refund processed.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to reject order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleProtectedDocAction = async (
    docKey: string,
    fileUrl: string,
    fileName: string,
    mimeType: string | undefined,
    action: 'preview' | 'download'
  ) => {
    setLoadingDocKey(`${action}_${docKey}`);
    setErrorMsg(null);
    try {
      if (action === 'download') {
        await api.downloadProtectedFile(fileUrl, fileName);
      } else {
        const blobUrl = await api.fetchProtectedDocumentBlob(fileUrl);
        if (previewDoc?.url) {
          URL.revokeObjectURL(previewDoc.url);
        }
        setPreviewDoc({
          url: blobUrl,
          name: fileName,
          mime: mimeType || 'application/pdf',
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load protected document.');
    } finally {
      setLoadingDocKey(null);
    }
  };

  const closePreview = () => {
    if (previewDoc?.url) {
      URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  const isSelectedTerminal = useMemo(() => {
    const s = String(selectedOrder?.status || '').toLowerCase();
    return ['completed', 'rejected', 'failed', 'refunded'].includes(s);
  }, [selectedOrder]);

  const isClaimedByMe = Boolean(
    selectedOrder?.claimed_by && user?.id && selectedOrder.claimed_by === user.id
  );

  return (
    <div className="space-y-5 text-xs">
      {/* Desk Header & Queue Filters */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Internal Fulfilment Workbench</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              HAMBAK MANUAL Fulfilment Desk
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Claim manual verification, modification, enrolment, and clearance orders, review documents, upload official results, and complete dual-control sign-off.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold whitespace-nowrap ${
                canApproveCompletion
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {canApproveCompletion ? 'Senior Sign-Off Enabled' : 'Operator Review Mode'}
            </span>
            <button
              type="button"
              onClick={() => void fetchOrders(true)}
              disabled={loadingList}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Queue Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {QUEUE_TABS.map(tab => {
            const active = queue === tab.key;
            const count = Number(queueCounts[tab.key] ?? 0);
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setQueue(tab.key)}
                className={`px-3 py-2 rounded-xl font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono tabular-nums text-[10px] ${
                    active
                      ? 'bg-white/20 text-white'
                      : tab.key === 'sla_breached' && count > 0
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Domain Filter + Search + Staff Assignee */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void fetchOrders(false);
              }}
              placeholder="Search reference, customer name, masked ID, or service..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value as ManualFulfilmentDomain)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
          >
            {DOMAIN_OPTIONS.map(d => (
              <option key={d.key} value={d.key}>
                {d.label}
                {d.key !== 'all' ? ` (${domainCounts[d.key] ?? 0})` : ''}
              </option>
            ))}
          </select>
          <select
            value={assignedFilter}
            onChange={e => setAssignedFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
          >
            <option value="">All Staff Operators</option>
            {staffMembers.map(st => (
              <option key={st.id} value={st.id}>
                {st.full_name} ({st.role})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void fetchOrders(false)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold whitespace-nowrap shrink-0 transition"
          >
            Apply Search
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Master-Detail Split Workbench */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Queue List */}
        <div className="xl:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="font-bold text-slate-900 dark:text-white">
              Orders Queue
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {orders.length} matched
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[760px] overflow-y-auto">
            {loadingList && orders.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                <span>Loading HAMBAK MANUAL orders...</span>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-500 dark:text-slate-400">
                No manual fulfilment orders found in this queue.
              </div>
            ) : (
              orders.map(order => {
                const isSelected =
                  selectedOrder?.id === order.id && selectedOrder?.domain === order.domain;
                const sla = formatSlaLabel(order);
                return (
                  <button
                    key={`${order.domain}:${order.id}`}
                    type="button"
                    onClick={() => void handleSelectOrder(order)}
                    className={`w-full text-left p-4 transition space-y-2 ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-slate-900 dark:text-white truncate">
                          {order.reference_number}
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                          {order.service_name}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold whitespace-nowrap shrink-0 ${getStatusBadgeClass(
                          order.status,
                          order.awaiting_admin_review
                        )}`}
                      >
                        {order.awaiting_admin_review && order.status !== 'completed'
                          ? 'Awaiting Senior Sign-Off'
                          : String(order.status).replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{getDomainLabel(order.domain)}</span>
                      <span aria-hidden="true">&middot;</span>
                      <span className="truncate max-w-[140px]">
                        {order.customer_name || order.customer_email || 'Customer'}
                      </span>
                      <span aria-hidden="true">&middot;</span>
                      <span className="font-mono">{order.masked_identifier || '—'}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 font-mono tabular-nums ${
                          sla.urgent
                            ? 'text-rose-600 dark:text-rose-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{sla.text}</span>
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 truncate">
                        {order.claimed_by_name
                          ? `Claimed: ${order.claimed_by_name}`
                          : order.assigned_staff_name
                          ? `Assigned: ${order.assigned_staff_name}`
                          : 'Unclaimed'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Order Workbench */}
        <div className="xl:col-span-7 space-y-4">
          {!selectedOrder ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 dark:text-slate-400">
              Select an order from the queue to inspect documents, claim ownership, request clarification, or complete fulfilment.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Order Summary + Claim / Assign */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                        {selectedOrder.reference_number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${getStatusBadgeClass(
                          selectedOrder.status,
                          selectedOrder.awaiting_admin_review
                        )}`}
                      >
                        {selectedOrder.awaiting_admin_review && selectedOrder.status !== 'completed'
                          ? 'Awaiting Senior Approval'
                          : String(selectedOrder.status).replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                        HAMBAK MANUAL
                      </span>
                      {loadingDetail && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                      {selectedOrder.service_name}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {getDomainLabel(selectedOrder.domain)} &middot; Customer:{' '}
                      {selectedOrder.customer_name || selectedOrder.customer_email}
                      {selectedOrder.customer_phone ? ` · ${selectedOrder.customer_phone}` : ''}
                    </p>
                  </div>

                  {!isSelectedTerminal && (
                    <button
                      type="button"
                      onClick={() => void handleClaimToggle()}
                      disabled={actionLoading === 'claim'}
                      className={`px-3.5 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                        isClaimedByMe
                          ? 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      {actionLoading === 'claim' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      <span>{isClaimedByMe ? 'Release Claim' : 'Claim Order'}</span>
                    </button>
                  )}
                </div>

                {/* Financial & SLA Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      Customer Paid
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                      ₦{Number(selectedOrder.customer_price || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      Internal Cost
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                      ₦{Number(selectedOrder.internal_fulfilment_cost || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      Net Margin
                    </span>
                    <span
                      className={`font-mono font-bold tabular-nums mt-0.5 block ${
                        selectedOrder.net_margin >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      ₦{Number(selectedOrder.net_margin || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                      SLA Window
                    </span>
                    <span
                      className={`font-mono font-bold tabular-nums mt-0.5 block ${
                        selectedOrder.sla_breached
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatSlaLabel(selectedOrder).text}
                    </span>
                  </div>
                </div>

                {/* Reassignment Bar */}
                {!isSelectedTerminal && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
                    <div className="flex-1 flex items-center gap-2">
                      <select
                        value={assignStaffId}
                        onChange={e => setAssignStaffId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">Assign to staff operator...</option>
                        {staffMembers.map(st => (
                          <option key={st.id} value={st.id}>
                            {st.full_name} ({st.role})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAssign()}
                        disabled={!assignStaffId || actionLoading === 'assign'}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
                      >
                        {actionLoading === 'assign' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        <span>Assign</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Submitted Applicant Payload */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    Submitted Fields &amp; Identifier
                  </h4>
                  <span className="font-mono text-[11px] text-slate-500">
                    ID: {selectedOrder.masked_identifier || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Object.entries(selectedOrder.submitted_fields || {}).length === 0 ? (
                    <p className="text-slate-500 col-span-2">No form fields captured.</p>
                  ) : (
                    Object.entries(selectedOrder.submitted_fields || {}).map(([k, v]) => (
                      <div
                        key={k}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      >
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          {k.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-slate-900 dark:text-white break-words mt-0.5 block">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Supporting Documents & Checklist Verification */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-indigo-500" />
                    <span>Supporting Documents &amp; Verification Checklist</span>
                  </h4>
                  {(selectedOrder.supporting_documents || []).length > 0 && !isSelectedTerminal && (
                    <button
                      type="button"
                      onClick={() => void handleSaveChecklist()}
                      disabled={actionLoading === 'checklist'}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      {actionLoading === 'checklist' && (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      )}
                      <span>Save Checklist</span>
                    </button>
                  )}
                </div>

                {(selectedOrder.supporting_documents || []).length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">
                    No supporting documents attached to this order.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {(selectedOrder.supporting_documents || []).map(doc => {
                      const docKey = doc.doc_key || doc.id;
                      const entry = checklistDraft[docKey] || { status: 'pending', note: '' };
                      const fileName = doc.original_name || doc.file_name || `${docKey}.pdf`;
                      return (
                        <div
                          key={doc.id || docKey}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white truncate">
                                {doc.doc_label || docKey}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 truncate">
                                {fileName}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleProtectedDocAction(
                                    docKey,
                                    doc.file_url,
                                    fileName,
                                    doc.mime_type,
                                    'preview'
                                  )
                                }
                                disabled={loadingDocKey === `preview_${docKey}`}
                                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center gap-1"
                              >
                                {loadingDocKey === `preview_${docKey}` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                                <span>Preview</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleProtectedDocAction(
                                    docKey,
                                    doc.file_url,
                                    fileName,
                                    doc.mime_type,
                                    'download'
                                  )
                                }
                                disabled={loadingDocKey === `download_${docKey}`}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold inline-flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download</span>
                              </button>
                            </div>
                          </div>

                          {!isSelectedTerminal && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                              <select
                                value={entry.status}
                                onChange={e =>
                                  setChecklistDraft(prev => ({
                                    ...prev,
                                    [docKey]: {
                                      ...entry,
                                      status: e.target.value as any,
                                    },
                                  }))
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                              >
                                <option value="pending">Pending Review</option>
                                <option value="verified">Verified</option>
                                <option value="needs_reupload">Needs Re-upload</option>
                                <option value="rejected">Rejected</option>
                              </select>
                              <input
                                type="text"
                                value={entry.note || ''}
                                onChange={e =>
                                  setChecklistDraft(prev => ({
                                    ...prev,
                                    [docKey]: { ...entry, note: e.target.value },
                                  }))
                                }
                                placeholder="Reviewer note (optional)..."
                                className="sm:col-span-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Customer Clarification & Query Review */}
              {!isSelectedTerminal && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-2.5">
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <MessageSquareWarning className="w-4 h-4 text-amber-500" />
                      <span>Clarification &amp; Additional Information Workflow</span>
                    </h4>
                  </div>

                  {selectedOrder.requested_corrections && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 space-y-1">
                      <div className="font-bold">Current Customer Query:</div>
                      <div>{selectedOrder.requested_corrections}</div>
                      {selectedOrder.query_review_status && (
                        <div className="text-[10px] font-mono uppercase">
                          Review Status: {selectedOrder.query_review_status}
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedOrder.additional_info_history || []).length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Customer Clarification Responses
                      </div>
                      {(selectedOrder.additional_info_history || []).map((entry, idx) => (
                        <div
                          key={entry.id || idx}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>{new Date(entry.submitted_at).toLocaleString('en-NG')}</span>
                            <span className="uppercase">{entry.review_status || entry.review_state || 'submitted'}</span>
                          </div>
                          {entry.note && <p className="text-slate-800 dark:text-slate-200">{entry.note}</p>}
                        </div>
                      ))}

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={nextReviewStatus}
                            onChange={e => setNextReviewStatus(e.target.value as any)}
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                          >
                            <option value="processing">Resume as Processing</option>
                            <option value="under_review">Resume as Under Review</option>
                            <option value="assigned">Resume as Assigned</option>
                          </select>
                          <input
                            type="text"
                            value={reviewRemarks}
                            onChange={e => setReviewRemarks(e.target.value)}
                            placeholder="Clarification review remarks..."
                            className="sm:col-span-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleReviewClarification('approve')}
                            disabled={Boolean(actionLoading)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                          >
                            Accept &amp; Resume
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReviewClarification('request_more')}
                            disabled={Boolean(actionLoading)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                          >
                            Request More Info
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReviewClarification('reject')}
                            disabled={Boolean(actionLoading)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                          >
                            Reject &amp; Refund
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleRequestClarification} className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Send Clarification / Re-upload Request to Customer
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={clarificationText}
                        onChange={e => setClarificationText(e.target.value)}
                        placeholder="Describe missing field or unclear document (min 5 chars)..."
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={actionLoading === 'clarify'}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        {actionLoading === 'clarify' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Request Clarification</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Result PDF Upload, Stage Transition & Dual-Control Completion */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Official Result Staging &amp; Dual-Control Completion</span>
                  </h4>
                  {selectedOrder.completion_approved_by_name && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      Approved by {selectedOrder.completion_approved_by_name}
                    </span>
                  )}
                </div>

                {selectedOrder.has_result_document && selectedOrder.result_document?.file_url && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-emerald-800 dark:text-emerald-300">
                        Staged Official Result PDF
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                        {selectedOrder.result_document.original_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void handleProtectedDocAction(
                            'result',
                            selectedOrder.result_document!.file_url,
                            selectedOrder.result_document!.original_name,
                            selectedOrder.result_document!.mime_type,
                            'preview'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-semibold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleProtectedDocAction(
                            'result',
                            selectedOrder.result_document!.file_url,
                            selectedOrder.result_document!.original_name,
                            selectedOrder.result_document!.mime_type,
                            'download'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                )}

                {!isSelectedTerminal && (
                  <>
                    <form onSubmit={handleUploadResultPdf} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Official Result PDF
                          </label>
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={e => setResultFile(e.target.files?.[0] || null)}
                            className="w-full text-[11px] text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Official Tracking / Slip ID (Optional)
                          </label>
                          <input
                            type="text"
                            value={trackingIdInput}
                            onChange={e => setTrackingIdInput(e.target.value)}
                            placeholder="NIMC / NIBSS tracking ID"
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Customer-Visible Remarks
                          </label>
                          <input
                            type="text"
                            value={operatorRemarks}
                            onChange={e => setOperatorRemarks(e.target.value)}
                            placeholder="Update note visible to customer..."
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Internal Desk Notes
                          </label>
                          <input
                            type="text"
                            value={adminNotesInput}
                            onChange={e => setAdminNotesInput(e.target.value)}
                            placeholder="Private operator notes..."
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={!resultFile || actionLoading === 'upload_result'}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          {actionLoading === 'upload_result' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>Upload Official PDF &amp; Queue Review</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUpdateStage('processing', false)}
                          disabled={Boolean(actionLoading)}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold whitespace-nowrap shrink-0"
                        >
                          Mark Processing
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUpdateStage('processing', true)}
                          disabled={Boolean(actionLoading)}
                          className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold whitespace-nowrap shrink-0"
                        >
                          Submit for Senior Review
                        </button>
                      </div>
                    </form>

                    {/* Senior Completion & Rejection Controls */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      {!canApproveCompletion ? (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                          Final completion sign-off requires a Manager, Administrator, or Super Administrator. Upload the official result PDF or submit for review above.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                              <div className="font-bold text-emerald-700 dark:text-emerald-300">
                                Senior Sign-Off: Approve &amp; Complete
                              </div>
                              <input
                                type="text"
                                value={completionNote}
                                onChange={e => setCompletionNote(e.target.value)}
                                placeholder="Verification note (required if no result PDF attached)..."
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => void handleApproveCompletion()}
                                disabled={actionLoading === 'approve_completion'}
                                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold inline-flex items-center justify-center gap-1.5"
                              >
                                {actionLoading === 'approve_completion' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>Approve Completion &amp; Deliver</span>
                              </button>
                            </div>

                            <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                              <div className="font-bold text-rose-700 dark:text-rose-300">
                                Reject Order {selectedOrder.is_refundable ? '& Auto-Refund Wallet' : '(Non-Refundable SKU)'}
                              </div>
                              <input
                                type="text"
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Clear rejection reason for customer (min 4 chars)..."
                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => void handleRejectAndRefund()}
                                disabled={actionLoading === 'reject_refund'}
                                className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold inline-flex items-center justify-center gap-1.5"
                              >
                                {actionLoading === 'reject_refund' ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {selectedOrder.is_refundable ? 'Reject & Refund Customer' : 'Reject Order'}
                                </span>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Status Audit Timeline */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <History className="w-4 h-4 text-slate-500" />
                  <span>Fulfilment Audit Timeline</span>
                </h4>
                {(selectedOrder.status_history || []).length === 0 ? (
                  <p className="text-slate-500">No status transitions recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(selectedOrder.status_history || []).map((h, i) => (
                      <div
                        key={h.id || i}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {h.previous_status ? `${h.previous_status} → ` : ''}
                            {h.new_status}
                            <span className="ml-2 text-[10px] font-mono text-slate-500 uppercase">
                              ({h.actor_type})
                            </span>
                          </div>
                          {h.remarks && (
                            <p className="text-slate-600 dark:text-slate-300">{h.remarks}</p>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {new Date(h.created_at).toLocaleString('en-NG')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Protected Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-white truncate">
                  {previewDoc.name}
                </span>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 max-h-[80vh] overflow-auto flex items-center justify-center">
              {previewDoc.mime.includes('pdf') ? (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                />
              ) : (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.name}
                  className="max-w-full max-h-[70vh] rounded-xl object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
