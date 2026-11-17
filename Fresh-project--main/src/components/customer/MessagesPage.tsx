import React, { useState, useEffect } from 'react';
import { Mail, CheckCircle2, Clock, Shield, AlertTriangle, ArrowRight, Search, RefreshCw, X, FileText, Check, Inbox } from 'lucide-react';
import { api } from '../../lib/api';
import { CustomerMessage } from '../../types';

export function MessagesPage() {
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'service' | 'system' | 'security' | 'billing'>('all');
  const [selectedMessage, setSelectedMessage] = useState<CustomerMessage | null>(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomerMessages();
      if (res?.messages) {
        setMessages(res.messages);
      }
    } catch (e) {
      console.warn('Failed to fetch messages:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleOpenMessage = async (msg: CustomerMessage) => {
    setSelectedMessage(msg);
    if (!msg.read) {
      try {
        await api.markCustomerMessageRead(msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
      } catch (e) {}
    }
  };

  const filteredMessages = messages.filter(m => {
    const matchesCat = filterCategory === 'all' || m.category === filterCategory;
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.body.toLowerCase().includes(search.toLowerCase()) ||
      (m.reference ? m.reference.toLowerCase().includes(search.toLowerCase()) : false);
    return matchesCat && matchesSearch;
  });

  const unreadCount = messages.filter(m => !m.read).length;

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'service':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Service Result</span>;
      case 'security':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Security Alert</span>;
      case 'billing':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">Billing</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">System Notice</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Inbox className="w-3.5 h-3.5" />
              <span>System Communications &amp; Dispatch Inbox</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Messages &amp; Dispatches
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Official notifications, verification certificate ready notices, carrier delivery logs, and platform communications.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchMessages}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          {(['all', 'service', 'system', 'security', 'billing'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize whitespace-nowrap transition ${
                filterCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat === 'all' ? `All Messages (${messages.length})` : cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search messages, refs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Messages List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-400" />
            <p>Loading your system dispatches...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm space-y-2">
            <Mail className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="font-semibold text-white">No messages found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You are all caught up! New carrier fulfillment confirmations and official notices will appear here.
            </p>
          </div>
        ) : (
          filteredMessages.map(msg => (
            <div
              key={msg.id}
              onClick={() => handleOpenMessage(msg)}
              className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-4 ${
                !msg.read
                  ? 'bg-slate-900/90 border-indigo-500/40 hover:border-indigo-400'
                  : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    !msg.read
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {getCategoryBadge(msg.category)}
                    {!msg.read && (
                      <span className="w-2 h-2 rounded-full bg-indigo-400 ring-2 ring-indigo-400/20" />
                    )}
                    <h3 className={`text-sm truncate ${!msg.read ? 'font-bold text-white' : 'font-semibold text-slate-300'}`}>
                      {msg.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {msg.body}
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 font-mono">
                    <span>{new Date(msg.created_at).toLocaleDateString()} {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.reference && (
                      <>
                        <span>&bull;</span>
                        <span className="text-indigo-400 font-semibold">{msg.reference}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 self-center hidden sm:block" />
            </div>
          ))
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 text-slate-100 shadow-2xl relative space-y-4">
            <button
              onClick={() => setSelectedMessage(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {getCategoryBadge(selectedMessage.category)}
                <span className="text-[11px] text-slate-500 font-mono">
                  {new Date(selectedMessage.created_at).toLocaleString()}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">{selectedMessage.title}</h2>
              {selectedMessage.reference && (
                <p className="text-xs text-indigo-400 font-mono font-semibold">
                  Reference: {selectedMessage.reference}
                </p>
              )}
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {selectedMessage.body}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 font-mono">Status: Delivered &bull; Certified</span>
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
