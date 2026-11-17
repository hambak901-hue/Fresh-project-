import React, { useState, useEffect } from 'react';
import { Bell, CheckCheck, CheckCircle2, AlertTriangle, Info, AlertCircle, Megaphone, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { NotificationItem, AnnouncementItem } from '../../types';

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'announcements'>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [notifRes, summaryRes] = await Promise.all([
        api.getCustomerNotifications(),
        api.getCustomerSummary(),
      ]);
      if (notifRes?.notifications) {
        setNotifications(notifRes.notifications);
      }
      if (summaryRes?.announcements) {
        setAnnouncements(summaryRes.announcements);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifs = notifications.filter(n => {
    if (activeTab === 'unread' && n.read) return false;
    if (filterType !== 'all' && n.type !== filterType) return false;
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'alert':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Info className="w-5 h-5 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Bell className="w-3.5 h-3.5" />
              <span>Notification Dispatch Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Notifications & Announcements
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Account updates, wallet transactions, telecom deliveries, and enterprise system broadcast messages.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition"
              >
                <CheckCheck className="w-4 h-4 text-emerald-400" />
                <span>Mark All Read</span>
              </button>
            )}
            <button
              onClick={fetchAll}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-2 mt-6 pt-6 border-t border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl font-medium transition ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            All Messages ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('unread')}
            className={`px-4 py-2 rounded-xl font-medium transition flex items-center gap-1.5 ${
              activeTab === 'unread'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`px-4 py-2 rounded-xl font-medium transition flex items-center gap-1.5 ${
              activeTab === 'announcements'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5 text-amber-400" />
            <span>Broadcasts ({announcements.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'announcements' ? (
        /* Announcements Section */
        <div className="space-y-4">
          {announcements.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm">
              <Megaphone className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="font-semibold text-slate-300">No active system announcements</p>
              <p className="text-xs text-slate-500">Check back later for network status updates</p>
            </div>
          ) : (
            announcements.map(ann => (
              <div
                key={ann.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold uppercase">
                      {ann.category || 'System Broadcast'}
                    </span>
                    {ann.is_pinned && (
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-medium">
                        PINNED
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(ann.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">{ann.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                  {ann.content}
                </p>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Standard Notifications List */
        <div className="space-y-3">
          {filteredNotifs.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm">
              <Bell className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="font-semibold text-slate-300">No notifications here</p>
              <p className="text-xs text-slate-500">You're all caught up!</p>
            </div>
          ) : (
            filteredNotifs.map(item => (
              <div
                key={item.id}
                className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 transition flex items-start gap-4 ${
                  item.read
                    ? 'border-slate-800/80 opacity-75'
                    : 'border-indigo-500/30 bg-slate-900/90 shadow-md shadow-indigo-950/20'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center shrink-0 mt-0.5">
                  {getIcon(item.type)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-white text-sm">{item.title}</h3>
                    <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString('en-NG', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.message}</p>
                </div>
                {!item.read && (
                  <button
                    onClick={() => handleMarkAsRead(item.id)}
                    className="p-1.5 text-slate-500 hover:text-emerald-400 transition shrink-0"
                    title="Mark as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
