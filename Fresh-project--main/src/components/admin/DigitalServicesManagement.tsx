import React, { useState, useEffect } from 'react';
import { 
  Tv, Zap, Plus, Trash2, Edit3, CheckCircle2, AlertCircle, RefreshCw, 
  Search, ShieldCheck, DollarSign, Layers, Check, X
} from 'lucide-react';
import { api } from '../../lib/api';
import { CablePackageItem, ElectricityDiscoItem } from '../../types';

export const DigitalServicesManagement: React.FC = () => {
  const [cablePackages, setCablePackages] = useState<CablePackageItem[]>([]);
  const [electricityDiscos, setElectricityDiscos] = useState<ElectricityDiscoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchCable, setSearchCable] = useState('');
  const [searchDisco, setSearchDisco] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal states for Cable
  const [isCableModalOpen, setIsCableModalOpen] = useState(false);
  const [editingCable, setEditingCable] = useState<CablePackageItem | null>(null);
  const [cableForm, setCableForm] = useState({
    provider: 'DSTV',
    name: '',
    code: '',
    price: 0,
    cost_price: 0,
    channels: 50,
    enabled: true
  });

  // Modal states for Disco
  const [isDiscoModalOpen, setIsDiscoModalOpen] = useState(false);
  const [editingDisco, setEditingDisco] = useState<ElectricityDiscoItem | null>(null);
  const [discoForm, setDiscoForm] = useState({
    name: '',
    code: '',
    state: '',
    min_amount: 500,
    enabled: true
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getDigitalServicesAdmin();
      if (res.success) {
        setCablePackages(res.cable_packages || []);
        setElectricityDiscos(res.electricity_discos || []);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load digital services' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddCable = () => {
    setEditingCable(null);
    setCableForm({
      provider: 'DSTV',
      name: '',
      code: '',
      price: 4500,
      cost_price: 4300,
      channels: 60,
      enabled: true
    });
    setIsCableModalOpen(true);
  };

  const handleOpenEditCable = (pkg: CablePackageItem) => {
    setEditingCable(pkg);
    setCableForm({
      provider: pkg.provider,
      name: pkg.name,
      code: pkg.code,
      price: pkg.price,
      cost_price: pkg.cost_price || pkg.wholesale_cost || Math.round(pkg.price * 0.95),
      channels: pkg.channels,
      enabled: pkg.enabled
    });
    setIsCableModalOpen(true);
  };

  const handleSaveCable = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      if (editingCable) {
        const res = await api.updateCablePackage(editingCable.id, cableForm);
        if (res.success) {
          setFeedback({ type: 'success', message: `Updated bouquet: ${cableForm.name}` });
          setIsCableModalOpen(false);
          loadData();
        }
      } else {
        const res = await api.createCablePackage(cableForm);
        if (res.success) {
          setFeedback({ type: 'success', message: `Bouquet created: ${cableForm.name}` });
          setIsCableModalOpen(false);
          loadData();
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save bouquet' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCable = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await api.deleteCablePackage(id);
      if (res.success) {
        setFeedback({ type: 'success', message: `Package "${name}" deleted` });
        loadData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete package' });
    }
  };

  const handleToggleCable = async (pkg: CablePackageItem) => {
    try {
      const res = await api.updateCablePackage(pkg.id, { enabled: !pkg.enabled });
      if (res.success) {
        setCablePackages(prev => prev.map(p => p.id === pkg.id ? { ...p, enabled: !p.enabled } : p));
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Toggle failed' });
    }
  };

  // Disco Handlers
  const handleOpenAddDisco = () => {
    setEditingDisco(null);
    setDiscoForm({
      name: '',
      code: '',
      state: 'Lagos',
      min_amount: 500,
      enabled: true
    });
    setIsDiscoModalOpen(true);
  };

  const handleOpenEditDisco = (disco: ElectricityDiscoItem) => {
    setEditingDisco(disco);
    setDiscoForm({
      name: disco.name,
      code: disco.code,
      state: disco.state || 'National',
      min_amount: disco.min_amount || disco.min || disco.minimum_amount || 500,
      enabled: disco.enabled
    });
    setIsDiscoModalOpen(true);
  };

  const handleSaveDisco = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      if (editingDisco) {
        const res = await api.updateElectricityDisco(editingDisco.id, discoForm);
        if (res.success) {
          setFeedback({ type: 'success', message: `Updated Disco: ${discoForm.name}` });
          setIsDiscoModalOpen(false);
          loadData();
        }
      } else {
        const res = await api.createElectricityDisco(discoForm);
        if (res.success) {
          setFeedback({ type: 'success', message: `Disco created: ${discoForm.name}` });
          setIsDiscoModalOpen(false);
          loadData();
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save Disco' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDisco = async (id: string, name: string) => {
    if (!window.confirm(`Delete Disco "${name}"?`)) return;
    try {
      const res = await api.deleteElectricityDisco(id);
      if (res.success) {
        setFeedback({ type: 'success', message: `Disco "${name}" deleted` });
        loadData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete Disco' });
    }
  };

  const handleToggleDisco = async (disco: ElectricityDiscoItem) => {
    try {
      const res = await api.updateElectricityDisco(disco.id, { enabled: !disco.enabled });
      if (res.success) {
        setElectricityDiscos(prev => prev.map(d => d.id === disco.id ? { ...d, enabled: !d.enabled } : d));
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Toggle failed' });
    }
  };

  const filteredCables = cablePackages.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchCable.toLowerCase()) || 
                          p.code.toLowerCase().includes(searchCable.toLowerCase()) ||
                          p.provider.toLowerCase().includes(searchCable.toLowerCase());
    const matchesProvider = selectedProvider === 'all' || p.provider.toUpperCase() === selectedProvider.toUpperCase();
    return matchesSearch && matchesProvider;
  });

  const filteredDiscos = electricityDiscos.filter(d => 
    d.name.toLowerCase().includes(searchDisco.toLowerCase()) ||
    d.code.toLowerCase().includes(searchDisco.toLowerCase()) ||
    (d.state && d.state.toLowerCase().includes(searchDisco.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5" />
            Phase 8 • Digital Services Catalogue
          </div>
          <h2 className="text-2xl font-bold text-white">Digital Services Management</h2>
          <p className="text-slate-400 text-sm mt-1">
            Configure internal utility catalog, Cable TV bouquets (DSTV, GOTV, StarTimes, Showmax), and Electricity Discos with live profit margin monitoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh Catalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl flex items-center justify-between border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: CABLE TV BOUQUETS */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Cable TV Bouquets</h3>
              <p className="text-xs text-slate-400">{cablePackages.length} active bouquets across DSTV, GOTV, StarTimes, & Showmax</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search package..."
                value={searchCable}
                onChange={(e) => setSearchCable(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Providers</option>
              <option value="DSTV">DSTV</option>
              <option value="GOTV">GOTV</option>
              <option value="STARTIMES">StarTimes</option>
              <option value="SHOWMAX">Showmax</option>
            </select>

            <button
              onClick={handleOpenAddCable}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Bouquet
            </button>
          </div>
        </div>

        {/* Cable Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="pb-3 pl-2">Provider</th>
                <th className="pb-3">Bouquet Name</th>
                <th className="pb-3">Code</th>
                <th className="pb-3">Channels</th>
                <th className="pb-3 text-right">Cost Price</th>
                <th className="pb-3 text-right">Customer Price</th>
                <th className="pb-3 text-right">Margin</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredCables.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No cable bouquets match your search.
                  </td>
                </tr>
              ) : (
                filteredCables.map((pkg) => {
                  const cost = pkg.cost_price || pkg.wholesale_cost || Math.round(pkg.price * 0.95);
                  const margin = pkg.price - cost;
                  const marginPercent = Math.round((margin / pkg.price) * 100);

                  return (
                    <tr key={pkg.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pl-2">
                        <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                          pkg.provider.toUpperCase() === 'DSTV' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                          pkg.provider.toUpperCase() === 'GOTV' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          pkg.provider.toUpperCase() === 'STARTIMES' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}>
                          {pkg.provider.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 font-semibold text-white">{pkg.name}</td>
                      <td className="py-3 font-mono text-slate-400">{pkg.code}</td>
                      <td className="py-3">{pkg.channels} ch</td>
                      <td className="py-3 text-right font-mono text-slate-400">₦{cost.toLocaleString()}</td>
                      <td className="py-3 text-right font-mono font-semibold text-white">₦{pkg.price.toLocaleString()}</td>
                      <td className="py-3 text-right font-mono">
                        <span className={`px-1.5 py-0.5 rounded ${margin > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          +₦{margin.toLocaleString()} ({marginPercent}%)
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => handleToggleCable(pkg)}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                            pkg.enabled
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 border border-slate-700'
                          }`}
                        >
                          {pkg.enabled ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditCable(pkg)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Edit Bouquet"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCable(pkg.id, pkg.name)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Delete Bouquet"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: ELECTRICITY DISCOS */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Electricity Distribution Companies (Discos)</h3>
              <p className="text-xs text-slate-400">{electricityDiscos.length} registered distribution companies covering all regions</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search disco or state..."
                value={searchDisco}
                onChange={(e) => setSearchDisco(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              onClick={handleOpenAddDisco}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Disco
            </button>
          </div>
        </div>

        {/* Disco Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDiscos.map((disco) => {
            const min = disco.min_amount || disco.min || disco.minimum_amount || 500;
            return (
              <div
                key={disco.id}
                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {disco.code}
                    </span>
                    <h4 className="font-semibold text-white text-sm mt-1.5">{disco.name}</h4>
                    <p className="text-xs text-slate-400">{disco.state || 'National Coverage'}</p>
                  </div>
                  <button
                    onClick={() => handleToggleDisco(disco)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      disco.enabled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    {disco.enabled ? 'Active' : 'Disabled'}
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px]">Min. Purchase: </span>
                    <span className="font-mono text-white font-semibold">₦{min.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditDisco(disco)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Edit Disco"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDisco(disco.id, disco.name)}
                      className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                      title="Delete Disco"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CABLE BOUQUET MODAL */}
      {isCableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Tv className="w-5 h-5 text-indigo-400" />
                {editingCable ? 'Edit Cable Bouquet' : 'Create Cable Bouquet'}
              </h3>
              <button
                onClick={() => setIsCableModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCable} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Provider</label>
                <select
                  value={cableForm.provider}
                  onChange={(e) => setCableForm({ ...cableForm, provider: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="DSTV">DSTV</option>
                  <option value="GOTV">GOTV</option>
                  <option value="STARTIMES">StarTimes</option>
                  <option value="SHOWMAX">Showmax</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Bouquet Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DSTV Compact Plus"
                  value={cableForm.name}
                  onChange={(e) => setCableForm({ ...cableForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Package Code</label>
                  <input
                    type="text"
                    required
                    placeholder="dstv-compact"
                    value={cableForm.code}
                    onChange={(e) => setCableForm({ ...cableForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Channel Count</label>
                  <input
                    type="number"
                    min="1"
                    value={cableForm.channels}
                    onChange={(e) => setCableForm({ ...cableForm, channels: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Wholesale Cost (₦)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={cableForm.cost_price}
                    onChange={(e) => setCableForm({ ...cableForm, cost_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Customer Retail (₦)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={cableForm.price}
                    onChange={(e) => setCableForm({ ...cableForm, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 font-medium">Calculated Profit Margin:</span>
                  <p className="text-[11px] text-slate-500">Retail price minus wholesale gateway cost</p>
                </div>
                <span className={`font-mono font-bold text-sm ${cableForm.price - cableForm.cost_price >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  +₦{(cableForm.price - cableForm.cost_price).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="cableEnabled"
                  checked={cableForm.enabled}
                  onChange={(e) => setCableForm({ ...cableForm, enabled: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="cableEnabled" className="text-slate-300">Enable this bouquet for customer subscriptions</label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCableModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors shadow-lg shadow-indigo-600/20"
                >
                  {saving ? 'Saving...' : editingCable ? 'Update Bouquet' : 'Create Bouquet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISCO MODAL */}
      {isDiscoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                {editingDisco ? 'Edit Disco' : 'Register New Disco'}
              </h3>
              <button
                onClick={() => setIsDiscoModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDisco} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ikeja Electric (IKEDC)"
                  value={discoForm.name}
                  onChange={(e) => setDiscoForm({ ...discoForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Disco Code</label>
                  <input
                    type="text"
                    required
                    placeholder="ikeja-electric"
                    value={discoForm.code}
                    onChange={(e) => setDiscoForm({ ...discoForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">State / Region</label>
                  <input
                    type="text"
                    placeholder="e.g. Lagos State"
                    value={discoForm.state}
                    onChange={(e) => setDiscoForm({ ...discoForm, state: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Minimum Purchase (₦)</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={discoForm.min_amount}
                  onChange={(e) => setDiscoForm({ ...discoForm, min_amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="discoEnabled"
                  checked={discoForm.enabled}
                  onChange={(e) => setDiscoForm({ ...discoForm, enabled: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-800 text-amber-600 focus:ring-0"
                />
                <label htmlFor="discoEnabled" className="text-slate-300">Enable this Disco for meter tokens & bill payments</label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDiscoModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors shadow-lg shadow-amber-600/20"
                >
                  {saving ? 'Saving...' : editingDisco ? 'Update Disco' : 'Register Disco'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
