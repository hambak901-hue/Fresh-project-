import React, { useState, useEffect } from 'react';
import {
  LifeBuoy,
  MessageSquare,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  User,
  Send,
  Lock,
  Paperclip,
  RefreshCw,
  ChevronRight,
  ShieldAlert,
  Inbox,
  Check,
  X,
  FileText
} from 'lucide-react';
import { api } from '../../lib/api';

interface SupportTicket {
  id: number;
  ticket_number?: string;
  reference?: string;
  user_id: number;
  customer_name?: string;
  customer_email?: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  assigned_to?: number | null;
  assigned_staff_name?: string;
  created_at: string;
  updated_at: string;
}

interface TicketReply {
  id: number;
  ticket_id: number;
  user_id: number;
  author_name?: string;
  author_role?: string;
  message: string;
  is_internal_note: boolean | number;
  attachments?: any[];
  created_at: string;
}

export const SupportManagement: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    open: 0,
    in_progress: 0,
    waiting_customer: 0,
    resolved: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketReplies, setTicketReplies] = useState<TicketReply[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminSupportTickets({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchTerm.trim() || undefined,
      });
      if (res && res.success) {
        setTickets(res.tickets || []);
        if (res.metrics) {
          setMetrics(res.metrics);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load support tickets' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, priorityFilter, categoryFilter]);

  const handleOpenTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setLoadingDetails(true);
    setReplyText('');
    setIsInternalNote(false);
    try {
      const res = await api.getSupportTicketDetails(ticket.id);
      if (res && res.success) {
        setTicketReplies(res.replies || []);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load ticket conversation' });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;

    setSubmittingReply(true);
    setFeedback(null);
    try {
      const res = await api.replySupportTicket(selectedTicket.id, replyText.trim(), isInternalNote);
      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: isInternalNote ? 'Internal note recorded.' : 'Response sent to customer successfully.'
        });
        setReplyText('');
        // Reload details
        const updated = await api.getSupportTicketDetails(selectedTicket.id);
        if (updated && updated.success) {
          setTicketReplies(updated.replies || []);
        }
        // Refresh list count
        fetchTickets();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to send reply' });
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;
    try {
      const res = await api.updateSupportTicketStatus(selectedTicket.id, { status: newStatus });
      if (res && res.success) {
        setSelectedTicket(prev => prev ? { ...prev, status: newStatus as any } : null);
        setFeedback({ type: 'success', message: `Ticket status updated to ${newStatus.replace('_', ' ')}` });
        fetchTickets();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update ticket status' });
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!selectedTicket) return;
    try {
      const res = await api.updateSupportTicketStatus(selectedTicket.id, { priority: newPriority });
      if (res && res.success) {
        setSelectedTicket(prev => prev ? { ...prev, priority: newPriority as any } : null);
        setFeedback({ type: 'success', message: `Ticket priority updated to ${newPriority}` });
        fetchTickets();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update ticket priority' });
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">URGENT</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">HIGH</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">LOW</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">OPEN</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">IN PROGRESS</span>;
      case 'waiting_customer':
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">WAITING CUSTOMER</span>;
      case 'resolved':
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-500/30">RESOLVED</span>;
      case 'closed':
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-400">CLOSED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <LifeBuoy className="w-3.5 h-3.5" />
            Support Administration &bull; Stage 8
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Support Centre Management</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Resolve customer inquiries, handle verification escalations, prioritize urgent cases, and maintain staff internal notes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTickets()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs font-medium ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">Total Tickets</p>
          <p className="text-xl font-bold text-white mt-1">{metrics.total}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-emerald-400">Open Tickets</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{metrics.open}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-cyan-400">In Progress</p>
          <p className="text-xl font-bold text-cyan-400 mt-1">{metrics.in_progress}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-purple-400">Waiting Customer</p>
          <p className="text-xl font-bold text-purple-400 mt-1">{metrics.waiting_customer}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-green-400">Resolved</p>
          <p className="text-xl font-bold text-green-400 mt-1">{metrics.resolved}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-500">Closed</p>
          <p className="text-xl font-bold text-slate-400 mt-1">{metrics.closed}</p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search tickets by subject, customer name, email, or #reference..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchTickets()}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status selector */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_customer">Waiting Customer</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          {/* Priority selector */}
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Category selector */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Categories</option>
            <option value="verification">Identity Verification</option>
            <option value="funding">Wallet & Funding</option>
            <option value="telecom">Airtime & Telecom</option>
            <option value="account">Account & Security</option>
            <option value="general">General Support</option>
          </select>

          <button
            onClick={() => fetchTickets()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Main Layout: Ticket List & Conversation Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Ticket Cards List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Tickets ({tickets.length})</span>
            <span>Sorted by recent update</span>
          </div>

          {loading ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
              <p className="text-xs">Loading support tickets...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-2">
              <Inbox className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-semibold text-white">No Support Tickets Found</p>
              <p className="text-xs">Tickets submitted by customers will show up here for administrative review.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
              {tickets.map(ticket => {
                const isSelected = selectedTicket?.id === ticket.id;
                const ref = ticket.ticket_number || ticket.reference || `#TKT-${ticket.id}`;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => handleOpenTicket(ticket)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-900/20'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[10px] text-indigo-400 font-bold">{ref}</span>
                      <div className="flex items-center gap-1.5">
                        {getPriorityBadge(ticket.priority)}
                        {getStatusBadge(ticket.status)}
                      </div>
                    </div>

                    <h4 className="text-xs font-semibold text-white truncate">{ticket.subject}</h4>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                      <span className="truncate max-w-[140px] text-slate-300">
                        {ticket.customer_name || ticket.customer_email || `User #${ticket.user_id}`}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="capitalize px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {ticket.category.replace('_', ' ')}
                      </span>
                      {ticket.assigned_staff_name ? (
                        <span className="text-indigo-400">Assigned: {ticket.assigned_staff_name}</span>
                      ) : (
                        <span className="text-amber-500/80">Unassigned</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Selected Ticket Detail & Conversation Thread */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-[750px] overflow-hidden">
              {/* Ticket Top bar */}
              <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/40 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-indigo-400">
                        {selectedTicket.ticket_number || selectedTicket.reference || `#TKT-${selectedTicket.id}`}
                      </span>
                      <span className="text-[10px] text-slate-500">&bull;</span>
                      <span className="text-xs text-slate-400 capitalize">{selectedTicket.category.replace('_', ' ')}</span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1">{selectedTicket.subject}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Submitted by: <span className="text-white font-medium">{selectedTicket.customer_name || 'Customer'}</span> ({selectedTicket.customer_email || `ID #${selectedTicket.user_id}`})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status change dropdown */}
                    <select
                      value={selectedTicket.status}
                      onChange={e => handleStatusChange(e.target.value)}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 focus:outline-none"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="waiting_customer">Waiting Customer</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>

                    {/* Priority change dropdown */}
                    <select
                      value={selectedTicket.priority}
                      onChange={e => handlePriorityChange(e.target.value)}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 focus:outline-none"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
                {loadingDetails ? (
                  <div className="py-20 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    <p className="text-xs">Loading replies...</p>
                  </div>
                ) : ticketReplies.length === 0 ? (
                  <div className="py-20 text-center text-slate-500">
                    <MessageSquare className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                    <p className="text-xs">No replies in this thread yet. Send a response below.</p>
                  </div>
                ) : (
                  ticketReplies.map(reply => {
                    const isStaff = reply.author_role === 'admin' || reply.author_role === 'superadmin' || reply.author_role === 'staff';
                    const isInternal = !!reply.is_internal_note;

                    return (
                      <div
                        key={reply.id}
                        className={`flex flex-col ${
                          isInternal
                            ? 'bg-amber-950/30 border border-amber-500/30 rounded-xl p-4'
                            : isStaff
                            ? 'bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4 ml-6'
                            : 'bg-slate-950/60 border border-slate-800 rounded-xl p-4 mr-6'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-2 pb-1.5 border-b border-slate-800/60">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${isInternal ? 'text-amber-400' : isStaff ? 'text-indigo-400' : 'text-slate-300'}`}>
                              {reply.author_name || (isStaff ? 'Administrative Officer' : 'Customer')}
                            </span>
                            {isInternal && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 uppercase">
                                Internal Staff Note
                              </span>
                            )}
                            {isStaff && !isInternal && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 uppercase">
                                Staff Reply
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(reply.created_at).toLocaleString()}
                          </span>
                        </div>

                        <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {reply.message}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(false)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                        !isInternalNote
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Customer Response
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(true)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                        isInternalNote
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Lock className="w-3 h-3" />
                      Internal Note Only
                    </button>
                  </div>
                  {isInternalNote && (
                    <span className="text-[11px] text-amber-400 font-mono">
                      Not visible to the customer
                    </span>
                  )}
                </div>

                <div className="relative">
                  <textarea
                    rows={3}
                    required
                    placeholder={
                      isInternalNote
                        ? 'Enter confidential admin observations, escalation notes, or verification investigation details...'
                        : 'Write a helpful response to the customer...'
                    }
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="submit"
                    disabled={submittingReply || !replyText.trim()}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 ${
                      isInternalNote
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {submittingReply ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{isInternalNote ? 'Save Internal Note' : 'Send Reply to Customer'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-[750px] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <LifeBuoy className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white">Select a Ticket</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Choose a ticket from the left panel to review customer communications, update operational priority, or compose replies.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
