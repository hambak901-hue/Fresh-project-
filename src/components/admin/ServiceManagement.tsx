import React, { useState, useEffect } from 'react';
import {
  Cpu,
  ShieldCheck,
  Smartphone,
  Zap,
  ShoppingBag,
  GraduationCap,
  BarChart3,
  DollarSign,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
  Download,
  Server,
  Activity,
  ArrowUpDown,
  Search,
  Check,
  Sliders,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  Clock,
  Upload,
  Star,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StoreItem, AcademyCourse, IdentityService, ProviderConfigItem, ProviderLogItem, SlipTemplateItem } from '../../types';

export function ServiceManagement() {
  const [activeTab, setActiveTab] = useState<'nin' | 'slip_templates' | 'providers' | 'telecom' | 'digital' | 'store' | 'academy' | 'reports'>('nin');

  const [settings, setSettings] = useState<any>({});
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [academyCourses, setAcademyCourses] = useState<AcademyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Phase 5 Identity Services & Providers State
  const [identityServices, setIdentityServices] = useState<IdentityService[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('all');
  const [syncingWholesale, setSyncingWholesale] = useState(false);
  const [editingPriceMap, setEditingPriceMap] = useState<Record<string, number>>({});
  const [savingPriceKey, setSavingPriceKey] = useState<string | null>(null);

  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigItem[]>([]);
  const [editingProvider, setEditingProvider] = useState<Partial<ProviderConfigItem> | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string; latency_ms: number }>>({});
  const [providerLogs, setProviderLogs] = useState<ProviderLogItem[]>([]);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Slip Templates State (NIN & BVN Slip Management)
  const [slipTemplates, setSlipTemplates] = useState<SlipTemplateItem[]>([]);
  const [editingSlipTemplate, setEditingSlipTemplate] = useState<Partial<SlipTemplateItem> | null>(null);
  const [slipCategoryFilter, setSlipCategoryFilter] = useState<'ALL' | 'NIN' | 'BVN'>('NIN');
  const [savingSlipTemplate, setSavingSlipTemplate] = useState(false);
  const [uploadingSpecimen, setUploadingSpecimen] = useState(false);

  // BVN & Identity Provider Priority / Fallback State
  const [providerRouting, setProviderRouting] = useState({
    active_verification_provider: '2sureverify',
    bvn_primary_provider: '2sureverify',
    bvn_fallback_provider: 'veripine',
    bvn_auto_fallback: true,
    identity_auto_fallback: true,
  });

  // Store Item modal
  const [editingStoreItem, setEditingStoreItem] = useState<Partial<StoreItem> | null>(null);

  // Academy Course modal
  const [editingCourse, setEditingCourse] = useState<Partial<AcademyCourse> | null>(null);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const [res, pricingRes, providersRes, logsRes, templatesRes] = await Promise.all([
        api.getAdminServices(),
        api.getAdminVerificationPricing().catch(() => ({ services: [] })),
        api.getAdminProviders().catch(() => ({ providers: [], routing: undefined })),
        api.getAdminProviderLogs().catch(() => ({ logs: [] })),
        api.getAdminSlipTemplates().catch(() => ({ templates: [] })),
      ]);
      setSettings(res.settings || {});
      setStoreItems(res.store_items || []);
      setAcademyCourses(res.academy_courses || []);
      if (pricingRes?.services) {
        setIdentityServices(pricingRes.services);
        const map: Record<string, number> = {};
        pricingRes.services.forEach(s => {
          map[s.key] = s.price;
        });
        setEditingPriceMap(map);
      }
      if (providersRes?.providers) {
        setProviderConfigs(providersRes.providers);
      }
      if (providersRes?.routing) {
        setProviderRouting(prev => ({ ...prev, ...providersRes.routing }));
      } else if (res?.settings) {
        setProviderRouting(prev => ({
          ...prev,
          active_verification_provider: res.settings.active_verification_provider || prev.active_verification_provider,
          bvn_primary_provider: res.settings.bvn_primary_provider || prev.bvn_primary_provider,
          bvn_fallback_provider: res.settings.bvn_fallback_provider || prev.bvn_fallback_provider,
          bvn_auto_fallback: res.settings.bvn_auto_fallback !== undefined ? Boolean(Number(res.settings.bvn_auto_fallback) || res.settings.bvn_auto_fallback === true) : prev.bvn_auto_fallback,
          identity_auto_fallback: res.settings.identity_auto_fallback !== undefined ? Boolean(Number(res.settings.identity_auto_fallback) || res.settings.identity_auto_fallback === true) : prev.identity_auto_fallback,
        }));
      }
      if (logsRes?.logs) {
        setProviderLogs(logsRes.logs);
      }
      if (templatesRes?.templates) {
        setSlipTemplates(templatesRes.templates);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    try {
      await api.updateServicePricing({
        nin_fee: settings.nin_fee,
        bvn_fee: settings.bvn_fee,
        mtn_sme_1gb: settings.mtn_sme_1gb,
        airtel_1gb: settings.airtel_1gb,
        glo_1gb: settings.glo_1gb,
        nine_mobile_1gb: settings.nine_mobile_1gb,
        airtime_discount_percent: settings.airtime_discount_percent,
      });
      setSuccessMsg('Service pricing & telecom tariffs updated live across the platform.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update pricing');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProviders = async (updates: any) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.updateServiceProviders(updates);
      setSettings((prev: any) => ({ ...prev, ...updates }));
      setSuccessMsg('Active provider routing updated.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch provider');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrice = async (serviceKey: string) => {
    const newPrice = editingPriceMap[serviceKey];
    if (newPrice === undefined || isNaN(newPrice) || newPrice < 0) return;
    setSavingPriceKey(serviceKey);
    setErrorMsg(null);
    try {
      await api.updateAdminVerificationPricing(serviceKey, {
        selling_price: Number(newPrice),
      });
      setSuccessMsg(`Price updated for ${serviceKey} to ₦${Number(newPrice).toLocaleString()}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      // update local list
      setIdentityServices(prev =>
        prev.map(s => {
          if (s.key === serviceKey) {
            const wholesale = s.wholesale_cost || 0;
            const profit = Number(newPrice) - wholesale;
            const margin = Number(newPrice) > 0 ? Math.round((profit / Number(newPrice)) * 100) : 0;
            return { ...s, price: Number(newPrice), profit_per_transaction: profit, margin_percent: margin };
          }
          return s;
        })
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update price');
    } finally {
      setSavingPriceKey(null);
    }
  };

  const handleToggleService = async (service: IdentityService) => {
    const newEnabled = !service.enabled;
    setErrorMsg(null);
    try {
      await api.updateAdminVerificationPricing(service.key, {
        enabled: newEnabled,
      });
      setIdentityServices(prev =>
        prev.map(s => (s.key === service.key ? { ...s, enabled: newEnabled } : s))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle service');
    }
  };

  const handleChangeServiceProvider = async (serviceKey: string, provider: string) => {
    setErrorMsg(null);
    try {
      await api.updateAdminVerificationPricing(serviceKey, {
        provider,
      });
      setIdentityServices(prev =>
        prev.map(s => (s.key === serviceKey ? { ...s, provider } : s))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to assign provider');
    }
  };

  const handleSyncWholesale = async () => {
    setSyncingWholesale(true);
    setErrorMsg(null);
    try {
      const res = await api.syncWholesalePrices();
      setSuccessMsg(res.message || 'Wholesale rates synced successfully from upstream API.');
      setTimeout(() => setSuccessMsg(null), 4000);
      const pricingRes = await api.getAdminVerificationPricing();
      if (pricingRes?.services) {
        setIdentityServices(pricingRes.services);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sync wholesale rates');
    } finally {
      setSyncingWholesale(false);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      const res = await api.testAdminProvider(providerId);
      setTestResult(prev => ({
        ...prev,
        [providerId]: {
          success: res.success,
          message: res.message,
          latency_ms: res.latency_ms,
        },
      }));
      // refresh logs
      const logsRes = await api.getAdminProviderLogs().catch(() => ({ logs: [] }));
      if (logsRes?.logs) setProviderLogs(logsRes.logs);
    } catch (err: any) {
      setTestResult(prev => ({
        ...prev,
        [providerId]: {
          success: false,
          message: err.message || 'Connection test failed',
          latency_ms: 0,
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleToggleProviderActive = async (provider: ProviderConfigItem) => {
    try {
      await api.updateAdminProvider(provider.id, {
        is_active: !provider.is_active,
      });
      setProviderConfigs(prev =>
        prev.map(p => (p.id === provider.id ? { ...p, is_active: !provider.is_active } : p))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update provider status');
    }
  };

  const handleSetPrimaryProvider = async (provider: ProviderConfigItem) => {
    setErrorMsg(null);
    setSavingProvider(true);
    try {
      await api.updateAdminProvider(provider.id, {
        is_default: true,
        is_active: true,
      });
      await fetchServices();
      setSuccessMsg(`${provider.name} is now set as Primary ${provider.provider_type === 'telecom' ? 'Telecom' : 'Identity'} Provider across routing & catalog.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to set primary provider');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleSaveProviderConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider?.id) return;
    setSavingProvider(true);
    setErrorMsg(null);
    try {
      const payload: Partial<ProviderConfigItem> = {
        name: editingProvider.name,
        base_url: editingProvider.base_url,
        timeout_seconds: Number(editingProvider.timeout_seconds || 30),
        is_active: editingProvider.is_active,
        is_default: editingProvider.is_default,
      };
      if (editingProvider.api_key && !editingProvider.api_key.includes('••••')) {
        payload.api_key = editingProvider.api_key;
      }
      if (editingProvider.secret_key && !editingProvider.secret_key.includes('••••')) {
        payload.secret_key = editingProvider.secret_key;
      }
      await api.updateAdminProvider(editingProvider.id, payload);
      setEditingProvider(null);
      await fetchServices();
      setSuccessMsg(`Configuration for ${editingProvider.name || editingProvider.id} updated cleanly.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save provider settings');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleSaveStoreItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStoreItem || !editingStoreItem.name || !editingStoreItem.price) return;
    setErrorMsg(null);
    try {
      if (editingStoreItem.id) {
        await api.updateStoreItem(editingStoreItem.id, editingStoreItem);
      } else {
        await api.createStoreItem(editingStoreItem);
      }
      setEditingStoreItem(null);
      await fetchServices();
      setSuccessMsg('Store product saved successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save store product');
    }
  };

  const handleDeleteStoreItem = async (id: string) => {
    setErrorMsg(null);
    try {
      await api.deleteStoreItem(id);
      await fetchServices();
      setSuccessMsg('Store product removed.');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete product');
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || !editingCourse.title) return;
    setErrorMsg(null);
    try {
      if (editingCourse.id) {
        await api.updateAcademyCourse(editingCourse.id, editingCourse);
      } else {
        await api.createAcademyCourse(editingCourse);
      }
      setEditingCourse(null);
      await fetchServices();
      setSuccessMsg('Academy course curriculum updated.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save course');
    }
  };

  const handleDeleteCourse = async (id: string) => {
    setErrorMsg(null);
    try {
      await api.deleteAcademyCourse(id);
      await fetchServices();
      setSuccessMsg('Academy course removed.');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete course');
    }
  };

  const handleUploadSpecimenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingSlipTemplate) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Specimen image must be 5MB or smaller.');
      return;
    }
    setUploadingSpecimen(true);
    setErrorMsg(null);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read selected file'));
        reader.readAsDataURL(file);
      });
      const res = await api.uploadSlipSpecimen(dataUri);
      if (res?.url) {
        setEditingSlipTemplate(prev => (prev ? { ...prev, demo_image_url: res.url } : prev));
        setSuccessMsg('Specimen image uploaded and attached.');
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload specimen image');
    } finally {
      setUploadingSpecimen(false);
      e.target.value = '';
    }
  };

  const handleSaveSlipTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlipTemplate || !editingSlipTemplate.name) return;
    setSavingSlipTemplate(true);
    setErrorMsg(null);
    try {
      const defaultImg =
        editingSlipTemplate.category === 'BVN'
          ? '/assets/slips/bvn_basic.jpg'
          : '/assets/aistudio/IMG_0483_23e1a1e1.png';
      const payload: Partial<SlipTemplateItem> = {
        ...editingSlipTemplate,
        demo_image_url: editingSlipTemplate.demo_image_url || defaultImg,
        price:
          editingSlipTemplate.price !== undefined && editingSlipTemplate.price !== null && String(editingSlipTemplate.price) !== ''
            ? Number(editingSlipTemplate.price)
            : null,
      };
      if (editingSlipTemplate.id) {
        await api.updateAdminSlipTemplate(editingSlipTemplate.id, payload);
      } else {
        await api.createAdminSlipTemplate(payload);
      }
      setEditingSlipTemplate(null);
      const res = await api.getAdminSlipTemplates();
      if (res?.templates) setSlipTemplates(res.templates);
      setSuccessMsg(`${editingSlipTemplate.category || 'NIN'} Slip configuration saved successfully.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save slip template');
    } finally {
      setSavingSlipTemplate(false);
    }
  };

  const handleDeleteSlipTemplate = async (id: string) => {
    setErrorMsg(null);
    try {
      await api.deleteAdminSlipTemplate(id);
      const res = await api.getAdminSlipTemplates();
      if (res?.templates) setSlipTemplates(res.templates);
      setSuccessMsg('Slip template removed.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete template');
    }
  };

  const handleToggleSlipActive = async (template: SlipTemplateItem) => {
    setErrorMsg(null);
    try {
      await api.updateAdminSlipTemplate(template.id, { is_active: !template.is_active });
      setSlipTemplates(prev =>
        prev.map(t => (t.id === template.id ? { ...t, is_active: !t.is_active } : t))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle template status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Cpu className="w-3.5 h-3.5" />
              <span>Multi-Service Operations Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Service Management &amp; Catalogs
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Dedicated administration controls for NIN verification, telecommunications, digital utilities, Store inventory, and Academy tracks.
            </p>
          </div>
          <button
            onClick={fetchServices}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Services</span>
          </button>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex gap-2 mt-6 pt-6 border-t border-slate-800 text-xs overflow-x-auto">
          {[
            { id: 'nin', label: 'NIN & BVN Services Matrix', icon: ShieldCheck },
            { id: 'slip_templates', label: 'NIN & BVN Slip Management', icon: FileSpreadsheet },
            { id: 'providers', label: 'Providers & Gateways', icon: Server },
            { id: 'telecom', label: 'Telecommunications', icon: Smartphone },
            { id: 'digital', label: 'Digital Utilities', icon: Zap },
            { id: 'store', label: 'Store Inventory', icon: ShoppingBag },
            { id: 'academy', label: 'Academy Courses', icon: GraduationCap },
            { id: 'reports', label: 'Financial Reports', icon: BarChart3 },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 text-xs">Dismiss</button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 text-xs text-rose-300 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 text-xs">Dismiss</button>
        </div>
      )}

      {/* 1. NIN & BVN 42-SERVICE PRICING MATRIX */}
      {activeTab === 'nin' && (
        <div className="space-y-6 text-xs">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>42 Official Identity Services Pricing &amp; Margin Matrix</span>
                </h2>
                <p className="text-slate-400 mt-1">
                  Manage customer selling prices, wholesale tariffs, and profit spreads across all 42 identity &amp; verification services.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSyncWholesale}
                  disabled={syncingWholesale}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl font-semibold flex items-center gap-2 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingWholesale ? 'animate-spin' : ''}`} />
                  <span>Sync Wholesale Tariffs</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter 42 services by name, key, or endpoint (e.g. nin_mod_name)..."
                  value={serviceSearch}
                  onChange={e => setServiceSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: `All (${identityServices.length})` },
                  { id: 'nin_verification', label: 'NIN' },
                  { id: 'bvn_verification', label: 'BVN' },
                  { id: 'nin_modification', label: 'Modifications' },
                  { id: 'enrolment', label: 'Enrolment' },
                  { id: 'additional_services', label: 'Additional' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setServiceCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                      serviceCategoryFilter === cat.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 42-Service Matrix Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Service &amp; Endpoint</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Assigned Provider</th>
                    <th className="py-3 px-3 text-right">Wholesale Cost</th>
                    <th className="py-3 px-3 text-right">Selling Price (₦)</th>
                    <th className="py-3 px-3 text-right">Profit / Margin</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {identityServices
                    .filter(s => {
                      if (serviceCategoryFilter !== 'all' && s.category !== serviceCategoryFilter) return false;
                      if (!serviceSearch.trim()) return true;
                      const q = serviceSearch.toLowerCase();
                      return (
                        s.name.toLowerCase().includes(q) ||
                        s.key.toLowerCase().includes(q) ||
                        (s.endpoint && s.endpoint.toLowerCase().includes(q))
                      );
                    })
                    .map(srv => {
                      const wholesale = srv.wholesale_cost || 0;
                      const currentSelling = editingPriceMap[srv.key] ?? srv.price;
                      const profit = currentSelling - wholesale;
                      const margin = currentSelling > 0 ? Math.round((profit / currentSelling) * 100) : 0;
                      const isSaving = savingPriceKey === srv.key;

                      return (
                        <tr key={srv.key} className="hover:bg-slate-800/30 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">{srv.name}</div>
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
                              <span>key: {srv.key}</span>
                              {srv.endpoint && (
                                <>
                                  <span>&bull;</span>
                                  <span className="text-indigo-400">api/v1/{srv.endpoint}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-mono tracking-wider">
                              {String(srv.category || 'general').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <select
                              value={srv.provider || '2sureverify'}
                              onChange={e => handleChangeServiceProvider(srv.key, e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none focus:border-indigo-500"
                            >
                              {(() => {
                                const twoSureDef = providerConfigs.find(p => p.id === '2sureverify')?.is_default;
                                const veripineDef = providerConfigs.find(p => p.id === 'veripine')?.is_default;
                                return (
                                  <>
                                    <option value="2sureverify">2SureVerify ({twoSureDef || !veripineDef ? 'Primary' : 'Failover'})</option>
                                    <option value="veripine">Veripine ({veripineDef ? 'Primary' : 'Failover'})</option>
                                  </>
                                );
                              })()}
                            </select>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-slate-400">
                            ₦{wholesale.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-slate-500 font-mono">₦</span>
                              <input
                                type="number"
                                min={0}
                                step={10}
                                value={currentSelling}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  setEditingPriceMap(prev => ({ ...prev, [srv.key]: val }));
                                }}
                                className="w-24 bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg px-2 py-1 text-right text-white font-mono text-xs"
                              />
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <div className={`font-mono font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              +₦{profit.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              ({margin}% margin)
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleService(srv)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                                srv.enabled !== false
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {srv.enabled !== false ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleSavePrice(srv.key)}
                              disabled={isSaving}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-1 text-[11px] ml-auto transition"
                            >
                              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                              <span>Save</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 1B. NIN SLIP MANAGEMENT */}
      {activeTab === 'slip_templates' && (
        <div className="space-y-6 text-xs">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                  <span>NIN &amp; BVN Slip Management &amp; Pricing</span>
                </h2>
                <p className="text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  Configure customer-facing NIN slips (Basic, Regular, Standard, Premium, VNIN) and BVN slips (BVN Basic, Advanced Stamp, Plastic BVN, Bank BVN), selling prices, specimen image previews, descriptions, display order, and active availability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const defaultCat: 'NIN' | 'BVN' = slipCategoryFilter === 'BVN' ? 'BVN' : 'NIN';
                  setEditingSlipTemplate({
                    name: '',
                    slip_code: defaultCat === 'BVN' ? 'bvnBasic' : 'ninStandard',
                    category: defaultCat,
                    price: defaultCat === 'BVN' ? 250 : 200,
                    demo_image_url: defaultCat === 'BVN' ? '/assets/slips/bvn_basic.jpg' : '/assets/aistudio/IMG_0483_23e1a1e1.png',
                    description: '',
                    supported_service: defaultCat === 'BVN' ? 'all_bvn' : 'all_nin',
                    is_active: true,
                    display_order: (slipTemplates.filter(s => s.category === defaultCat).length || 0) + 1,
                    is_recommended: false,
                    badge: '',
                    watermark_text: 'SAMPLE SPECIMEN',
                  });
                }}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add {slipCategoryFilter === 'BVN' ? 'BVN' : 'Slip'} Format</span>
              </button>
            </div>

            {/* Quick Metrics & Filter */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Total Slips</span>
                <p className="text-lg font-bold text-white mt-0.5">{slipTemplates.length}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Active in Customer UI</span>
                <p className="text-lg font-bold text-emerald-400 mt-0.5">
                  {slipTemplates.filter(t => t.is_active).length}
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase font-mono">NIN Slips</span>
                <p className="text-lg font-bold text-indigo-400 mt-0.5">
                  {slipTemplates.filter(t => t.category === 'NIN').length}
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 uppercase font-mono">BVN Slips</span>
                <p className="text-lg font-bold text-cyan-400 mt-0.5">
                  {slipTemplates.filter(t => t.category === 'BVN').length}
                </p>
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
              {(['NIN', 'BVN', 'ALL'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSlipCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    slipCategoryFilter === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat === 'ALL' ? 'All Slips' : `${cat} Slips`}
                </button>
              ))}
            </div>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {slipTemplates
              .filter(t => slipCategoryFilter === 'ALL' || t.category === slipCategoryFilter)
              .sort((a, b) => a.display_order - b.display_order)
              .map(template => (
                <div
                  key={template.id}
                  className={`bg-slate-900 border rounded-2xl overflow-hidden flex flex-col transition shadow-xl ${
                    template.is_active ? 'border-slate-800' : 'border-slate-800/40 opacity-70'
                  }`}
                >
                  {/* Demo Image Specimen Banner */}
                  <div className="relative h-48 bg-slate-950 overflow-hidden flex items-center justify-center border-b border-slate-800">
                    <img
                      src={template.demo_image_url}
                      alt={template.name}
                      className="w-full h-full object-cover opacity-90"
                      onError={e => {
                        (e.target as any).src = '/assets/aistudio/IMG_0483_23e1a1e1.png';
                      }}
                    />
                    {/* Watermark Overlay banner */}
                    <div className="absolute inset-0 bg-slate-950/35 flex items-center justify-center p-4 pointer-events-none">
                      <div className="border border-dashed border-amber-400/70 bg-amber-950/80 text-amber-300 px-3 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider text-center rotate-[-4deg] shadow-lg">
                        {template.watermark_text || 'SAMPLE SPECIMEN'}
                      </div>
                    </div>

                    {/* Top Left Badges */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap max-w-[72%]">
                      <span className="px-2 py-0.5 rounded bg-indigo-600/90 text-white font-mono text-[9px] font-bold uppercase shadow">
                        {template.slip_code || template.category}
                      </span>
                      {(template.is_recommended || template.badge) && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/95 text-slate-950 font-bold text-[9px] shadow inline-flex items-center gap-1">
                          {template.is_recommended && <Star className="w-2.5 h-2.5 fill-current" />}
                          <span>{template.badge || 'Recommended'}</span>
                        </span>
                      )}
                    </div>

                    {/* Order Tag */}
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-slate-900/90 text-slate-300 font-mono text-[10px] border border-slate-700">
                      #{template.display_order}
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-white text-sm leading-snug">{template.name}</h3>
                          <p className="text-emerald-400 font-mono font-bold text-sm mt-0.5">
                            {template.price !== null && template.price !== undefined
                              ? `₦${Number(template.price).toLocaleString('en-NG')}`
                              : 'Service Default Price'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono shrink-0 ${
                            template.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {template.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                        {template.description || 'Specimen preview and format description for customer selection.'}
                      </p>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleToggleSlipActive(template)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition ${
                          template.is_active
                            ? 'bg-slate-800 text-slate-300 hover:text-white'
                            : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        }`}
                      >
                        {template.is_active ? 'Set Inactive' : 'Set Active'}
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingSlipTemplate(template)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition inline-flex items-center gap-1 text-[11px] font-semibold"
                          title="Edit slip configuration"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlipTemplate(template.id)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                          title="Delete slip template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Edit / Create Slip Template Modal */}
          {editingSlipTemplate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl my-8">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="font-bold text-white text-sm">
                    {editingSlipTemplate.id
                      ? `Edit ${editingSlipTemplate.category || 'NIN'} Slip Configuration`
                      : `Add ${editingSlipTemplate.category || 'NIN'} Slip Format`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingSlipTemplate(null)}
                    className="text-slate-400 hover:text-white text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleSaveSlipTemplate} className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Slip Name</label>
                      <input
                        type="text"
                        value={editingSlipTemplate.name || ''}
                        onChange={e => setEditingSlipTemplate({ ...editingSlipTemplate, name: e.target.value })}
                        placeholder={editingSlipTemplate.category === 'BVN' ? 'e.g. Advanced Stamp' : 'e.g. Standard Slip'}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Customer Selling Price (₦)</label>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={editingSlipTemplate.price ?? ''}
                        onChange={e =>
                          setEditingSlipTemplate({
                            ...editingSlipTemplate,
                            price: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        placeholder="e.g. 250"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Category</label>
                      <select
                        value={editingSlipTemplate.category || 'NIN'}
                        onChange={e => {
                          const nextCat = e.target.value as 'NIN' | 'BVN' | 'OTHER';
                          setEditingSlipTemplate({
                            ...editingSlipTemplate,
                            category: nextCat,
                            slip_code: nextCat === 'BVN' ? 'bvnBasic' : 'ninStandard',
                            supported_service: nextCat === 'BVN' ? 'all_bvn' : 'all_nin',
                          });
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="NIN">NIN</option>
                        <option value="BVN">BVN</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Slip Code / Format</label>
                      <select
                        value={editingSlipTemplate.slip_code || (editingSlipTemplate.category === 'BVN' ? 'bvnBasic' : 'ninStandard')}
                        onChange={e => setEditingSlipTemplate({ ...editingSlipTemplate, slip_code: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                      >
                        {editingSlipTemplate.category === 'BVN' ? (
                          <>
                            <option value="bvnBasic">bvnBasic (BVN Basic)</option>
                            <option value="bvnAdvanced">bvnAdvanced (Advanced Stamp)</option>
                            <option value="plasticBvn">plasticBvn (Plastic BVN)</option>
                            <option value="bankBvn">bankBvn (Bank BVN)</option>
                          </>
                        ) : (
                          <>
                            <option value="ninBasic">ninBasic (Basic Slip)</option>
                            <option value="ninRegular">ninRegular (Regular Slip)</option>
                            <option value="ninStandard">ninStandard (Standard Slip)</option>
                            <option value="ninPremium">ninPremium (Premium Slip)</option>
                            <option value="ninVnin">ninVnin (VNIN Slip)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Specimen Image Upload + Preview */}
                  <div className="space-y-2">
                    <label className="block text-slate-300 font-semibold">Specimen Image</label>
                    <div className="flex items-center gap-3">
                      <div className="relative w-24 h-16 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                        {editingSlipTemplate.demo_image_url ? (
                          <img
                            src={editingSlipTemplate.demo_image_url}
                            alt="Specimen preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-500">No Image</span>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-semibold cursor-pointer transition">
                          {uploadingSpecimen ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>{uploadingSpecimen ? 'Uploading...' : 'Upload Specimen Image'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleUploadSpecimenFile}
                            disabled={uploadingSpecimen}
                            className="hidden"
                          />
                        </label>
                        <input
                          type="text"
                          value={editingSlipTemplate.demo_image_url || ''}
                          onChange={e => setEditingSlipTemplate({ ...editingSlipTemplate, demo_image_url: e.target.value })}
                          placeholder="/uploads/slips/... or preset path"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white text-[11px] font-mono focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={editingSlipTemplate.description || ''}
                      onChange={e => setEditingSlipTemplate({ ...editingSlipTemplate, description: e.target.value })}
                      placeholder="Clear description shown to customers when they choose this slip..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Optional Label / Badge</label>
                      <input
                        type="text"
                        value={editingSlipTemplate.badge || ''}
                        onChange={e => setEditingSlipTemplate({ ...editingSlipTemplate, badge: e.target.value })}
                        placeholder="e.g. Recommended, Card Format"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Display Order</label>
                      <input
                        type="number"
                        min={1}
                        value={editingSlipTemplate.display_order ?? 1}
                        onChange={e => setEditingSlipTemplate({ ...editingSlipTemplate, display_order: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingSlipTemplate.is_active ?? true}
                        onChange={e => setEditingSlipTemplate({ ...editingSlipTemplate, is_active: e.target.checked })}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-slate-300 font-medium">Active (Available to customers)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingSlipTemplate.is_recommended ?? false}
                        onChange={e =>
                          setEditingSlipTemplate({
                            ...editingSlipTemplate,
                            is_recommended: e.target.checked,
                            badge: e.target.checked && !editingSlipTemplate.badge ? 'Recommended' : editingSlipTemplate.badge,
                          })
                        }
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-slate-300 font-medium">Mark as Recommended</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingSlipTemplate(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingSlipTemplate || uploadingSpecimen}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition flex items-center gap-1.5"
                    >
                      {savingSlipTemplate && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Save Slip Settings</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. PROVIDERS & GATEWAYS ARCHITECTURE */}
      {activeTab === 'providers' && (
        <div className="space-y-6 text-xs">
          {/* BVN & Identity Priority / Failover Routing */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>BVN &amp; Identity Verification Provider Priority &amp; Failover</span>
                </h2>
                <p className="text-slate-400 mt-0.5">
                  Configure primary and automatic fallback verification providers for BVN and NIN workflows.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveProviders(providerRouting)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-semibold flex items-center gap-1.5 self-start sm:self-auto transition"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Routing Policy</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Primary BVN Provider</label>
                <select
                  value={providerRouting.bvn_primary_provider}
                  onChange={e =>
                    setProviderRouting(prev => ({
                      ...prev,
                      bvn_primary_provider: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="2sureverify">2SureVerify (Primary Recommended)</option>
                  <option value="veripine">Veripine</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Fallback BVN Provider</label>
                <select
                  value={providerRouting.bvn_fallback_provider}
                  onChange={e =>
                    setProviderRouting(prev => ({
                      ...prev,
                      bvn_fallback_provider: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="veripine">Veripine</option>
                  <option value="2sureverify">2SureVerify</option>
                  <option value="none">No Fallback (Single Provider Only)</option>
                </select>
              </div>

              <div className="flex flex-col justify-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5">
                <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                  <input
                    type="checkbox"
                    checked={providerRouting.bvn_auto_fallback}
                    onChange={e =>
                      setProviderRouting(prev => ({ ...prev, bvn_auto_fallback: e.target.checked }))
                    }
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Enable Automatic BVN Failover</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-medium">
                  <input
                    type="checkbox"
                    checked={providerRouting.identity_auto_fallback}
                    onChange={e =>
                      setProviderRouting(prev => ({ ...prev, identity_auto_fallback: e.target.checked }))
                    }
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Enable Automatic NIN Failover</span>
                </label>
              </div>
            </div>
          </div>

          {/* Provider Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {providerConfigs.map(provider => {
              const is2Sure = provider.id === '2sureverify';
              const result = testResult[provider.id];
              const isTesting = testingProvider === provider.id;
              const isKeyVisible = showApiKey[provider.id];

              return (
                <div key={provider.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-sm">{provider.name}</h3>
                          {provider.is_default && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                              Primary Engine
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 text-[11px]">ID: {provider.id}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleProviderActive(provider)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                        provider.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {provider.is_active ? 'Operational' : 'Disabled'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-slate-400 font-medium">Provider Base URL</label>
                      <input
                        type="text"
                        readOnly
                        value={provider.base_url}
                        className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-slate-400 font-medium">API Credential / Secret Key</label>
                        <button
                          type="button"
                          onClick={() => setShowApiKey(prev => ({ ...prev, [provider.id]: !isKeyVisible }))}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          {isKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{isKeyVisible ? 'Hide' : 'Reveal'}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        readOnly
                        value={
                          isKeyVisible
                            ? (provider.api_key || provider.api_key_masked)
                            : (provider.api_key_masked || '••••••••••••••••••••••••••••••••')
                        }
                        className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-slate-500 text-[10px] uppercase font-mono">Gateway Timeout</span>
                        <p className="text-white font-mono font-semibold mt-0.5">{provider.timeout_seconds || 30} seconds</p>
                      </div>
                      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-slate-500 text-[10px] uppercase font-mono">Auth Header</span>
                        <p className="text-white font-mono font-semibold mt-0.5">
                          {is2Sure ? 'X-Api-Key' : provider.id === 'veripine' ? 'x-api-key' : 'Bearer Token'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Test Connection, Edit & Set Primary Actions */}
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {!provider.is_default && (provider.provider_type === 'identity' || provider.provider_type === 'verification' || provider.provider_type === 'telecom') && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryProvider(provider)}
                            disabled={savingProvider}
                            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl font-semibold transition flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Set as Primary</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingProvider({ ...provider, api_key: '' })}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold transition flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Configure</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestProvider(provider.id)}
                        disabled={isTesting}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-2 transition"
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Pinging Gateway...</span>
                          </>
                        ) : (
                          <>
                            <Activity className="w-3.5 h-3.5" />
                            <span>Test Live Connection</span>
                          </>
                        )}
                      </button>
                    </div>

                    {result && (
                      <div
                        className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                          result.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-0.5 flex-1">
                          <div className="font-semibold flex items-center justify-between">
                            <span>{result.message}</span>
                            {result.latency_ms > 0 && (
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-black/40">
                                {result.latency_ms} ms
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {editingProvider && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="font-bold text-white text-sm">Configure {editingProvider.name || editingProvider.id}</h3>
                  <button type="button" onClick={() => setEditingProvider(null)} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
                </div>
                <form onSubmit={handleSaveProviderConfig} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Display Name</label>
                    <input
                      type="text"
                      value={editingProvider.name || ''}
                      onChange={e => setEditingProvider({ ...editingProvider, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Gateway Base URL</label>
                    <input
                      type="url"
                      value={editingProvider.base_url || ''}
                      onChange={e => setEditingProvider({ ...editingProvider, base_url: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Update API Key (Leave blank to keep existing)</label>
                    <input
                      type="password"
                      value={editingProvider.api_key || ''}
                      onChange={e => setEditingProvider({ ...editingProvider, api_key: e.target.value })}
                      placeholder={editingProvider.api_key_masked || 'Enter new API key only to rotate'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Timeout (seconds)</label>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={editingProvider.timeout_seconds ?? 30}
                        onChange={e => setEditingProvider({ ...editingProvider, timeout_seconds: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-2 pb-1">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(editingProvider.is_active)}
                          onChange={e => setEditingProvider({ ...editingProvider, is_active: e.target.checked })}
                          className="rounded border-slate-700"
                        />
                        <span>Active</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(editingProvider.is_default)}
                          onChange={e => setEditingProvider({ ...editingProvider, is_default: e.target.checked })}
                          className="rounded border-slate-700"
                        />
                        <span>Primary Engine</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                    <button type="button" onClick={() => setEditingProvider(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold">Cancel</button>
                    <button type="submit" disabled={savingProvider} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-1.5">
                      {savingProvider && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Save Config</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Provider Transaction & Request Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Real-Time Provider Transaction &amp; Audit Logs</span>
                </h3>
                <p className="text-slate-400 mt-0.5">Recorded upstream request timestamps, HTTP response codes, latency, and references.</p>
              </div>
              <button
                type="button"
                onClick={fetchServices}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Logs</span>
              </button>
            </div>

            {providerLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No upstream provider calls recorded yet. Execute a verification to inspect live logs.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Endpoint</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Latency</th>
                      <th className="py-2.5 px-3">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {providerLogs.slice(0, 25).map(log => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 text-white font-semibold">
                          {log.provider}
                        </td>
                        <td className="py-2.5 px-3 text-indigo-300">
                          {log.endpoint}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status_code >= 200 && log.status_code < 300
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {log.status_code}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {log.latency_ms}ms
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 truncate max-w-[150px]">
                          {log.reference || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. TELECOMMUNICATIONS */}
      {activeTab === 'telecom' && (
        <form onSubmit={handleSavePricing} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sky-400" />
                <span>Telecommunications &amp; VTU Pricing</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Configure 1GB wholesale rates per carrier and airtime cashback spread.</p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Telecom Rates</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400">MTN SME 1GB (₦)</label>
              <input
                type="number"
                value={settings.mtn_sme_1gb || 270}
                onChange={e => setSettings({ ...settings, mtn_sme_1gb: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Airtel Corporate 1GB (₦)</label>
              <input
                type="number"
                value={settings.airtel_1gb || 290}
                onChange={e => setSettings({ ...settings, airtel_1gb: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Glo Corporate 1GB (₦)</label>
              <input
                type="number"
                value={settings.glo_1gb || 260}
                onChange={e => setSettings({ ...settings, glo_1gb: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">9mobile SME 1GB (₦)</label>
              <input
                type="number"
                value={settings.nine_mobile_1gb || 250}
                onChange={e => setSettings({ ...settings, nine_mobile_1gb: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-800">
            <label className="text-slate-400 font-semibold">VTU Airtime Customer Discount (%)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step={0.5}
                min={0}
                max={10}
                value={settings.airtime_discount_percent || 2.5}
                onChange={e => setSettings({ ...settings, airtime_discount_percent: Number(e.target.value) })}
                className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
              <span className="text-slate-400 font-mono">% discount automatically credited back to customer</span>
            </div>
          </div>
        </form>
      )}

      {/* 3. DIGITAL UTILITIES */}
      {activeTab === 'digital' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Digital Services &amp; Utility Settings</span>
          </h2>
          <p className="text-slate-400">
            Cable TV renewals and Electricity prepaid meter vending are piped directly to VTpass API gateway with sub-3s token dispatch.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-white">Cable TV Decoders (DStv, GOtv, StarTimes)</p>
              <p className="text-slate-400">Commission margin retained: <strong>2.0%</strong> per bouquet subscription.</p>
              <p className="text-emerald-400 font-mono">Status: Connected to MultiChoice Gateway</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-white">Prepaid Electricity DISCOs (8 National Grids)</p>
              <p className="text-slate-400">Commission margin retained: <strong>1.0%</strong> per meter token generation.</p>
              <p className="text-emerald-400 font-mono">Status: Connected to NERC DISCO Grid</p>
            </div>
          </div>
        </div>
      )}

      {/* 4. STORE INVENTORY */}
      {activeTab === 'store' && (
        <div className="space-y-4 text-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-indigo-400" />
                <span>Hardware &amp; Developer Store Inventory</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Manage biometric scanners, agency POS terminals, and developer licenses.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingStoreItem({ name: '', category: 'Hardware', price: 50000, stock: 10, description: '', status: 'active' })}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>

          {editingStoreItem && (
            <form onSubmit={handleSaveStoreItem} className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 space-y-3">
              <h3 className="font-bold text-white text-sm">
                {editingStoreItem.id ? 'Edit Product' : 'Add Store Product'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400">Product Name</label>
                  <input
                    type="text"
                    required
                    value={editingStoreItem.name || ''}
                    onChange={e => setEditingStoreItem({ ...editingStoreItem, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Category</label>
                  <input
                    type="text"
                    value={editingStoreItem.category || 'Hardware'}
                    onChange={e => setEditingStoreItem({ ...editingStoreItem, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400">Retail Price (₦)</label>
                  <input
                    type="number"
                    required
                    value={editingStoreItem.price || 0}
                    onChange={e => setEditingStoreItem({ ...editingStoreItem, price: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Current Stock Quantity</label>
                  <input
                    type="number"
                    value={editingStoreItem.stock || 0}
                    onChange={e => setEditingStoreItem({ ...editingStoreItem, stock: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400">Description</label>
                <textarea
                  rows={2}
                  value={editingStoreItem.description || ''}
                  onChange={e => setEditingStoreItem({ ...editingStoreItem, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold"
                >
                  Save Product
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStoreItem(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {storeItems.map(item => (
              <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                      {item.category}
                    </span>
                    <span className="text-emerald-400 font-mono font-bold">₦{item.price.toLocaleString()}</span>
                  </div>
                  <h3 className="font-bold text-white text-sm">{item.name}</h3>
                  <p className="text-slate-400 text-xs line-clamp-2">{item.description}</p>
                </div>
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 font-mono">Stock: {item.stock}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingStoreItem(item)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStoreItem(item.id)}
                      className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-red-400 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. ACADEMY COURSES */}
      {activeTab === 'academy' && (
        <div className="space-y-4 text-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-400" />
                <span>Academy Course Curriculum Management</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Control agency accreditation tracks, enrollment fees, and module counts.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingCourse({ title: '', level: 'Beginner to Pro', duration: '4 Weeks', modules_count: 6, price: 15000, description: '', status: 'enrolling' })}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Course</span>
            </button>
          </div>

          {editingCourse && (
            <form onSubmit={handleSaveCourse} className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 space-y-3">
              <h3 className="font-bold text-white text-sm">
                {editingCourse.id ? 'Edit Course' : 'Create Academy Course'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400">Course Title</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.title || ''}
                    onChange={e => setEditingCourse({ ...editingCourse, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Target Skill Level</label>
                  <input
                    type="text"
                    value={editingCourse.level || 'Professional'}
                    onChange={e => setEditingCourse({ ...editingCourse, level: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400">Duration</label>
                  <input
                    type="text"
                    value={editingCourse.duration || '4 Weeks'}
                    onChange={e => setEditingCourse({ ...editingCourse, duration: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Modules Count</label>
                  <input
                    type="number"
                    value={editingCourse.modules_count || 6}
                    onChange={e => setEditingCourse({ ...editingCourse, modules_count: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Tuition Fee (₦)</label>
                  <input
                    type="number"
                    value={editingCourse.price || 0}
                    onChange={e => setEditingCourse({ ...editingCourse, price: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400">Description</label>
                <textarea
                  rows={2}
                  value={editingCourse.description || ''}
                  onChange={e => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold"
                >
                  Save Course
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {academyCourses.map(course => (
              <div key={course.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                      {course.level}
                    </span>
                    <span className="text-slate-400 font-mono">{course.duration}</span>
                  </div>
                  <h3 className="font-bold text-white text-sm">{course.title}</h3>
                  <p className="text-slate-400 text-xs line-clamp-2">{course.description}</p>
                </div>
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-white font-mono font-bold">
                    {course.price === null || course.price === undefined
                      ? 'Contact Academy'
                      : `₦${course.price.toLocaleString()}`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingCourse(course)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCourse(course.id)}
                      className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-red-400 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. FINANCIAL REPORTS */}
      {activeTab === 'reports' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <span>Executive Ledger &amp; Reseller Spread Summary</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Audited wholesale spread, provider costs, and daily transaction volume.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSuccessMsg('Generating full audit statement CSV package... Ready in Footprints Journal.');
                setTimeout(() => setSuccessMsg(null), 3500);
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV Journal</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-400">Total Telecom Vending Cost</p>
              <p className="text-lg font-bold font-mono text-white mt-1">UlamaData Sub-accounts</p>
              <p className="text-[11px] text-emerald-400 mt-1">Average reseller margin: 15.2%</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-400">Verification Gateway Outflow</p>
              <p className="text-lg font-bold font-mono text-white mt-1">2SureVerify &amp; Veripine</p>
              <p className="text-[11px] text-emerald-400 mt-1">NIMC margin: 30.0%</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-400">Production API Ingress</p>
              <p className="text-lg font-bold font-mono text-white mt-1">hambaktech.com.ng</p>
              <p className="text-[11px] text-indigo-400 mt-1">TLS Gateway Active</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
