import React, { useState, useEffect } from 'react';
import {
  Layers,
  Edit,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Loader2,
  Clock,
  Check,
  Shield,
  Smartphone,
  Wallet,
  ShoppingBag,
  Zap,
  GraduationCap,
  BarChart3,
  Receipt,
  Package,
  HelpCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { DashboardModuleConfig } from '../../types';

export function DashboardModuleManagement() {
  const [modules, setModules] = useState<DashboardModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingModule, setEditingModule] = useState<DashboardModuleConfig | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchModules = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboardModules();
      setModules(res.modules || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const handleSaveModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule) return;
    setSaveLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.updateDashboardModule(editingModule.id, editingModule);
      setSuccessMsg(res.message);
      setEditingModule(null);
      await fetchModules();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update module');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleQuickToggleVisibility = async (mod: DashboardModuleConfig) => {
    const nextVis = !mod.visible;
    setErrorMsg(null);
    try {
      await api.updateDashboardModule(mod.id, { visible: nextVis });
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, visible: nextVis } : m));
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to toggle visibility');
    }
  };

  const handleQuickStatusChange = async (mod: DashboardModuleConfig, status: 'active' | 'coming_soon' | 'disabled') => {
    setErrorMsg(null);
    try {
      await api.updateDashboardModule(mod.id, { status });
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, status } : m));
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>Customer Portal Orchestrator</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Customer Dashboard Management
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Configure which modules appear on customer navigation, switch services between Active and Coming Soon, and customize module labels and descriptions.
            </p>
          </div>
          <button
            onClick={fetchModules}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Modules</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Edit Module Modal */}
      {editingModule && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveModule} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Configure Module: {editingModule.name}</h3>
              <button
                type="button"
                onClick={() => setEditingModule(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Display Label</label>
              <input
                type="text"
                required
                value={editingModule.name}
                onChange={e => setEditingModule({ ...editingModule, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Description</label>
              <textarea
                rows={2}
                value={editingModule.description}
                onChange={e => setEditingModule({ ...editingModule, description: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400">Module Status</label>
                <select
                  value={editingModule.status}
                  onChange={e => setEditingModule({ ...editingModule, status: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="active">Active (Fully Operational)</option>
                  <option value="coming_soon">Coming Soon (Staged)</option>
                  <option value="disabled">Disabled (Hidden from menu)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400">Sidebar Visibility</label>
                <select
                  value={editingModule.visible ? 'true' : 'false'}
                  onChange={e => setEditingModule({ ...editingModule, visible: e.target.value === 'true' })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="true">Visible on Sidebar</option>
                  <option value="false">Hidden from Sidebar</option>
                </select>
              </div>
            </div>

            {editingModule.status === 'coming_soon' && (
              <div className="space-y-1">
                <label className="text-slate-400">Custom Coming Soon Message</label>
                <input
                  type="text"
                  value={editingModule.coming_soon_message || ''}
                  onChange={e => setEditingModule({ ...editingModule, coming_soon_message: e.target.value })}
                  placeholder="e.g. Rolling out in next release..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saveLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-2"
              >
                {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Module Changes</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingModule(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modules Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                <th className="py-3.5 px-4">Module Name &amp; Description</th>
                <th className="py-3.5 px-4">Key ID</th>
                <th className="py-3.5 px-4 text-center">Lifecycle Status</th>
                <th className="py-3.5 px-4 text-center">Sidebar Nav</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {modules.map(mod => (
                <tr key={mod.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4">
                    <p className="font-bold text-white text-sm">{mod.name}</p>
                    <p className="text-slate-400 text-[11px] mt-0.5 line-clamp-1">{mod.description}</p>
                    {mod.coming_soon_message && (
                      <p className="text-[10px] text-amber-400/80 font-mono mt-0.5">&bull; {mod.coming_soon_message}</p>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                    {mod.id}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <select
                      value={mod.status}
                      onChange={e => handleQuickStatusChange(mod, e.target.value as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize font-mono border ${
                        mod.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : mod.status === 'coming_soon'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      <option value="active">Active</option>
                      <option value="coming_soon">Coming Soon</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleQuickToggleVisibility(mod)}
                      className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 mx-auto transition ${
                        mod.visible
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {mod.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{mod.visible ? 'Visible' : 'Hidden'}</span>
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingModule({ ...mod })}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold inline-flex items-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Configure</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
