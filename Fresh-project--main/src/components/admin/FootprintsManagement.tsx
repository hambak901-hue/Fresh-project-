import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Calendar, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User, 
  Smartphone, 
  Globe, 
  Eye, 
  ArrowUpRight,
  TrendingUp,
  LogIn,
  CreditCard,
  Layers,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import { ActivityFootprint, FootprintStats } from '../../types';

export const FootprintsManagement: React.FC = () => {
  const [footprints, setFootprints] = useState<ActivityFootprint[]>([]);
  const [stats, setStats] = useState<FootprintStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedFootprint, setSelectedFootprint] = useState<ActivityFootprint | null>(null);
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const limit = 20;

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [footprintsRes, statsRes] = await Promise.all([
        api.getFootprints({
          category: categoryFilter,
          status: statusFilter,
          search: searchQuery,
          start_date: startDate,
          end_date: endDate,
          page,
          limit,
        }),
        api.getFootprintStats(),
      ]);

      if (footprintsRes.success) {
        setFootprints(footprintsRes.footprints || []);
        if (footprintsRes.pagination) {
          setTotalPages(footprintsRes.pagination.pages || 1);
          setTotalCount(footprintsRes.pagination.total || 0);
        }
      }

      if (statsRes.success) {
        setStats(statsRes.stats);
      }
    } catch (err) {
      console.error('Failed to load footprint data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, statusFilter, searchQuery, startDate, endDate, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = () => {
    const url = api.getFootprintsExportUrl({
      category: categoryFilter,
      status: statusFilter,
      search: searchQuery,
      start_date: startDate,
      end_date: endDate,
    });
    window.open(url, '_blank');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'successful':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Successful
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Processing
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-300 border border-slate-500/20">
            <Clock className="w-3.5 h-3.5" />
            Pending
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      auth: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      wallet: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      service: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      admin: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      security: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      visitor: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-medium border uppercase tracking-wider ${styles[category] || styles.visitor}`}>
        {category}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Activity Footprints & Telemetry
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Centralized audit trail tracking all customer operations, logins, wallet fundings, and services
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 text-xs sm:text-sm font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium transition-all shadow-lg shadow-indigo-600/20"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Total Activities</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">
            {stats ? stats.total_activities.toLocaleString() : '...'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">All recorded audit events</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Today's Logins</span>
            <LogIn className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400">
            {stats ? stats.today_logins.toLocaleString() : '...'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Active authenticated users</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Today's Services</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-cyan-400">
            {stats ? stats.today_services.toLocaleString() : '...'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">NIN, VTU & utility requests</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Wallet Events</span>
            <CreditCard className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-purple-400">
            {stats ? stats.wallet_operations.toLocaleString() : '...'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Credits, debits & funding</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Failed Activities</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-rose-400">
            {stats ? stats.failed_activities.toLocaleString() : '...'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Rejected or error events</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Activities' },
            { id: 'auth', label: 'Auth & Logins' },
            { id: 'wallet', label: 'Wallet & Payments' },
            { id: 'service', label: 'Services' },
            { id: 'admin', label: 'Admin Actions' },
            { id: 'security', label: 'Security' },
            { id: 'visitor', label: 'Visitors' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setCategoryFilter(cat.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                categoryFilter === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search user, action, IP, ref..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Status */}
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="successful">Successful</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* End Date */}
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Activity Table */}
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Showing {footprints.length} of {totalCount} activities</span>
          <span>Page {page} of {totalPages}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <p className="text-sm">Loading activity audit logs...</p>
          </div>
        ) : footprints.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Activity className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-300">No activity footprints found</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-800/50 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Customer / User</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Action & Service</th>
                  <th className="px-4 py-3">Reference / Amount</th>
                  <th className="px-4 py-3">Device / IP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {footprints.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Timestamp */}
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400 text-xs">
                      {new Date(item.created_at).toLocaleString('en-NG', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3">
                      {item.user_email ? (
                        <div>
                          <div className="font-medium text-white truncate max-w-[160px]">
                            {item.user_name || item.user_email}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                            {item.user_email}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Anonymous / Guest</span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getCategoryBadge(item.category)}
                    </td>

                    {/* Action & Service */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">
                        {item.action.replace(/_/g, ' ')}
                      </div>
                      {item.service_type && (
                        <span className="text-[11px] text-indigo-400 block font-mono">
                          {item.service_type}
                        </span>
                      )}
                    </td>

                    {/* Reference / Amount */}
                    <td className="px-4 py-3">
                      {item.amount !== null && item.amount !== undefined ? (
                        <div className="font-semibold text-emerald-400">
                          ₦{Number(item.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                        </div>
                      ) : null}
                      {item.reference && (
                        <div className="text-[11px] text-slate-400 font-mono truncate max-w-[120px]" title={item.reference}>
                          {item.reference}
                        </div>
                      )}
                    </td>

                    {/* Device / IP */}
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-300 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate max-w-[120px]">{item.device_info || 'Unknown device'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                        <Globe className="w-3 h-3 text-slate-600 flex-shrink-0" />
                        <span>{item.ip_address || '—'}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>

                    {/* View Details */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedFootprint(item)}
                        className="p-1.5 rounded-lg hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-400 transition-colors"
                        title="View Full Footprint Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-xs text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all disabled:opacity-40"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Activity Detail Modal */}
      {selectedFootprint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Activity Footprint Details</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedFootprint.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedFootprint(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 text-xs block mb-1">Action</label>
                  <p className="font-semibold text-white">{selectedFootprint.action}</p>
                </div>
                <div>
                  <label className="text-slate-500 text-xs block mb-1">Category & Status</label>
                  <div className="flex items-center gap-2">
                    {getCategoryBadge(selectedFootprint.category)}
                    {getStatusBadge(selectedFootprint.status)}
                  </div>
                </div>

                <div>
                  <label className="text-slate-500 text-xs block mb-1">Customer / User</label>
                  <p className="font-medium text-white">{selectedFootprint.user_name || 'N/A'}</p>
                  <p className="text-slate-400 text-xs">{selectedFootprint.user_email || 'Anonymous'}</p>
                  {selectedFootprint.user_id && (
                    <p className="text-slate-500 text-[11px] font-mono mt-0.5">UID: {selectedFootprint.user_id}</p>
                  )}
                </div>

                <div>
                  <label className="text-slate-500 text-xs block mb-1">Financial / Service</label>
                  {selectedFootprint.amount !== null ? (
                    <p className="text-emerald-400 font-bold">
                      ₦{Number(selectedFootprint.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </p>
                  ) : (
                    <p className="text-slate-400">—</p>
                  )}
                  {selectedFootprint.service_type && (
                    <p className="text-indigo-400 text-xs font-mono">{selectedFootprint.service_type}</p>
                  )}
                </div>

                <div>
                  <label className="text-slate-500 text-xs block mb-1">Reference & Provider</label>
                  <p className="text-slate-200 font-mono text-xs">{selectedFootprint.reference || 'None'}</p>
                  <p className="text-slate-400 text-xs">Provider: {selectedFootprint.provider || 'Internal / Hambak'}</p>
                </div>

                <div>
                  <label className="text-slate-500 text-xs block mb-1">Timestamp</label>
                  <p className="text-slate-300 font-mono text-xs">
                    {new Date(selectedFootprint.created_at).toLocaleString('en-NG', {
                      dateStyle: 'medium',
                      timeStyle: 'long',
                    })}
                  </p>
                </div>
              </div>

              {/* Error Message if any */}
              {selectedFootprint.error_message && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  <span className="font-semibold block mb-0.5">Error Message:</span>
                  {selectedFootprint.error_message}
                </div>
              )}

              {/* Device and Client Details */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <div className="font-semibold text-slate-300 text-xs flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Client Telemetry & Device Signature
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">IP Address:</span>
                    <span className="font-mono text-slate-300">{selectedFootprint.ip_address || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Device:</span>
                    <span className="text-slate-300">{selectedFootprint.device_info || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Browser / Client:</span>
                    <span className="text-slate-300">{selectedFootprint.browser_info || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">User Agent:</span>
                    <span className="text-slate-400 text-[11px] font-mono truncate block" title={selectedFootprint.user_agent || ''}>
                      {selectedFootprint.user_agent || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metadata JSON */}
              {selectedFootprint.metadata && Object.keys(selectedFootprint.metadata).length > 0 && (
                <div>
                  <label className="text-slate-500 text-xs block mb-1 font-semibold">Sanitized Metadata Payload</label>
                  <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48">
                    {JSON.stringify(selectedFootprint.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end">
              <button
                onClick={() => setSelectedFootprint(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
