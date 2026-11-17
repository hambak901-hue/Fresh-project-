import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Mail,
  Phone,
  ExternalLink,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ShieldCheck,
  Paperclip,
  RefreshCw,
  Search,
  Inbox,
  Plus,
  FileText,
  Download,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';

interface SupportPageProps {
  user: User;
}

interface SupportTicketItem {
  id: string;
  ticket_number?: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  reply_count?: number;
  last_reply_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface SupportReplyItem {
  id: string;
  ticket_id: string;
  user_id: string;
  author_name?: string;
  author_role?: string;
  is_staff?: boolean | number;
  message: string;
  attachment_url?: string | null;
  attachments?: Array<{ file_url?: string; url?: string; file_name?: string }>;
  created_at: string;
}

const formatLabel = (value?: string | null, fallback = 'general') => {
  const safe = typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  return safe.replace(/_/g, ' ');
};

export function SupportPage({ user }: SupportPageProps) {
  const [activeTab, setActiveTab] = useState<'tickets' | 'new'>('tickets');

  // Ticket list & thread state
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketItem | null>(null);
  const [replies, setReplies] = useState<SupportReplyItem[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  // Reply composer
  const [replyText, setReplyText] = useState('');
  const [replyAttachmentUrl, setReplyAttachmentUrl] = useState<string>('');
  const [replyAttachmentName, setReplyAttachmentName] = useState<string>('');
  const [uploadingReplyFile, setUploadingReplyFile] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // New ticket form
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [message, setMessage] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState<string>('');
  const [newAttachmentName, setNewAttachmentName] = useState<string>('');
  const [uploadingNewFile, setUploadingNewFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Feedback & authenticated attachment preview modal
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{
    objectUrl: string;
    contentType: string;
    sourceUrl: string;
  } | null>(null);
  const [loadingAttachment, setLoadingAttachment] = useState(false);

  const loadTickets = async (preserveSelectedId?: string) => {
    setLoadingTickets(true);
    try {
      const res = await api.getSupportTickets(statusFilter !== 'all' ? statusFilter : undefined);
      const list: SupportTicketItem[] = Array.isArray(res?.tickets) ? res.tickets : [];
      setTickets(list);
      const targetId = preserveSelectedId || selectedTicket?.id;
      if (targetId) {
        const match = list.find(t => String(t.id) === String(targetId));
        if (match) {
          setSelectedTicket(match);
        }
      } else if (list.length > 0 && !selectedTicket) {
        await handleOpenTicket(list[0]);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load support tickets.' });
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, [statusFilter]);

  useEffect(() => {
    return () => {
      if (viewingAttachment?.objectUrl) {
        URL.revokeObjectURL(viewingAttachment.objectUrl);
      }
    };
  }, [viewingAttachment]);

  const filteredTickets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      t =>
        String(t.subject || '').toLowerCase().includes(q) ||
        String(t.ticket_number || t.id || '').toLowerCase().includes(q) ||
        String(t.category || '').toLowerCase().includes(q)
    );
  }, [tickets, searchTerm]);

  const handleOpenTicket = async (ticket: SupportTicketItem) => {
    setSelectedTicket(ticket);
    setLoadingThread(true);
    setFeedback(null);
    try {
      const res = await api.getSupportTicketDetails(ticket.id);
      if (res?.ticket) {
        setSelectedTicket(res.ticket);
      }
      setReplies(Array.isArray(res?.replies) ? res.replies : []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load ticket conversation.' });
    } finally {
      setLoadingThread(false);
    }
  };

  const handleUploadFile = async (
    file: File,
    mode: 'new' | 'reply'
  ) => {
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Attachment file must not exceed 5MB.' });
      return;
    }
    if (mode === 'new') setUploadingNewFile(true);
    else setUploadingReplyFile(true);
    setFeedback(null);
    try {
      const res = await api.uploadSupportAttachment(file);
      if (mode === 'new') {
        setNewAttachmentUrl(res.file_url);
        setNewAttachmentName(res.file_name || file.name);
      } else {
        setReplyAttachmentUrl(res.file_url);
        setReplyAttachmentName(res.file_name || file.name);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Attachment upload failed.' });
    } finally {
      if (mode === 'new') setUploadingNewFile(false);
      else setUploadingReplyFile(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setFeedback({ type: 'error', message: 'Subject and detailed description are required.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await api.createSupportTicket({
        subject: subject.trim(),
        category,
        priority,
        message: message.trim(),
        ...(newAttachmentUrl
          ? { attachment_url: newAttachmentUrl, attachments: [{ file_url: newAttachmentUrl }] }
          : {}),
      });
      const createdId = String(res.ticket_id || res.ticket?.id || res.ticket_reference || '');
      setFeedback({
        type: 'success',
        message: res.message || `Ticket ${createdId} created successfully.`,
      });
      setSubject('');
      setMessage('');
      setNewAttachmentUrl('');
      setNewAttachmentName('');
      setActiveTab('tickets');
      await loadTickets(createdId);
      if (res.ticket) {
        await handleOpenTicket(res.ticket);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit support ticket.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    setFeedback(null);
    try {
      await api.replySupportTicket(
        selectedTicket.id,
        replyText.trim(),
        false,
        replyAttachmentUrl || undefined
      );
      setReplyText('');
      setReplyAttachmentUrl('');
      setReplyAttachmentName('');
      await handleOpenTicket(selectedTicket);
      await loadTickets(selectedTicket.id);
      setFeedback({ type: 'success', message: 'Reply sent to support desk.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to send reply.' });
    } finally {
      setSendingReply(false);
    }
  };

  const handleOpenAttachment = async (fileUrl: string) => {
    if (!fileUrl) return;
    setLoadingAttachment(true);
    setFeedback(null);
    try {
      const { blob, contentType } = await api.fetchAuthenticatedBlob(fileUrl);
      const objectUrl = URL.createObjectURL(blob);
      setViewingAttachment({ objectUrl, contentType, sourceUrl: fileUrl });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Unable to load attachment.' });
    } finally {
      setLoadingAttachment(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (String(status || 'open').toLowerCase()) {
      case 'open':
        return 'text-emerald-400';
      case 'in_progress':
        return 'text-cyan-400';
      case 'waiting_customer':
        return 'text-amber-400';
      case 'resolved':
        return 'text-emerald-300';
      case 'closed':
        return 'text-slate-500';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-400 mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Support Desk</span>
            <span aria-hidden="true">·</span>
            <span>{user.full_name}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Customer Support &amp; Resolution Center
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Track ongoing tickets, exchange messages or receipts with our support specialists, or open a new support case.
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'tickets'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>My Tickets ({tickets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'new'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Open New Ticket</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl flex items-center justify-between text-xs font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeTab === 'tickets' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: My Tickets List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search tickets by ID or subject..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting_customer">Waiting You</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadTickets()}
                  className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition"
                  title="Refresh tickets"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTickets ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loadingTickets ? (
              <div className="p-10 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                Loading your support tickets...
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-10 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-3">
                <Inbox className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-semibold text-white">No Support Tickets Yet</p>
                <p className="text-xs text-slate-400">
                  Open a ticket for NIN/BVN, wallet funding, or telecom assistance.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('new')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                >
                  Open New Ticket
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
                {filteredTickets.map(t => {
                  const selected = selectedTicket?.id === t.id;
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => void handleOpenTicket(t)}
                      className={`w-full text-left p-4 rounded-xl border transition ${
                        selected
                          ? 'bg-indigo-950/35 border-indigo-500/60'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                        <span className="font-mono font-bold text-indigo-400">{t.ticket_number || t.id}</span>
                        <span className={`font-semibold uppercase ${getStatusStyle(t.status)}`}>
                          {formatLabel(t.status, 'open')}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-white truncate">{t.subject}</p>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                        <span className="capitalize">
                          {formatLabel(t.category, 'general')} · {formatLabel(t.priority, 'medium')}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Ticket Conversation */}
          <div className="lg:col-span-7">
            {selectedTicket ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-[680px] overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono font-bold text-indigo-400">
                        {selectedTicket.ticket_number || selectedTicket.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{formatLabel(selectedTicket.category, 'general')}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold capitalize ${getStatusStyle(selectedTicket.status)}`}>
                        {formatLabel(selectedTicket.status, 'open')}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1">{selectedTicket.subject}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleOpenTicket(selectedTicket)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingThread ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3.5">
                  {loadingThread ? (
                    <div className="py-16 text-center text-slate-500 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                      Loading conversation...
                    </div>
                  ) : replies.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 text-xs">
                      No messages on this ticket yet.
                    </div>
                  ) : (
                    replies.map(reply => {
                      const isStaffReply =
                        Boolean(reply.is_staff) ||
                        ['support', 'staff', 'manager', 'admin', 'superadmin'].includes(
                          String(reply.author_role || '').toLowerCase()
                        );
                      const attUrl =
                        reply.attachment_url ||
                        reply.attachments?.[0]?.file_url ||
                        reply.attachments?.[0]?.url ||
                        '';
                      return (
                        <div
                          key={reply.id}
                          className={`rounded-xl p-4 border ${
                            isStaffReply
                              ? 'bg-indigo-950/25 border-indigo-500/25 mr-6'
                              : 'bg-slate-950/70 border-slate-800 ml-6'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] mb-2 pb-1.5 border-b border-slate-800/70">
                            <span className={`font-semibold ${isStaffReply ? 'text-indigo-400' : 'text-emerald-400'}`}>
                              {isStaffReply
                                ? `${reply.author_name || 'Support Desk'} (${formatLabel(reply.author_role, 'staff')})`
                                : reply.author_name || user.full_name}
                            </span>
                            <span className="font-mono tabular-nums text-[10px] text-slate-500">
                              {new Date(reply.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{reply.message}</p>
                          {attUrl && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/60">
                              <button
                                type="button"
                                disabled={loadingAttachment}
                                onClick={() => void handleOpenAttachment(attUrl)}
                                className="inline-flex items-center gap-1.5 text-[11px] text-sky-400 hover:text-sky-300 font-medium"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>View / Download Attachment</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendReply} className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-2.5">
                  <textarea
                    rows={3}
                    required
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Write a reply or follow-up details..."
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 cursor-pointer flex items-center gap-1.5 transition whitespace-nowrap">
                        {uploadingReplyFile ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        ) : (
                          <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>{replyAttachmentName ? 'Change File' : 'Attach File'}</span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadFile(f, 'reply');
                          }}
                        />
                      </label>
                      {replyAttachmentName && (
                        <span className="text-[11px] text-emerald-400 flex items-center gap-1 truncate max-w-[180px]">
                          <FileText className="w-3 h-3 shrink-0" />
                          {replyAttachmentName}
                          <button
                            type="button"
                            onClick={() => {
                              setReplyAttachmentUrl('');
                              setReplyAttachmentName('');
                            }}
                            className="text-slate-400 hover:text-white ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={sendingReply || uploadingReplyFile || !replyText.trim()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap"
                    >
                      {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>Send Reply</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="h-[680px] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                <MessageSquare className="w-10 h-10 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Select a Ticket Thread</h3>
                <p className="text-xs max-w-sm">
                  Choose any ticket from the left list to inspect responses and reply to support officers, or open a new support case.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Open Support Ticket Form */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span>Open Technical Support Ticket</span>
            </h2>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Delayed MTN Data Bundle / Wallet Transfer Query"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Department / Category
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="general">General Support</option>
                    <option value="verification">Identity Verification (NIN / BVN)</option>
                    <option value="funding">Wallet &amp; Bank Funding</option>
                    <option value="telecom">Airtime, Data &amp; PINs</option>
                    <option value="account">Account, KYC &amp; Security</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Priority
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`py-2 px-2 rounded-xl border text-xs font-semibold capitalize transition ${
                          priority === p
                            ? p === 'urgent'
                              ? 'border-red-500 bg-red-500/10 text-red-400'
                              : 'border-indigo-500 bg-indigo-500/10 text-white'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Detailed Message &amp; Transaction Reference *
                </label>
                <textarea
                  rows={5}
                  required
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Include transaction reference, recipient phone number or NIN tracking ID, and error details..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Supporting Screenshot or Receipt (Optional · JPG, PNG, WEBP, PDF ≤ 5MB)
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white cursor-pointer flex items-center gap-2 transition">
                    {uploadingNewFile ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    ) : (
                      <Paperclip className="w-4 h-4 text-indigo-400" />
                    )}
                    <span>{newAttachmentName ? 'Replace Attachment' : 'Upload Attachment'}</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadFile(f, 'new');
                      }}
                    />
                  </label>
                  {newAttachmentName && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {newAttachmentName}
                      <button
                        type="button"
                        onClick={() => {
                          setNewAttachmentUrl('');
                          setNewAttachmentName('');
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || uploadingNewFile}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Dispatching Ticket...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Ticket</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Contact Channels & Direct Desk */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Official Support Channels</span>
              </h3>

              <div className="space-y-3">
                <a
                  href="mailto:support@hambaktech.com.ng"
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <div>
                      <p className="font-semibold text-white">Support Email</p>
                      <p className="text-[11px] text-slate-400 font-mono">support@hambaktech.com.ng</p>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>

                <a
                  href="https://wa.me/2349155104724?text=Hello%20HAMBAKTECH%20Support,%20I%20need%20assistance%20with%20my%20account"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition"
                >
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="font-semibold text-white">WhatsApp Desk</p>
                      <p className="text-[11px] text-slate-400 font-mono">09155104724</p>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>

                <a
                  href="tel:08147837664"
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition"
                >
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="font-semibold text-white">Business / Upline Contact</p>
                      <p className="text-[11px] text-slate-400 font-mono">08147837664</p>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>

                <a
                  href="tel:09127469686"
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition"
                >
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-sky-400" />
                    <div>
                      <p className="font-semibold text-white">Customer Service / Office</p>
                      <p className="text-[11px] text-slate-400 font-mono">09127469686</p>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Service Level Agreements</span>
              </h3>
              <ul className="text-slate-400 space-y-2 tabular-nums">
                <li className="flex justify-between">
                  <span>Critical / Wallet Funding:</span>
                  <span className="font-semibold text-white">&lt; 15 mins</span>
                </li>
                <li className="flex justify-between">
                  <span>Telecom Dispute / Failed PIN:</span>
                  <span className="font-semibold text-white">&lt; 30 mins</span>
                </li>
                <li className="flex justify-between">
                  <span>KYC Verification Review:</span>
                  <span className="font-semibold text-white">&lt; 2 hours</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Authenticated Attachment Preview Modal */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
              <span className="text-xs font-semibold text-white">Support Ticket Attachment</span>
              <div className="flex items-center gap-2">
                <a
                  href={viewingAttachment.objectUrl}
                  download={`support_attachment_${Date.now()}`}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingAttachment(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-950 max-h-[75vh] overflow-auto flex items-center justify-center">
              {viewingAttachment.contentType.includes('pdf') ? (
                <iframe
                  src={viewingAttachment.objectUrl}
                  title="Support Attachment PDF"
                  className="w-full h-[65vh] rounded-lg border border-slate-800"
                />
              ) : (
                <img
                  src={viewingAttachment.objectUrl}
                  alt="Support attachment"
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[68vh] rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
