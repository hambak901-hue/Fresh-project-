import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Search,
  Filter,
  Eye,
  Check,
  X,
  FileText,
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Lock,
  Layers,
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  Loader2,
  Sliders,
  Send,
  HelpCircle,
  Building
} from 'lucide-react';
import { api } from '../../lib/api';
import { KycSubmission, ServiceSecurityRule } from '../../types';

export function AdminKycManagement() {
  const [activeTab, setActiveTab] = useState<'queue' | 'rules'>('queue');
  const [loading, setLoading] = useState<boolean>(true);
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    info_requested: 0,
  });
  const [rules, setRules] = useState<ServiceSecurityRule[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected Submission for Review Modal
  const [selectedSubmission, setSelectedSubmission] = useState<KycSubmission | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'request_info' | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [infoRequested, setInfoRequested] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [autoVerifying, setAutoVerifying] = useState<boolean>(false);
  const [autoVerifyResult, setAutoVerifyResult] = useState<any | null>(null);

  // Selected Image for Preview
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);

  // Rule editing state
  const [editingRule, setEditingRule] = useState<ServiceSecurityRule | null>(null);
  const [savingRule, setSavingRule] = useState<boolean>(false);

  // Success / Error messages
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminKycSubmissions({
        status: statusFilter === 'all' ? undefined : statusFilter,
        level: levelFilter === 'all' ? undefined : levelFilter,
        search: searchTerm.trim() || undefined,
      });
      if (res.success) {
        setSubmissions(res.submissions);
        setMetrics(res.metrics);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to fetch KYC submissions' });
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    try {
      const res = await api.getAdminServiceSecurityRules();
      if (res.success) {
        setRules(res.rules);
      }
    } catch (err: any) {
      console.error('Failed to load rules:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'queue') {
      loadSubmissions();
    } else {
      loadRules();
    }
  }, [activeTab, statusFilter, levelFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSubmissions();
  };

  // Automated 2SureVerify / NIMC Check
  const handleAutoVerify = async (id: string) => {
    setAutoVerifying(true);
    setAutoVerifyResult(null);
    try {
      const res = await api.autoVerifyKycSubmission(id);
      if (res.success) {
        setAutoVerifyResult(res.result);
        setFeedback({
          type: 'success',
          message: `Automated registry match completed. Score verified: ${res.result.verified ? 'MATCH' : 'MISMATCH'}`
        });
        loadSubmissions();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Automated verification check failed' });
    } finally {
      setAutoVerifying(false);
    }
  };

  // Review submission
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmission || !reviewAction) return;

    if (reviewAction === 'reject' && !rejectionReason.trim()) {
      setFeedback({ type: 'error', message: 'A mandatory rejection reason is required for audit compliance.' });
      return;
    }
    if (reviewAction === 'request_info' && !infoRequested.trim()) {
      setFeedback({ type: 'error', message: 'Please specify the exact additional information requested from the customer.' });
      return;
    }

    setSubmittingReview(true);
    try {
      const res = await api.reviewKycSubmission(selectedSubmission.id, {
        action: reviewAction,
        notes: reviewNotes,
        rejection_reason: reviewAction === 'reject' ? rejectionReason : undefined,
        additional_info_requested: reviewAction === 'request_info' ? infoRequested : undefined,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setSelectedSubmission(null);
        setReviewAction(null);
        setReviewNotes('');
        setRejectionReason('');
        setInfoRequested('');
        loadSubmissions();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Review action failed.' });
    } finally {
      setSubmittingReview(false);
    }
  };

  // Rule update
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    setSavingRule(true);
    try {
      const res = await api.updateAdminServiceSecurityRule(editingRule.service_key, {
        requires_pin: editingRule.requires_pin,
        min_kyc_level: editingRule.min_kyc_level,
        daily_limit: editingRule.daily_limit,
        description: editingRule.description,
      });
      if (res.success) {
        setFeedback({ type: 'success', message: `Security policy for ${editingRule.service_name} updated successfully.` });
        setEditingRule(null);
        loadRules();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update service security rule.' });
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-100 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">KYC Compliance &amp; Transaction PIN Policy</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Review customer identity verification applications, run automated sovereign registry checks, and enforce service authorization rules.
          </p>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'queue'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Submissions Queue
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>PIN &amp; KYC Policies</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between text-xs transition ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:text-white">✕</button>
        </div>
      )}

      {activeTab === 'queue' ? (
        <>
          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Received</span>
              <p className="text-2xl font-bold font-mono text-white mt-1">{metrics.total}</p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">Pending Review</span>
              <p className="text-2xl font-bold font-mono text-amber-400 mt-1">{metrics.pending}</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Approved (Level 2/3)</span>
              <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{metrics.approved}</p>
            </div>
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
              <span className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">Info Requested</span>
              <p className="text-2xl font-bold font-mono text-blue-400 mt-1">{metrics.info_requested}</p>
            </div>
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20">
              <span className="text-[10px] text-red-400 uppercase tracking-wider font-semibold">Rejected</span>
              <p className="text-2xl font-bold font-mono text-red-400 mt-1">{metrics.rejected}</p>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by customer name, email, phone, or reference..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
              >
                Search
              </button>
            </form>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5" />
                <span>Status:</span>
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="info_requested">Info Requested</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={levelFilter}
                onChange={e => setLevelFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none"
              >
                <option value="all">All Tiers</option>
                <option value="1">Level 1</option>
                <option value="2">Level 2</option>
                <option value="3">Level 3</option>
              </select>

              <button
                onClick={loadSubmissions}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Refresh table"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/80 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Customer Name &amp; Contact</th>
                    <th className="py-3.5 px-4">Target Tier</th>
                    <th className="py-3.5 px-4">Verification Method</th>
                    <th className="py-3.5 px-4">ID Details</th>
                    <th className="py-3.5 px-4">Submission Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Review Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-300">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        {loading ? 'Loading KYC submissions...' : 'No verification submissions matching query.'}
                      </td>
                    </tr>
                  ) : (
                    submissions.map(sub => (
                      <tr key={sub.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{sub.full_legal_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{sub.email}</div>
                          <div className="text-[11px] text-slate-500">{sub.phone_number}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            sub.target_level === 1
                              ? 'bg-blue-500/10 text-blue-400'
                              : sub.target_level === 2
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-purple-500/10 text-purple-400'
                          }`}>
                            Level {sub.target_level}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="capitalize font-mono text-[11px] text-slate-300">
                            {sub.verification_method}
                          </span>
                          {sub.automated_verification_result?.verified && (
                            <span className="block text-[10px] text-emerald-400 font-mono">
                              2SureVerify Match (100%)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          <div>{String(sub.id_type || 'NIN_SLIP').toUpperCase().replace(/_/g, ' ')}</div>
                          <div className="text-slate-400">{sub.id_number}</div>
                          {sub.nin && <div className="text-[10px] text-slate-500">NIN: {sub.nin.slice(0, 3)}****{sub.nin.slice(-2)}</div>}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {new Date(sub.submitted_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
                            sub.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : sub.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : sub.status === 'info_requested'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {sub.status}
                          </span>
                          {sub.reviewer_name && (
                            <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[120px]">
                              by {sub.reviewer_name}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedSubmission(sub);
                              setAutoVerifyResult(sub.automated_verification_result || null);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Inspect &amp; Review</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Service Security Rules Editor */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                Service Security &amp; Authorization Matrix
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure mandatory 4-digit PIN checks, minimum KYC level access, and daily transaction caps per service.
              </p>
            </div>
            <button
              onClick={loadRules}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition flex items-center gap-1.5 self-start"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Policies
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Service Key &amp; Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Mandatory PIN</th>
                  <th className="py-3 px-4">Min. Required Tier</th>
                  <th className="py-3 px-4">Daily Volume Cap</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {rules.map(rule => (
                  <tr key={rule.service_key} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{rule.service_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{rule.service_key}</div>
                    </td>
                    <td className="py-3 px-4 capitalize font-mono text-slate-400">{rule.category}</td>
                    <td className="py-3 px-4">
                      {rule.requires_pin ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <Lock className="w-3.5 h-3.5" /> Required
                        </span>
                      ) : (
                        <span className="text-slate-500">Optional</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        rule.min_kyc_level === 0
                          ? 'bg-slate-800 text-slate-400'
                          : rule.min_kyc_level === 1
                          ? 'bg-blue-500/10 text-blue-400'
                          : rule.min_kyc_level === 2
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-purple-500/10 text-purple-400'
                      }`}>
                        Level {rule.min_kyc_level}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-200">
                      ₦{rule.daily_limit.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{rule.description}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setEditingRule({ ...rule })}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                      >
                        Configure
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submission Review & Audit Inspection Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-lg">{selectedSubmission.full_legal_name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                    selectedSubmission.status === 'approved'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : selectedSubmission.status === 'pending'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {selectedSubmission.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Target Tier: Level {selectedSubmission.target_level} &bull; Submitted: {new Date(selectedSubmission.submitted_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedSubmission(null);
                  setReviewAction(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Customer Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-850/80 border border-slate-800 text-xs">
              <div>
                <span className="text-slate-500">Date of Birth:</span>
                <p className="font-semibold text-slate-200">{selectedSubmission.date_of_birth}</p>
              </div>
              <div>
                <span className="text-slate-500">Phone:</span>
                <p className="font-semibold text-slate-200">{selectedSubmission.phone_number}</p>
              </div>
              <div>
                <span className="text-slate-500">Email:</span>
                <p className="font-semibold text-slate-200">{selectedSubmission.email}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500">Residential Address:</span>
                <p className="font-semibold text-slate-200">{selectedSubmission.residential_address}, {selectedSubmission.lga}, {selectedSubmission.state}</p>
              </div>
              <div>
                <span className="text-slate-500">NDPR Consent:</span>
                <p className="font-semibold text-emerald-400">Captured &amp; Logged</p>
              </div>
              <div>
                <span className="text-slate-500">NIN:</span>
                <p className="font-mono font-bold text-slate-200">{selectedSubmission.nin || 'Not provided'}</p>
              </div>
              <div>
                <span className="text-slate-500">BVN:</span>
                <p className="font-mono font-bold text-slate-200">{selectedSubmission.bvn || 'Not provided'}</p>
              </div>
              <div>
                <span className="text-slate-500">ID Serial:</span>
                <p className="font-mono font-bold text-slate-200">{selectedSubmission.id_number} ({selectedSubmission.id_type})</p>
              </div>
            </div>

            {/* Document Assets Attached */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Attached Identity Documents</h4>
              <div className="grid grid-cols-3 gap-3">
                {selectedSubmission.id_document_url ? (
                  <button
                    type="button"
                    onClick={() => setPreviewImage({ title: 'ID Document Scan', url: selectedSubmission.id_document_url! })}
                    className="p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-left transition space-y-1 group"
                  >
                    <FileText className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <span className="block text-xs font-semibold text-white">Official ID Scan</span>
                    <span className="block text-[10px] text-emerald-400">Click to view document</span>
                  </button>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-800/40 border border-slate-800 text-slate-500 text-xs">
                    No ID file attached
                  </div>
                )}

                {selectedSubmission.selfie_url ? (
                  <button
                    type="button"
                    onClick={() => setPreviewImage({ title: 'Selfie Photograph', url: selectedSubmission.selfie_url! })}
                    className="p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-purple-500/50 text-left transition space-y-1 group"
                  >
                    <User className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                    <span className="block text-xs font-semibold text-white">Live Selfie Photo</span>
                    <span className="block text-[10px] text-purple-400">Click to view selfie</span>
                  </button>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-800/40 border border-slate-800 text-slate-500 text-xs">
                    No selfie attached
                  </div>
                )}

                {selectedSubmission.proof_of_address_url ? (
                  <button
                    type="button"
                    onClick={() => setPreviewImage({ title: 'Proof of Address', url: selectedSubmission.proof_of_address_url! })}
                    className="p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-blue-500/50 text-left transition space-y-1 group"
                  >
                    <MapPin className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                    <span className="block text-xs font-semibold text-white">Utility Bill / Proof</span>
                    <span className="block text-[10px] text-blue-400">Click to view proof</span>
                  </button>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-800/40 border border-slate-800 text-slate-500 text-xs">
                    No utility bill attached
                  </div>
                )}
              </div>
            </div>

            {/* Automated Verification Section */}
            <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Automated Sovereign Registry Check (2SureVerify / NIMC)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Runs live cryptographic query against government repository to validate name and date of birth match.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAutoVerify(selectedSubmission.id)}
                  disabled={autoVerifying}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                >
                  {autoVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{autoVerifying ? 'Querying NIMC...' : 'Run Automated Check'}</span>
                </button>
              </div>

              {autoVerifyResult && (
                <div className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${
                  autoVerifyResult.verified
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/20 text-red-300'
                }`}>
                  <div className="font-bold flex items-center justify-between">
                    <span>Registry Response: {autoVerifyResult.verified ? 'VERIFIED MATCH' : 'MISMATCH'}</span>
                    <span>Provider: {autoVerifyResult.provider}</span>
                  </div>
                  <div>Reference: {autoVerifyResult.reference}</div>
                  <div>Name Match Confirmed: {autoVerifyResult.name_matched ? '100% Match' : 'Mismatch'}</div>
                  <div className="text-[10px] text-slate-400">Timestamp: {autoVerifyResult.timestamp}</div>
                </div>
              )}
            </div>

            {/* Review Decision Form */}
            {reviewAction ? (
              <form onSubmit={handleReviewSubmit} className="space-y-4 p-4 rounded-2xl bg-slate-800/80 border border-slate-700">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Action: <span className="text-emerald-400">{reviewAction.replace('_', ' ').toUpperCase()}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setReviewAction(null)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                {reviewAction === 'reject' && (
                  <div>
                    <label className="block text-xs font-semibold text-red-400 mb-1">
                      Mandatory Rejection Reason (Audit Trail) *
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={rejectionReason}
                      onChange={e => setRejectionReason(e.target.value)}
                      placeholder="e.g. Uploaded NIN slip does not match name supplied or is illegible."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-red-500/40 text-white text-xs focus:outline-none"
                    />
                  </div>
                )}

                {reviewAction === 'request_info' && (
                  <div>
                    <label className="block text-xs font-semibold text-blue-400 mb-1">
                      Information Required from Customer *
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={infoRequested}
                      onChange={e => setInfoRequested(e.target.value)}
                      placeholder="e.g. Please upload a clearer high-resolution photo of your voter card."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-blue-500/40 text-white text-xs focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Internal Compliance Review Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    placeholder="e.g. Verified photo matches government database entry."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow"
                  >
                    {submittingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Confirm Decision</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400">Select administrative review action:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction('request_info')}
                    className="px-3 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-semibold transition"
                  >
                    Request Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('reject')}
                    className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold transition"
                  >
                    Reject Submission
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('approve')}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-md shadow-emerald-500/20"
                  >
                    Approve Verification
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Service Rule Editor Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleSaveRule} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Configure Security Policy: {editingRule.service_name}</h3>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850 border border-slate-800">
                <div>
                  <span className="font-semibold text-white block">Enforce 4-Digit Transaction PIN</span>
                  <p className="text-[11px] text-slate-400">Customer must enter hashed PIN before debiting wallet.</p>
                </div>
                <input
                  type="checkbox"
                  checked={editingRule.requires_pin}
                  onChange={e => setEditingRule({ ...editingRule, requires_pin: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-800 border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Minimum Required KYC Tier
                </label>
                <select
                  value={editingRule.min_kyc_level}
                  onChange={e => setEditingRule({ ...editingRule, min_kyc_level: Number(e.target.value) as any })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none"
                >
                  <option value={0}>Level 0 (Unverified Access Allowed)</option>
                  <option value={1}>Level 1 (Basic Profile &bull; Email Verified)</option>
                  <option value={2}>Level 2 (Identity Verified &bull; NIN/BVN)</option>
                  <option value={3}>Level 3 (Enhanced Enterprise &bull; Selfie &amp; Proof)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Daily Transaction Volume Limit (₦)
                </label>
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={editingRule.daily_limit}
                  onChange={e => setEditingRule({ ...editingRule, daily_limit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Policy Description</label>
                <input
                  type="text"
                  value={editingRule.description}
                  onChange={e => setEditingRule({ ...editingRule, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="px-3 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRule}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow"
              >
                {savingRule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Security Policy</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">{previewImage.title}</h3>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center min-h-[300px]">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[500px] w-auto object-contain rounded-xl"
              />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span className="font-mono text-[11px] truncate max-w-xs">{previewImage.url}</span>
              <a
                href={previewImage.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
              >
                <span>Full Window</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
