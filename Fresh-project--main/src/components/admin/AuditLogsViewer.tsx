import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Shield,
  User,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Activity,
  Layers,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AuditLogItem } from '../../types';

export function AuditLogsViewer() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminAuditLogs({
        action: actionFilter,
        search,
      });
      setLogs(res.logs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, search]);

  const getActionBadgeColor = (action: string) => {
    if (action.includes('PRICE') || action.includes('WALLET')) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (action.includes('SUSPEND') || action.includes('REJECT') || action.includes('DELETE')) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (action.includes('APPROVE') || action.includes('CREATED') || action.includes('RESTORE')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <FileText className="w-3.5 h-3.5" />
              <span>Immutable System Audit Trail</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Administrative Audit Logs
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Chronological ledger tracking sensitive administrative adjustments, manual funding verifications, tariff changes, and staff operations.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Journal</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit trail by actor email, action key, or details..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Action Types</option>
            <option value="PRICE_CHANGE">Price Changes</option>
            <option value="WALLET_ADJUSTMENT">Wallet Adjustments</option>
            <option value="ACCOUNT_STATUS_CHANGED">Account Status (Suspensions)</option>
            <option value="KYC_REVIEW">KYC Compliance Reviews</option>
            <option value="MANUAL_FUNDING_APPROVED">Manual Funding Approvals</option>
            <option value="MANUAL_FUNDING_REJECTED">Manual Funding Rejections</option>
            <option value="PROVIDER_SWITCH">Provider Switches</option>
            <option value="STAFF_CREATED">Staff Account Created</option>
            <option value="DASHBOARD_MODULE_UPDATED">Module Config Changes</option>
          </select>
        </div>
      </div>

      {/* Audit Log Entries List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden text-xs">
        {logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Activity className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="font-semibold text-slate-300">No audit log records match filter</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 font-sans">
            {logs.map(log => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div
                  key={log.id}
                  className="p-4 hover:bg-slate-800/30 transition cursor-pointer"
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                      <p className="text-white font-medium text-xs">
                        Actor: <span className="font-mono text-indigo-300">{log.user_email || 'System Internal'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-500 text-[11px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-NG', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded JSON details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Operation Details Payload</p>
                      <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
