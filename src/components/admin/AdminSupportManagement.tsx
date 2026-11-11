/**
 * @file AdminSupportManagement.tsx
 * Production Support Centre Management Desk for HambakTech Enterprise.
 * Provides customer ticket triage, staff replies, status transitions, and priority escalations.
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  User,
  Shield,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'pending' | 'resolved' | 'closed';
  department: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_tier?: number;
  customer_balance?: number;
  reply_count?: number;
  created_at: string;
  updated_at: string;
}

interface SupportReply {
  id: string;
  user_id: string;
  is_staff: boolean;
  message: string;
  attachment_url?: string;
  author_name?: string;
  author_role?: string;
  created_at: string;
}

export const AdminSupportManagement: React.FC = () => {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<SupportReply[]>([]);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      let url = '/api/admin/support/tickets';
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.tickets) {
        setTickets(data.tickets);
        if (selectedTicket) {
          const updated = data.tickets.find((t: SupportTicket) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, searchQuery]);

  const loadTicketDetails = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticket.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.replies) {
        setReplies(data.replies);
      }
    } catch {
      // Fallback
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim() || sendingReply) return;

    setSendingReply(true);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: replyMessage.trim(),
          status: 'resolved',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess('Response dispatched to customer account!');
        setReplyMessage('');
        loadTicketDetails(selectedTicket);
        fetchTickets();
      }
    } catch {
      // Error
    } finally {
      setSendingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedTicket) return;
    try {
      await fetch(`/api/admin/support/tickets/${selectedTicket.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      setSelectedTicket({ ...selectedTicket, status: newStatus as any });
      fetchTickets();
    } catch {
      // Error
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'urgent':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'medium':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'open':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'pending':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      case 'resolved':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'closed':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-semibold">
            <LifeBuoy className="w-3.5 h-3.5" />
            <span>Dedicated Customer Support Desk</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Support Ticket Management</h2>
          <p className="text-xs text-slate-400">
            Triage inquiries, answer verification questions, and resolve customer service requests in real time.
          </p>
        </div>

        <button
          onClick={fetchTickets}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Main Two-Pane Desk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Pane: Ticket List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            {/* Search and Filters */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search subject, email, or customer..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['all', 'open', 'pending', 'resolved', 'closed'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Cards */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {loading && tickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
                Loading tickets...
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
                No tickets matching current filters.
              </div>
            ) : (
              tickets.map(ticket => (
                <div
                  key={ticket.id}
                  onClick={() => loadTicketDetails(ticket)}
                  className={`p-4 rounded-2xl border cursor-pointer transition text-left space-y-2 ${
                    selectedTicket?.id === ticket.id
                      ? 'bg-indigo-950/20 border-indigo-500/50 shadow-md'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${getStatusBadge(ticket.status)}`}>
                      {ticket.status.toUpperCase()}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${getPriorityBadge(ticket.priority)}`}>
                      {ticket.priority.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-white line-clamp-1">{ticket.subject}</p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate">{ticket.customer_name || ticket.customer_email || 'Customer'}</span>
                    <span className="font-mono text-[10px] shrink-0">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Pane: Conversation & Reply */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 flex flex-col h-full min-h-[500px]">
              {/* Ticket Top Meta */}
              <div className="space-y-3 border-b border-slate-800 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">{selectedTicket.subject}</h3>
                    <p className="text-xs text-slate-400">
                      Department: <span className="text-indigo-400 font-medium">{selectedTicket.department}</span> &bull; Customer:{' '}
                      <span className="text-slate-200">{selectedTicket.customer_email || selectedTicket.customer_name}</span>
                    </p>
                  </div>

                  {/* Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">Status:</span>
                    <select
                      value={selectedTicket.status}
                      onChange={e => handleUpdateStatus(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="open">Open</option>
                      <option value="pending">Pending</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>

                {actionSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{actionSuccess}</span>
                  </div>
                )}
              </div>

              {/* Message Thread */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px] pr-2">
                {replies.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No message history found for this ticket.
                  </div>
                ) : (
                  replies.map(rep => (
                    <div
                      key={rep.id}
                      className={`flex flex-col space-y-1 ${
                        rep.is_staff ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        {rep.is_staff ? (
                          <>
                            <Shield className="w-3 h-3 text-indigo-400" />
                            <span className="text-indigo-400 font-bold">Support Staff</span>
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{rep.author_name || 'Customer'}</span>
                          </>
                        )}
                        <span>&bull;</span>
                        <span>{new Date(rep.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div
                        className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                          rep.is_staff
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/50'
                        }`}
                      >
                        {rep.message}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="pt-4 border-t border-slate-800 space-y-3">
                <textarea
                  rows={3}
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  placeholder="Type official reply to customer..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-none"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-mono">
                    Submitting automatically updates status to "Resolved"
                  </span>
                  <button
                    type="submit"
                    disabled={!replyMessage.trim() || sendingReply}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-600/30"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingReply ? 'Dispatching...' : 'Send Customer Reply'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 flex flex-col items-center justify-center h-full min-h-[400px] space-y-3">
              <MessageSquare className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-semibold text-white">Select a Support Ticket</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Choose a ticket from the left queue to review customer inquiry details, inspect account information, and dispatch assistance.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
