import React, { useState, useEffect } from 'react';
import {
  Bell,
  Megaphone,
  Send,
  Mail,
  MessageSquare,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Eye,
  EyeOff,
  Users,
  Check,
  X
} from 'lucide-react';
import { api } from '../../lib/api';

interface AnnouncementItem {
  id: number | string;
  title: string;
  message: string;
  type: string;
  is_active: boolean | number;
  start_date?: string;
  end_date?: string;
  created_at: string;
}

export const NotificationManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'announcements' | 'broadcast' | 'logs'>('announcements');
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    total_in_app: 0,
    unread_in_app: 0,
    total_broadcasts: 0,
    active_announcements: 0,
    email_logs_count: 0,
    sms_logs_count: 0,
  });

  // Announcement modal / editor state
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementItem | null>(null);
  const [isNewAnnouncementOpen, setIsNewAnnouncementOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementType, setAnnouncementType] = useState('info');
  const [announcementActive, setAnnouncementActive] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Broadcast composer state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastChannel, setBroadcastChannel] = useState<'in_app' | 'email' | 'sms' | 'all'>('in_app');
  const [broadcastTargetRole, setBroadcastTargetRole] = useState<'customer' | 'admin' | 'all'>('all');
  const [broadcastUserId, setBroadcastUserId] = useState<string>('');
  const [broadcastType, setBroadcastType] = useState('info');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, announcementsRes, broadcastsRes] = await Promise.all([
        api.getAdminNotificationOverview().catch(() => null),
        api.getAdminAnnouncements().catch(() => null),
        api.getAdminBroadcasts().catch(() => null),
      ]);

      if (overviewRes && overviewRes.success) {
        setMetrics(overviewRes.metrics || metrics);
      }
      if (announcementsRes && announcementsRes.success) {
        setAnnouncements(announcementsRes.announcements || []);
      }
      if (broadcastsRes && broadcastsRes.success) {
        setBroadcasts(broadcastsRes.broadcasts || []);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load notifications' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementMessage.trim()) return;

    setSavingAnnouncement(true);
    setFeedback(null);
    try {
      const payload = {
        id: editingAnnouncement ? editingAnnouncement.id : undefined,
        title: announcementTitle.trim(),
        message: announcementMessage.trim(),
        type: announcementType,
        is_active: announcementActive ? 1 : 0,
      };
      const res = await api.saveAdminAnnouncement(payload);
      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: editingAnnouncement ? 'Announcement updated successfully' : 'New announcement published'
        });
        setIsNewAnnouncementOpen(false);
        setEditingAnnouncement(null);
        setAnnouncementTitle('');
        setAnnouncementMessage('');
        loadData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save announcement' });
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: number | string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const res = await api.deleteAdminAnnouncement(id);
      if (res && res.success) {
        setFeedback({ type: 'success', message: 'Announcement deleted successfully' });
        loadData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete announcement' });
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;

    setSendingBroadcast(true);
    setFeedback(null);
    try {
      const res = await api.sendAdminBroadcast({
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        channel: broadcastChannel,
        target_role: broadcastTargetRole,
        user_id: broadcastUserId ? parseInt(broadcastUserId, 10) : null,
        type: broadcastType,
      });

      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: `Broadcast transmitted successfully to ${res.recipient_count || 'all'} targeted recipients.`
        });
        setBroadcastTitle('');
        setBroadcastMessage('');
        setBroadcastUserId('');
        loadData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to transmit broadcast' });
    } finally {
      setSendingBroadcast(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Bell className="w-3.5 h-3.5" />
            Notification Administration &bull; Stage 8
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Notification System & Broadcasts</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Dispatch urgent system announcements, transmit cross-channel push/in-app broadcasts, and inspect message delivery queues.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              setEditingAnnouncement(null);
              setAnnouncementTitle('');
              setAnnouncementMessage('');
              setAnnouncementType('info');
              setAnnouncementActive(true);
              setIsNewAnnouncementOpen(true);
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Announcement</span>
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

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-slate-400">In-App Alerts</p>
          <p className="text-xl font-bold text-white mt-1">{metrics.total_in_app}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-amber-400">Unread Alerts</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{metrics.unread_in_app}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-indigo-400">Broadcasts Sent</p>
          <p className="text-xl font-bold text-indigo-400 mt-1">{metrics.total_broadcasts}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-emerald-400">Active Banners</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{metrics.active_announcements}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-cyan-400">Email Dispatches</p>
          <p className="text-xl font-bold text-cyan-400 mt-1">{metrics.email_logs_count}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-[11px] font-medium text-purple-400">SMS Outbox</p>
          <p className="text-xl font-bold text-purple-400 mt-1">{metrics.sms_logs_count}</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-800 gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('announcements')}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
            activeTab === 'announcements'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Announcements & Banners ({announcements.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('broadcast')}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
            activeTab === 'broadcast'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Transmit Broadcast</span>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Broadcast History & Logs ({broadcasts.length})</span>
        </button>
      </div>

      {/* Tab 1: Announcements */}
      {activeTab === 'announcements' && (
        <div className="space-y-4">
          {announcements.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-2">
              <Megaphone className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-semibold text-white">No Public Announcements</p>
              <p className="text-xs">Create announcement banners to notify customers on landing pages and their dashboard.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {announcements.map(ann => {
                const isActive = !!ann.is_active;
                return (
                  <div
                    key={ann.id}
                    className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          ann.type === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          ann.type === 'alert' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          ann.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          {ann.type}
                        </span>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{ann.message}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-slate-500">
                        {new Date(ann.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingAnnouncement(ann);
                            setAnnouncementTitle(ann.title);
                            setAnnouncementMessage(ann.message);
                            setAnnouncementType(ann.type || 'info');
                            setAnnouncementActive(!!ann.is_active);
                            setIsNewAnnouncementOpen(true);
                          }}
                          className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-xs transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/20 rounded-lg transition"
                          title="Delete Announcement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Broadcast Composer */}
      {activeTab === 'broadcast' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-3xl space-y-5">
          <div>
            <h3 className="text-base font-bold text-white">Transmit Mass Notification Broadcast</h3>
            <p className="text-xs text-slate-400 mt-1">
              Send high-priority notifications to all registered customers or specific user accounts across chosen transmission channels.
            </p>
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Transmission Channel</label>
                <select
                  value={broadcastChannel}
                  onChange={e => setBroadcastChannel(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="in_app">In-App Notification</option>
                  <option value="email">Email Notification</option>
                  <option value="sms">SMS Gateway</option>
                  <option value="all">All Channels (Omni)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Audience</label>
                <select
                  value={broadcastTargetRole}
                  onChange={e => setBroadcastTargetRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Users (Customers & Staff)</option>
                  <option value="customer">Customers Only</option>
                  <option value="admin">Admins & Staff Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notification Priority</label>
                <select
                  value={broadcastType}
                  onChange={e => setBroadcastType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="info">General Info (Blue)</option>
                  <option value="success">Success / Milestone (Green)</option>
                  <option value="warning">Warning / Maintenance (Amber)</option>
                  <option value="alert">Critical Security Alert (Red)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Target User ID <span className="text-slate-500 font-normal">(Optional &bull; Leave empty to broadcast to entire group)</span>
              </label>
              <input
                type="number"
                placeholder="e.g. 1024"
                value={broadcastUserId}
                onChange={e => setBroadcastUserId(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Broadcast Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Scheduled Network Maintenance Notice"
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Broadcast Body Message</label>
              <textarea
                rows={4}
                required
                placeholder="Detail the announcement, instructions, or operational notice clearly..."
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={sendingBroadcast}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition disabled:opacity-50"
              >
                {sendingBroadcast ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Dispatch Broadcast Now</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: History & Logs */}
      {activeTab === 'logs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Broadcast Delivery History</h3>
            <span className="text-xs text-slate-400">Total Transmissions: {broadcasts.length}</span>
          </div>

          {broadcasts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No previous broadcasts logged. Transmitted messages will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Target</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Recipients</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {broadcasts.map((b, idx) => (
                    <tr key={b.id || idx} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-white">{b.title}</td>
                      <td className="py-3 px-4 uppercase text-[10px] font-mono text-indigo-400">{b.channel || 'IN-APP'}</td>
                      <td className="py-3 px-4 capitalize text-slate-400">{b.target_role || 'All'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                          {b.type || 'info'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">{b.recipient_count ?? 'All Active'}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                          <Check className="w-3 h-3" /> Delivered
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {b.created_at ? new Date(b.created_at).toLocaleString() : 'Recent'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* New / Edit Announcement Modal */}
      {isNewAnnouncementOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingAnnouncement ? 'Edit Announcement' : 'Publish New Announcement'}
              </h3>
              <button
                onClick={() => setIsNewAnnouncementOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Announcement Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. New Telecom Services Now Active"
                  value={announcementTitle}
                  onChange={e => setAnnouncementTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Message Content</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Enter notice details visible to customers..."
                  value={announcementMessage}
                  onChange={e => setAnnouncementMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Banner Style</label>
                  <select
                    value={announcementType}
                    onChange={e => setAnnouncementType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="info">Info (Blue)</option>
                    <option value="success">Success (Green)</option>
                    <option value="warning">Warning (Amber)</option>
                    <option value="alert">Alert (Red)</option>
                  </select>
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={announcementActive}
                      onChange={e => setAnnouncementActive(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                    />
                    <span>Active on site immediately</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewAnnouncementOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAnnouncement}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {savingAnnouncement && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingAnnouncement ? 'Save Changes' : 'Publish Announcement'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
