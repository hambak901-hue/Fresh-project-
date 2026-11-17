import React, { useState, useEffect } from 'react';
import {
  Layers,
  Edit,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Send,
  LayoutDashboard,
  Sliders,
  Megaphone,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { api } from '../../lib/api';
import { DASHBOARD_CATALOG_FALLBACK, getDashboardLabel } from '../../lib/roles';
import {
  DashboardCatalogItem,
  DashboardKey,
  DashboardModuleConfig,
  RoleDashboardConfig,
  RoleDashboardConfigRecord,
  RoleDashboardModuleItem,
} from '../../types';
import { useAuth } from '../../context/AuthContext';

interface DashboardModuleManagementProps {
  onLaunchPreview?: (dashboardKey: string, mode?: 'published' | 'draft') => void;
}

type EditorTab = 'modules' | 'header_banner' | 'sections_features';

function formatFlagLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function DashboardModuleManagement({ onLaunchPreview }: DashboardModuleManagementProps) {
  const { refreshDashboardConfig } = useAuth();
  const [dashboards, setDashboards] = useState<DashboardCatalogItem[]>(DASHBOARD_CATALOG_FALLBACK);
  const [records, setRecords] = useState<Record<string, RoleDashboardConfigRecord>>({});
  const [selectedKey, setSelectedKey] = useState<DashboardKey>('student');
  const [editorConfig, setEditorConfig] = useState<RoleDashboardConfig | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('modules');
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Legacy global module toggles (collapsible backward compatibility)
  const [showLegacyModules, setShowLegacyModules] = useState(false);
  const [legacyModules, setLegacyModules] = useState<DashboardModuleConfig[]>([]);
  const [editingLegacyModule, setEditingLegacyModule] = useState<DashboardModuleConfig | null>(null);
  const [legacySaveLoading, setLegacySaveLoading] = useState(false);

  const loadAll = async (preserveKey?: DashboardKey) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [cfgRes, legacyRes] = await Promise.all([
        api.getAdminDashboardConfigs(),
        api.getDashboardModules().catch(() => ({ success: false, modules: [] })),
      ]);

      if (cfgRes?.success) {
        const list = Array.isArray(cfgRes.dashboards) && cfgRes.dashboards.length > 0
          ? cfgRes.dashboards
          : DASHBOARD_CATALOG_FALLBACK;
        setDashboards(list);
        const cfgMap = cfgRes.configs || {};
        setRecords(cfgMap);
        const keyToSelect = preserveKey || selectedKey;
        const rec = cfgMap[keyToSelect];
        if (rec) {
          const initial = rec.draft_config || rec.published_config;
          setEditorConfig(JSON.parse(JSON.stringify(initial)));
        }
      }

      if (legacyRes?.success && Array.isArray(legacyRes.modules)) {
        setLegacyModules(legacyRes.modules);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load dashboard configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll('student');
  }, []);

  const handleSelectDashboard = (key: DashboardKey) => {
    setSelectedKey(key);
    setSuccessMsg(null);
    setErrorMsg(null);
    const rec = records[key];
    if (rec) {
      const source = rec.draft_config || rec.published_config;
      setEditorConfig(JSON.parse(JSON.stringify(source)));
    }
  };

  const handleLoadPublishedSnapshot = () => {
    const rec = records[selectedKey];
    if (!rec?.published_config) return;
    setEditorConfig(JSON.parse(JSON.stringify(rec.published_config)));
    setSuccessMsg(`Loaded live published snapshot for ${getDashboardLabel(selectedKey)}.`);
  };

  const handleSaveDraft = async () => {
    if (!editorConfig) return;
    setSavingDraft(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.saveAdminDashboardDraft(selectedKey, editorConfig);
      if (res.success && res.record) {
        setRecords(prev => ({ ...prev, [selectedKey]: res.record }));
        const nextCfg = res.record.draft_config || res.record.published_config;
        setEditorConfig(JSON.parse(JSON.stringify(nextCfg)));
        setSuccessMsg(res.message || `Draft saved for ${getDashboardLabel(selectedKey)}.`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save draft configuration.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    if (!editorConfig) return;
    setPublishing(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.publishAdminDashboardConfig(selectedKey, editorConfig);
      if (res.success && res.record) {
        setRecords(prev => ({ ...prev, [selectedKey]: res.record }));
        setEditorConfig(JSON.parse(JSON.stringify(res.record.published_config)));
        setSuccessMsg(res.message || `${getDashboardLabel(selectedKey)} configuration published live.`);
        await refreshDashboardConfig();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to publish configuration.');
    } finally {
      setPublishing(false);
    }
  };

  const handlePreview = async (mode: 'draft' | 'published') => {
    if (!onLaunchPreview || !editorConfig) return;
    setErrorMsg(null);
    if (mode === 'draft') {
      // Save draft first so preview reflects latest unsaved edits
      setSavingDraft(true);
      try {
        const res = await api.saveAdminDashboardDraft(selectedKey, editorConfig);
        if (res.success && res.record) {
          setRecords(prev => ({ ...prev, [selectedKey]: res.record }));
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Failed to save draft before preview.');
        setSavingDraft(false);
        return;
      } finally {
        setSavingDraft(false);
      }
    }
    onLaunchPreview(selectedKey, mode);
  };

  const updateModuleAt = (idx: number, patch: Partial<RoleDashboardModuleItem>) => {
    if (!editorConfig) return;
    const nextMods = editorConfig.modules.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    setEditorConfig({ ...editorConfig, modules: nextMods });
  };

  const moveModule = (idx: number, dir: -1 | 1) => {
    if (!editorConfig) return;
    const target = idx + dir;
    if (target < 0 || target >= editorConfig.modules.length) return;
    const arr = [...editorConfig.modules];
    const tmp = arr[idx];
    arr[idx] = arr[target];
    arr[target] = tmp;
    const reordered = arr.map((m, index) => ({ ...m, order: index + 1 }));
    setEditorConfig({ ...editorConfig, modules: reordered });
  };

  const currentRecord = records[selectedKey];

  // Legacy quick helpers
  const handleQuickToggleLegacyVisibility = async (mod: DashboardModuleConfig) => {
    const nextVis = !mod.visible;
    try {
      await api.updateDashboardModule(mod.id, { visible: nextVis });
      setLegacyModules(prev => prev.map(m => (m.id === mod.id ? { ...m, visible: nextVis } : m)));
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to toggle visibility');
    }
  };

  const handleSaveLegacyModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLegacyModule) return;
    setLegacySaveLoading(true);
    try {
      const res = await api.updateDashboardModule(editingLegacyModule.id, editingLegacyModule);
      setSuccessMsg(res.message);
      setEditingLegacyModule(null);
      const legacyRes = await api.getDashboardModules();
      if (legacyRes?.success) setLegacyModules(legacyRes.modules || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update legacy module.');
    } finally {
      setLegacySaveLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>Centralized Role Dashboard Orchestrator</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Central Dashboard Management &amp; Preview Hub
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Configure sidebar modules, ordering, Coming Soon lifecycle states, announcement banners, and role features across all 7 platform workspaces with Draft, Live Preview, and Publish controls.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadAll(selectedKey)}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start lg:self-auto whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload Configs</span>
          </button>
        </div>

        {/* Workspace Picker Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-6 pt-5 border-t border-slate-800">
          {dashboards.map(dash => {
            const rec = records[dash.key];
            const isSelected = selectedKey === dash.key;
            return (
              <button
                key={dash.key}
                type="button"
                onClick={() => handleSelectDashboard(dash.key)}
                className={`p-3 rounded-xl border text-left transition ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400">
                    {dash.category}
                  </span>
                  {rec?.has_draft && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                      DRAFT
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold mt-1 truncate">{dash.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Selected Workspace Action Toolbar */}
      {editorConfig && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white">{getDashboardLabel(selectedKey)}</h2>
                <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                  currentRecord?.has_draft
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {currentRecord?.has_draft ? 'Has Unpublished Draft' : 'Live Synced'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                  key: {selectedKey}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {currentRecord?.published_at
                  ? `Last published ${new Date(currentRecord.published_at).toLocaleString()}`
                  : 'Default workspace configuration active'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {currentRecord?.has_draft && (
                <button
                  type="button"
                  onClick={handleLoadPublishedSnapshot}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold whitespace-nowrap transition"
                >
                  Revert to Live
                </button>
              )}

              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap transition disabled:opacity-50"
              >
                {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-indigo-400" />}
                <span>Save Draft</span>
              </button>

              {onLaunchPreview && (
                <>
                  <button
                    type="button"
                    disabled={savingDraft}
                    onClick={() => handlePreview('draft')}
                    className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 font-semibold flex items-center gap-1.5 whitespace-nowrap transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Draft</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePreview('published')}
                    className="px-3.5 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-200 font-semibold flex items-center gap-1.5 whitespace-nowrap transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Live</span>
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={publishing}
                onClick={handlePublish}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 whitespace-nowrap shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
              >
                {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Publish Live Changes</span>
              </button>
            </div>
          </div>

          {/* Editor Sub-tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setEditorTab('modules')}
              className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition ${
                editorTab === 'modules'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Modules &amp; Navigation ({editorConfig.modules.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab('header_banner')}
              className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition ${
                editorTab === 'header_banner'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>Header &amp; Announcement Banner</span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab('sections_features')}
              className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition ${
                editorTab === 'sections_features'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Sections &amp; Role Features</span>
            </button>
          </div>

          {/* TAB 1: MODULES & NAVIGATION */}
          {editorTab === 'modules' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                    <th className="py-3 px-3">Order</th>
                    <th className="py-3 px-3">Module Label &amp; Description</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-center">Visible</th>
                    <th className="py-3 px-3">Coming Soon Notice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {editorConfig.modules.map((mod, idx) => (
                    <tr key={mod.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-slate-400 w-5">{idx + 1}.</span>
                          <button
                            type="button"
                            onClick={() => moveModule(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveModule(idx, 1)}
                            disabled={idx === editorConfig.modules.length - 1}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 min-w-[230px]">
                        <input
                          type="text"
                          value={mod.label}
                          onChange={e => updateModuleAt(idx, { label: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-semibold mb-1"
                        />
                        <input
                          type="text"
                          value={mod.description || ''}
                          onChange={e => updateModuleAt(idx, { description: e.target.value })}
                          placeholder="Module description"
                          className="w-full bg-slate-950 border border-slate-800/70 rounded-lg px-2.5 py-1 text-[11px] text-slate-400"
                        />
                        <span className="text-[10px] font-mono text-slate-500">id: {mod.id}</span>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={mod.status}
                          onChange={e =>
                            updateModuleAt(idx, { status: e.target.value as 'active' | 'coming_soon' | 'disabled' })
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                            mod.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : mod.status === 'coming_soon'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          <option value="active">Active</option>
                          <option value="coming_soon">Coming Soon</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => updateModuleAt(idx, { visible: !mod.visible })}
                          className={`px-2.5 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap ${
                            mod.visible
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-800 text-slate-500 border border-slate-700'
                          }`}
                        >
                          {mod.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          <span>{mod.visible ? 'Visible' : 'Hidden'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 min-w-[200px]">
                        <input
                          type="text"
                          value={mod.coming_soon_message || ''}
                          onChange={e => updateModuleAt(idx, { coming_soon_message: e.target.value })}
                          placeholder="Optional Coming Soon notice"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: HEADER & ANNOUNCEMENT BANNER */}
          {editorTab === 'header_banner' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="font-bold text-white text-sm">Workspace Branding &amp; Landing Tab</h3>
                <div className="space-y-1">
                  <label className="text-slate-400">Workspace Title</label>
                  <input
                    type="text"
                    value={editorConfig.title}
                    onChange={e => setEditorConfig({ ...editorConfig, title: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400">Workspace Subtitle</label>
                  <textarea
                    rows={2}
                    value={editorConfig.subtitle}
                    onChange={e => setEditorConfig({ ...editorConfig, subtitle: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400">Badge Label</label>
                    <input
                      type="text"
                      value={editorConfig.badge_text}
                      onChange={e => setEditorConfig({ ...editorConfig, badge_text: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400">Default Landing Tab</label>
                    <select
                      value={editorConfig.default_tab}
                      onChange={e => setEditorConfig({ ...editorConfig, default_tab: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      {editorConfig.modules.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm">Workspace Announcement Banner</h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editorConfig.announcement_banner?.enabled)}
                      onChange={e =>
                        setEditorConfig({
                          ...editorConfig,
                          announcement_banner: {
                            ...editorConfig.announcement_banner,
                            enabled: e.target.checked,
                          },
                        })
                      }
                      className="accent-indigo-600 rounded"
                    />
                    <span className="text-slate-200 font-semibold">Show Banner</span>
                  </label>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400">Banner Title</label>
                  <input
                    type="text"
                    value={editorConfig.announcement_banner?.title || ''}
                    onChange={e =>
                      setEditorConfig({
                        ...editorConfig,
                        announcement_banner: {
                          ...editorConfig.announcement_banner,
                          title: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400">Banner Message</label>
                  <textarea
                    rows={2}
                    value={editorConfig.announcement_banner?.message || ''}
                    onChange={e =>
                      setEditorConfig({
                        ...editorConfig,
                        announcement_banner: {
                          ...editorConfig.announcement_banner,
                          message: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400">Tone</label>
                  <select
                    value={editorConfig.announcement_banner?.tone || 'info'}
                    onChange={e =>
                      setEditorConfig({
                        ...editorConfig,
                        announcement_banner: {
                          ...editorConfig.announcement_banner,
                          tone: e.target.value as 'info' | 'emerald' | 'amber',
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="info">Blue / Info</option>
                    <option value="emerald">Emerald / Active Notice</option>
                    <option value="amber">Amber / Advisory</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SECTIONS & ROLE FEATURES */}
          {editorTab === 'sections_features' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="font-bold text-white text-sm">Overview Sections Visibility</h3>
                <div className="space-y-2">
                  {Object.entries(editorConfig.sections || {}).map(([sKey, enabled]) => (
                    <label
                      key={sKey}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700"
                    >
                      <span className="text-slate-200 font-medium">{formatFlagLabel(sKey)}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(enabled)}
                        onChange={e =>
                          setEditorConfig({
                            ...editorConfig,
                            sections: {
                              ...editorConfig.sections,
                              [sKey]: e.target.checked,
                            },
                          })
                        }
                        className="accent-indigo-600 rounded"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="font-bold text-white text-sm">Role Capabilities &amp; Feature Flags</h3>
                <div className="space-y-2">
                  {Object.entries(editorConfig.features || {}).map(([fKey, enabled]) => (
                    <label
                      key={fKey}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700"
                    >
                      <span className="text-slate-200 font-medium">{formatFlagLabel(fKey)}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(enabled)}
                        onChange={e =>
                          setEditorConfig({
                            ...editorConfig,
                            features: {
                              ...editorConfig.features,
                              [fKey]: e.target.checked,
                            },
                          })
                        }
                        className="accent-emerald-600 rounded"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Legacy Global Modules Section (Backward Compatibility) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setShowLegacyModules(!showLegacyModules)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div>
            <span className="font-bold text-white text-sm">Legacy Global Customer Module Registry</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Direct compatibility view for global module switches ({legacyModules.length} records)
            </p>
          </div>
          {showLegacyModules ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showLegacyModules && (
          <div className="border-t border-slate-800 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3 px-4">Module</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Visible</th>
                  <th className="py-3 px-4 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {legacyModules.map(mod => (
                  <tr key={mod.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4">
                      <p className="font-bold text-white">{mod.name}</p>
                      <p className="text-slate-400 text-[11px]">{mod.description}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">{mod.status}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleQuickToggleLegacyVisibility(mod)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      >
                        {mod.visible ? 'Visible' : 'Hidden'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingLegacyModule({ ...mod })}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 inline-flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legacy Edit Modal */}
      {editingLegacyModule && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveLegacyModule} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Configure Legacy Module: {editingLegacyModule.name}</h3>
              <button type="button" onClick={() => setEditingLegacyModule(null)} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Display Label</label>
              <input
                type="text"
                required
                value={editingLegacyModule.name}
                onChange={e => setEditingLegacyModule({ ...editingLegacyModule, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Status</label>
              <select
                value={editingLegacyModule.status}
                onChange={e => setEditingLegacyModule({ ...editingLegacyModule, status: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
              >
                <option value="active">Active</option>
                <option value="coming_soon">Coming Soon</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingLegacyModule(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl">Cancel</button>
              <button type="submit" disabled={legacySaveLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold">
                {legacySaveLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
