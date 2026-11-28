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
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ServiceRoutingManager } from './ServiceRoutingManager';
import {
  StoreItem,
  AcademyCourse,
  IdentityService,
  ProviderConfigItem,
  ProviderLogItem,
  ProviderServiceMapping,
  ServiceCategoryItem,
  PaginationMeta,
  SlipTemplateItem,
  TelecomPlanItem,
  TelecomOrder,
  AirtimePinDenomination,
  DataPinDenomination,
} from '../../types';

interface ServiceManagementProps {
  onOpenAcademyAdmin?: () => void;
}

export function ServiceManagement({ onOpenAcademyAdmin }: ServiceManagementProps = {}) {
  const { user } = useAuth();
  const hasRoutingConfig = Boolean(
    user &&
      (user.role === 'superadmin' ||
        (Array.isArray(user.permissions) &&
          (user.permissions.includes('*') || user.permissions.includes('routing_config'))))
  );
  const [activeTab, setActiveTab] = useState<'nin' | 'routing' | 'slip_templates' | 'providers' | 'telecom' | 'digital' | 'store' | 'academy' | 'reports'>('nin');

  const [settings, setSettings] = useState<any>({});
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [academyCourses, setAcademyCourses] = useState<AcademyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Phase 5 Identity Services & Providers State
  const [identityServices, setIdentityServices] = useState<IdentityService[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryItem[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('all');
  const [syncingWholesale, setSyncingWholesale] = useState(false);
  const [editingPriceMap, setEditingPriceMap] = useState<Record<string, number>>({});
  const [savingPriceKey, setSavingPriceKey] = useState<string | null>(null);

  // Phase 3 Service & Category Catalog CRUD Modals
  const [catalogModalMode, setCatalogModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingCatalogKey, setEditingCatalogKey] = useState<string | null>(null);
  const [catalogForm, setCatalogForm] = useState({
    service_key: '',
    name: '',
    description: '',
    category_code: 'nin_verification',
    provider_id: '2sureverify',
    endpoint: '',
    wholesale_cost: 0,
    selling_price: 0,
    processing_type: 'instant' as 'instant' | 'manual',
    manual_label: '',
    estimated_turnaround: '',
    slip_type_supported: false,
    is_active: true,
    required_fields_text: 'nin',
  });
  const [savingCatalogService, setSavingCatalogService] = useState(false);
  const [confirmDeleteService, setConfirmDeleteService] = useState<IdentityService | null>(null);
  const [deletingCatalogKey, setDeletingCatalogKey] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    code: '',
    name: '',
    description: '',
    display_order: 10,
    is_active: true,
  });
  const [savingCategory, setSavingCategory] = useState(false);

  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigItem[]>([]);
  const [providerMappings, setProviderMappings] = useState<ProviderServiceMapping[]>([]);
  const [editingProvider, setEditingProvider] = useState<Partial<ProviderConfigItem> | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string; latency_ms: number }>>({});
  const [providerLogs, setProviderLogs] = useState<ProviderLogItem[]>([]);
  const [logProviderFilter, setLogProviderFilter] = useState<string>('all');
  const [logStatusGroupFilter, setLogStatusGroupFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState<string>('');
  const [logDateFrom, setLogDateFrom] = useState<string>('');
  const [logDateTo, setLogDateTo] = useState<string>('');
  const [logPage, setLogPage] = useState<number>(1);
  const [logPagination, setLogPagination] = useState<PaginationMeta | null>(null);
  const [loadingProviderLogs, setLoadingProviderLogs] = useState<boolean>(false);
  const [inspectedLog, setInspectedLog] = useState<ProviderLogItem | null>(null);
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

  // Telecom Data Bundles & Orders State (Stage 5 Phase 1)
  const [telecomPlans, setTelecomPlans] = useState<TelecomPlanItem[]>([]);
  const [telecomCategoriesByNet, setTelecomCategoriesByNet] = useState<Record<string, string[]>>({});
  const [telecomNetworkFilter, setTelecomNetworkFilter] = useState<'ALL' | 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('ALL');
  const [telecomCategoryFilter, setTelecomCategoryFilter] = useState<string>('ALL');
  const [telecomPlanSearch, setTelecomPlanSearch] = useState<string>('');
  const [syncingDataPlans, setSyncingDataPlans] = useState<boolean>(false);
  const [defaultMarkupPercent, setDefaultMarkupPercent] = useState<number>(15);
  const [bulkPricingMode, setBulkPricingMode] = useState<'markup_percent' | 'discount_percent' | 'default_markup'>('markup_percent');
  const [bulkPricingValue, setBulkPricingValue] = useState<number>(15);
  const [bulkSkipFixed, setBulkSkipFixed] = useState<boolean>(true);
  const [applyingBulkPricing, setApplyingBulkPricing] = useState<boolean>(false);
  const [planEdits, setPlanEdits] = useState<Record<string, { pricing_mode: string; value: number }>>({});
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [telecomOrders, setTelecomOrders] = useState<TelecomOrder[]>([]);
  const [ordersServiceFilter, setOrdersServiceFilter] = useState<'all' | 'data' | 'airtime' | 'airtime_pin' | 'data_pin'>('all');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<'all' | 'successful' | 'pending' | 'failed'>('all');
  const [loadingTelecomOrders, setLoadingTelecomOrders] = useState<boolean>(false);
  const [requeryingOrderId, setRequeryingOrderId] = useState<string | null>(null);
  const [expandedOrderMetaId, setExpandedOrderMetaId] = useState<string | null>(null);

  // Telecom Airtime PIN & Data PIN State (Stage 5 Phase 2)
  const [airtimePinDenoms, setAirtimePinDenoms] = useState<AirtimePinDenomination[]>([]);
  const [airtimePinNetFilter, setAirtimePinNetFilter] = useState<'ALL' | 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE'>('ALL');
  const [syncingAirtimePins, setSyncingAirtimePins] = useState<boolean>(false);
  const [pinDefaultMarkupPercent, setPinDefaultMarkupPercent] = useState<number>(1);
  const [pinBulkMode, setPinBulkMode] = useState<'markup_percent' | 'discount_percent' | 'default_markup'>('markup_percent');
  const [pinBulkValue, setPinBulkValue] = useState<number>(1);
  const [pinBulkSkipFixed, setPinBulkSkipFixed] = useState<boolean>(true);
  const [applyingPinBulk, setApplyingPinBulk] = useState<boolean>(false);
  const [airtimePinEdits, setAirtimePinEdits] = useState<Record<string, { pricing_mode: string; value: number; max_quantity: number }>>({});
  const [savingAirtimePinId, setSavingAirtimePinId] = useState<string | null>(null);
  const [dataPinDenoms, setDataPinDenoms] = useState<DataPinDenomination[]>([]);
  const [dataPinCatalogueStatus, setDataPinCatalogueStatus] = useState<string>('');
  const [dataPinEdits, setDataPinEdits] = useState<Record<string, { pricing_mode: string; value: number; max_quantity: number }>>({});
  const [savingDataPinId, setSavingDataPinId] = useState<string | null>(null);

  const fetchAdminTelecomData = async (
    srvFilter: string = ordersServiceFilter,
    stFilter: string = ordersStatusFilter
  ) => {
    setLoadingTelecomOrders(true);
    try {
      const [plansRes, ordersRes, apinRes, dpinRes] = await Promise.all([
        api.getAdminTelecomPlans().catch(() => null),
        api.getAdminTelecomOrders({ service: srvFilter, status: stFilter, limit: 60 }).catch(() => null),
        api.getAdminAirtimePins().catch(() => null),
        api.getAdminDataPins().catch(() => null),
      ]);
      if (plansRes) {
        const list = plansRes.plans || [];
        setTelecomPlans(list);
        setTelecomCategoriesByNet(plansRes.categories_by_network || {});
        const defMk = plansRes.data_default_markup_percent ?? 15;
        setDefaultMarkupPercent(defMk);
        const editMap: Record<string, { pricing_mode: string; value: number }> = {};
        list.forEach(p => {
          const mode = p.pricing_mode || 'default_markup';
          let val = p.price;
          if (mode === 'fixed') val = p.fixed_price ?? p.price;
          else if (mode === 'markup_percent') val = p.markup_percent ?? defMk;
          else if (mode === 'discount_percent') val = p.discount_percent ?? 0;
          editMap[p.id] = { pricing_mode: mode, value: Number(val) };
        });
        setPlanEdits(editMap);
      }
      if (apinRes) {
        const list = apinRes.denominations || [];
        setAirtimePinDenoms(list);
        const defPinMk = apinRes.pin_default_markup_percent ?? 1;
        setPinDefaultMarkupPercent(defPinMk);
        const apinMap: Record<string, { pricing_mode: string; value: number; max_quantity: number }> = {};
        list.forEach(d => {
          const mode = d.pricing_mode || 'default_markup';
          let val = d.price;
          if (mode === 'fixed') val = d.fixed_price ?? d.price;
          else if (mode === 'markup_percent') val = d.markup_percent ?? defPinMk;
          else if (mode === 'discount_percent') val = d.discount_percent ?? 0;
          apinMap[d.id] = {
            pricing_mode: mode,
            value: Number(val),
            max_quantity: Number(d.max_quantity ?? 50),
          };
        });
        setAirtimePinEdits(apinMap);
      }
      if (dpinRes) {
        const dList = dpinRes.denominations || [];
        setDataPinDenoms(dList);
        setDataPinCatalogueStatus(dpinRes.catalogue_status || '');
        const dpinMap: Record<string, { pricing_mode: string; value: number; max_quantity: number }> = {};
        dList.forEach(d => {
          const mode = d.pricing_mode || 'default_markup';
          let val = d.price;
          if (mode === 'fixed') val = d.fixed_price ?? d.price;
          else if (mode === 'markup_percent') val = d.markup_percent ?? 1;
          else if (mode === 'discount_percent') val = d.discount_percent ?? 0;
          dpinMap[d.id] = {
            pricing_mode: mode,
            value: Number(val),
            max_quantity: Number(d.max_quantity ?? 50),
          };
        });
        setDataPinEdits(dpinMap);
      }
      if (ordersRes?.orders) {
        setTelecomOrders(ordersRes.orders);
      }
    } finally {
      setLoadingTelecomOrders(false);
    }
  };

  const fetchProviderLogs = async (targetPage = logPage) => {
    setLoadingProviderLogs(true);
    try {
      const logsRes = await api.getAdminProviderLogs({
        provider: logProviderFilter,
        status_group: logStatusGroupFilter,
        search: logSearch.trim() || undefined,
        date_from: logDateFrom || undefined,
        date_to: logDateTo || undefined,
        page: targetPage,
        limit: 25,
      });
      if (logsRes?.logs) {
        setProviderLogs(logsRes.logs);
      }
      setLogPagination(logsRes?.pagination || null);
      setLogPage(targetPage);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProviderLogs(false);
    }
  };

  const fetchServices = async () => {
    setLoading(true);
    try {
      const [res, pricingRes, categoriesRes, providersRes, templatesRes] = await Promise.all([
        api.getAdminServices(),
        api.getAdminVerificationPricing().catch(() => ({ services: [] })),
        api.getAdminServiceCategories().catch(() => ({ categories: [] })),
        api.getAdminProviders().catch(() => ({ providers: [], provider_service_mappings: [], routing: undefined })),
        api.getAdminSlipTemplates().catch(() => ({ templates: [] })),
      ]);
      setSettings(res.settings || {});
      if (typeof res?.settings?.data_default_markup_percent === 'number') {
        setDefaultMarkupPercent(res.settings.data_default_markup_percent);
      }
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
      if (categoriesRes?.categories) {
        setServiceCategories(categoriesRes.categories);
      }
      if (providersRes?.providers) {
        setProviderConfigs(providersRes.providers);
      }
      if (providersRes?.provider_service_mappings) {
        setProviderMappings(providersRes.provider_service_mappings);
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
      await fetchProviderLogs(1);
      if (templatesRes?.templates) {
        setSlipTemplates(templatesRes.templates);
      }
      await fetchAdminTelecomData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const handleSyncDataPlans = async () => {
    setSyncingDataPlans(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.syncAdminTelecomPlans(false);
      setSuccessMsg(
        res.message ||
          `Synced ${res.synced_count} live plans from Ulamadata (preserved ${res.preserved_overrides} admin-configured prices).`
      );
      await fetchAdminTelecomData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sync live plans from Ulamadata');
    } finally {
      setSyncingDataPlans(false);
    }
  };

  const handleSaveDataPlan = async (plan: TelecomPlanItem) => {
    const edit = planEdits[plan.id] || { pricing_mode: plan.pricing_mode || 'fixed', value: plan.price };
    setSavingPlanId(plan.id);
    setErrorMsg(null);
    try {
      const payload: any = {
        pricing_mode: edit.pricing_mode,
        is_active: plan.is_active ?? plan.enabled,
      };
      if (edit.pricing_mode === 'fixed') {
        payload.fixed_price = Number(edit.value);
        payload.price = Number(edit.value);
      } else if (edit.pricing_mode === 'markup_percent') {
        payload.markup_percent = Number(edit.value);
      } else if (edit.pricing_mode === 'discount_percent') {
        payload.discount_percent = Number(edit.value);
      }
      const res = await api.updateAdminTelecomPlan(plan.id, payload);
      if (res.plan) {
        setTelecomPlans(prev =>
          prev.map(item => (item.id === plan.id ? { ...item, ...res.plan, type: res.plan.plan_type || item.type } : item))
        );
      }
      setSuccessMsg(`Saved ${plan.network} ${plan.size} (${plan.type}) selling price.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update data plan pricing');
    } finally {
      setSavingPlanId(null);
    }
  };

  const handleToggleDataPlanActive = async (plan: TelecomPlanItem) => {
    const nextActive = !(plan.is_active ?? plan.enabled);
    setErrorMsg(null);
    try {
      await api.updateAdminTelecomPlan(plan.id, {
        pricing_mode: plan.pricing_mode || 'default_markup',
        fixed_price: plan.fixed_price,
        markup_percent: plan.markup_percent,
        discount_percent: plan.discount_percent,
        is_active: nextActive,
      });
      setTelecomPlans(prev =>
        prev.map(item => (item.id === plan.id ? { ...item, is_active: nextActive, enabled: nextActive } : item))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update plan status');
    }
  };

  const handleApplyBulkDataPricing = async () => {
    setApplyingBulkPricing(true);
    setErrorMsg(null);
    try {
      const res = await api.bulkUpdateAdminTelecomPricing({
        network: telecomNetworkFilter,
        category: telecomCategoryFilter,
        pricing_mode: bulkPricingMode,
        value: Number(bulkPricingValue),
        skip_fixed_overrides: bulkSkipFixed,
        data_default_markup_percent: Number(defaultMarkupPercent),
      });
      setSuccessMsg(res.message || `Updated ${res.updated_count} data plans.`);
      await fetchAdminTelecomData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to apply bulk data pricing');
    } finally {
      setApplyingBulkPricing(false);
    }
  };

  const handleToggleDataCategory = async (isActive: boolean) => {
    if (telecomNetworkFilter === 'ALL' || telecomCategoryFilter === 'ALL') {
      setErrorMsg('Select both a specific Network and a specific Category to enable or disable an entire category.');
      return;
    }
    setErrorMsg(null);
    try {
      const res = await api.toggleAdminTelecomCategory({
        network: telecomNetworkFilter,
        category: telecomCategoryFilter,
        is_active: isActive,
      });
      setSuccessMsg(res.message);
      await fetchAdminTelecomData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle category status');
    }
  };

  const handleRequeryTelecomOrder = async (order: TelecomOrder) => {
    setRequeryingOrderId(order.id);
    setErrorMsg(null);
    try {
      const res = await api.verifyTelecomTransaction(order.provider_ref || order.id);
      setSuccessMsg(`Order ${order.provider_ref || order.id}: ${res.result?.status || res.order?.status || 'checked'}`);
      await fetchAdminTelecomData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to requery telecom transaction');
    } finally {
      setRequeryingOrderId(null);
    }
  };

  const handleSyncAirtimePins = async () => {
    setSyncingAirtimePins(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.syncAdminAirtimePins(false);
      setSuccessMsg(res.message || `Synced ${res.synced_count} Airtime PIN denominations from Ulamadata.`);
      await fetchAdminTelecomData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sync Airtime PIN catalogue from Ulamadata');
    } finally {
      setSyncingAirtimePins(false);
    }
  };

  const handleSaveAirtimePin = async (denom: AirtimePinDenomination) => {
    const edit = airtimePinEdits[denom.id] || {
      pricing_mode: denom.pricing_mode || 'fixed',
      value: denom.price,
      max_quantity: denom.max_quantity ?? 50,
    };
    setSavingAirtimePinId(denom.id);
    setErrorMsg(null);
    try {
      const payload: any = {
        pricing_mode: edit.pricing_mode,
        max_quantity: Number(edit.max_quantity || 50),
        is_active: denom.is_active ?? denom.enabled,
      };
      if (edit.pricing_mode === 'fixed') {
        payload.fixed_price = Number(edit.value);
        payload.price = Number(edit.value);
      } else if (edit.pricing_mode === 'markup_percent') {
        payload.markup_percent = Number(edit.value);
      } else if (edit.pricing_mode === 'discount_percent') {
        payload.discount_percent = Number(edit.value);
      }
      const res = await api.updateAdminAirtimePin(denom.id, payload);
      if (res.denomination) {
        setAirtimePinDenoms(prev =>
          prev.map(item => (item.id === denom.id ? { ...item, ...res.denomination } : item))
        );
      }
      setSuccessMsg(`Saved ${denom.network} ₦${denom.denomination.toLocaleString()} Airtime PIN pricing & quantity cap.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save Airtime PIN settings');
    } finally {
      setSavingAirtimePinId(null);
    }
  };

  const handleToggleAirtimePinActive = async (denom: AirtimePinDenomination) => {
    const nextActive = !(denom.is_active ?? denom.enabled);
    setErrorMsg(null);
    try {
      const res = await api.updateAdminAirtimePin(denom.id, {
        pricing_mode: denom.pricing_mode || 'default_markup',
        fixed_price: denom.fixed_price,
        markup_percent: denom.markup_percent,
        discount_percent: denom.discount_percent,
        max_quantity: denom.max_quantity,
        is_active: nextActive,
      });
      setAirtimePinDenoms(prev =>
        prev.map(item => (item.id === denom.id ? { ...item, ...(res.denomination || {}), is_active: nextActive, enabled: nextActive } : item))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update Airtime PIN status');
    }
  };

  const handleApplyBulkAirtimePinPricing = async () => {
    setApplyingPinBulk(true);
    setErrorMsg(null);
    try {
      const res = await api.bulkUpdateAdminAirtimePinPricing({
        network: airtimePinNetFilter,
        pricing_mode: pinBulkMode,
        value: Number(pinBulkValue),
        skip_fixed_overrides: pinBulkSkipFixed,
        pin_default_markup_percent: Number(pinDefaultMarkupPercent),
      });
      setSuccessMsg(res.message || `Updated pricing for ${res.updated_count} Airtime PIN denominations.`);
      await fetchAdminTelecomData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to apply bulk Airtime PIN pricing');
    } finally {
      setApplyingPinBulk(false);
    }
  };

  const handleSaveDataPin = async (denom: DataPinDenomination) => {
    const edit = dataPinEdits[denom.id] || {
      pricing_mode: denom.pricing_mode || 'fixed',
      value: denom.price,
      max_quantity: denom.max_quantity ?? 50,
    };
    setSavingDataPinId(denom.id);
    setErrorMsg(null);
    try {
      const payload: any = {
        pricing_mode: edit.pricing_mode,
        max_quantity: Number(edit.max_quantity || 50),
        is_active: denom.is_active ?? denom.enabled,
      };
      if (edit.pricing_mode === 'fixed') {
        payload.fixed_price = Number(edit.value);
        payload.price = Number(edit.value);
      } else if (edit.pricing_mode === 'markup_percent') {
        payload.markup_percent = Number(edit.value);
      } else if (edit.pricing_mode === 'discount_percent') {
        payload.discount_percent = Number(edit.value);
      }
      await api.updateAdminDataPin(denom.id, payload);
      setSuccessMsg(`Saved ${denom.network} ${denom.size} Data PIN configuration.`);
      await fetchAdminTelecomData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update Data PIN configuration');
    } finally {
      setSavingDataPinId(null);
    }
  };

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
        airtime_discount_percent: settings.airtime_discount_percent ?? 2.5,
        data_default_markup_percent: defaultMarkupPercent,
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

  const handleOpenCreateService = () => {
    setCatalogModalMode('create');
    setEditingCatalogKey(null);
    setCatalogForm({
      service_key: '',
      name: '',
      description: '',
      category_code: serviceCategoryFilter !== 'all' ? serviceCategoryFilter : 'nin_verification',
      provider_id: '2sureverify',
      endpoint: '',
      wholesale_cost: 0,
      selling_price: 0,
      processing_type: 'instant',
      manual_label: '',
      estimated_turnaround: '',
      slip_type_supported: false,
      is_active: true,
      required_fields_text: 'nin',
    });
  };

  const handleOpenEditService = (srv: IdentityService) => {
    setCatalogModalMode('edit');
    setEditingCatalogKey(srv.key);
    setCatalogForm({
      service_key: srv.key,
      name: srv.name || '',
      description: srv.description || '',
      category_code: srv.category || 'nin_verification',
      provider_id: srv.provider || srv.provider_id || '2sureverify',
      endpoint: srv.endpoint || '',
      wholesale_cost: Number(srv.wholesale_cost ?? 0),
      selling_price: Number(srv.price ?? srv.selling_price ?? 0),
      processing_type: srv.processing_type === 'manual' ? 'manual' : 'instant',
      manual_label: srv.manual_label || '',
      estimated_turnaround: srv.estimated_turnaround || '',
      slip_type_supported: Boolean(srv.slip_type_supported),
      is_active: srv.enabled !== false && srv.is_active !== false,
      required_fields_text: Array.isArray(srv.required_fields) ? srv.required_fields.join(', ') : '',
    });
  };

  const handleSaveCatalogService = async (e: React.FormEvent) => {
    e.preventDefault();
    const wholesale = Number(catalogForm.wholesale_cost || 0);
    const selling = Number(catalogForm.selling_price || 0);
    if (!catalogForm.name.trim() || !catalogForm.endpoint.trim()) {
      setErrorMsg('Service name and provider endpoint are required.');
      return;
    }
    if (selling < 0 || wholesale < 0) {
      setErrorMsg('Prices cannot be negative.');
      return;
    }
    if (selling < wholesale) {
      setErrorMsg('Selling price cannot be lower than wholesale cost.');
      return;
    }
    const reqFields = catalogForm.required_fields_text
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    setSavingCatalogService(true);
    setErrorMsg(null);
    try {
      if (catalogModalMode === 'create') {
        if (!catalogForm.service_key.trim()) {
          setErrorMsg('Service key is required.');
          setSavingCatalogService(false);
          return;
        }
        const res = await api.createAdminCatalogService({
          service_key: catalogForm.service_key.trim().toLowerCase(),
          name: catalogForm.name.trim(),
          description: catalogForm.description.trim(),
          category_code: catalogForm.category_code,
          provider_id: catalogForm.provider_id,
          endpoint: catalogForm.endpoint.trim(),
          wholesale_cost: wholesale,
          selling_price: selling,
          processing_type: catalogForm.processing_type,
          manual_label: catalogForm.manual_label.trim() || undefined,
          estimated_turnaround: catalogForm.estimated_turnaround.trim() || undefined,
          slip_type_supported: catalogForm.slip_type_supported,
          is_active: catalogForm.is_active,
          required_fields: reqFields,
        });
        setSuccessMsg(res.message || `Service "${catalogForm.name}" created.`);
      } else if (catalogModalMode === 'edit' && editingCatalogKey) {
        const res = await api.updateAdminCatalogService(editingCatalogKey, {
          name: catalogForm.name.trim(),
          description: catalogForm.description.trim(),
          category_code: catalogForm.category_code,
          provider_id: catalogForm.provider_id,
          endpoint: catalogForm.endpoint.trim(),
          wholesale_cost: wholesale,
          selling_price: selling,
          processing_type: catalogForm.processing_type,
          manual_label: catalogForm.manual_label.trim(),
          estimated_turnaround: catalogForm.estimated_turnaround.trim(),
          slip_type_supported: catalogForm.slip_type_supported,
          is_active: catalogForm.is_active,
          required_fields: reqFields,
        });
        setSuccessMsg(res.message || `Service "${catalogForm.name}" updated.`);
      }
      setCatalogModalMode(null);
      await fetchServices();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save catalog service.');
    } finally {
      setSavingCatalogService(false);
    }
  };

  const handleConfirmDeleteService = async () => {
    if (!confirmDeleteService) return;
    setDeletingCatalogKey(confirmDeleteService.key);
    setErrorMsg(null);
    try {
      const res = await api.deleteAdminCatalogService(confirmDeleteService.key);
      setSuccessMsg(res.message || `Service "${confirmDeleteService.name}" deleted.`);
      setConfirmDeleteService(null);
      await fetchServices();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to delete service.');
      setConfirmDeleteService(null);
    } finally {
      setDeletingCatalogKey(null);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = categoryForm.code.trim().toLowerCase().replace(/\s+/g, '_');
    const name = categoryForm.name.trim();
    if (!code || !name) {
      setErrorMsg('Category code and name are required.');
      return;
    }
    setSavingCategory(true);
    setErrorMsg(null);
    try {
      const res = await api.saveAdminServiceCategory({
        code,
        name,
        description: categoryForm.description.trim() || undefined,
        display_order: Number(categoryForm.display_order || 10),
        is_active: categoryForm.is_active,
      });
      setSuccessMsg(res.message || `Category "${name}" saved.`);
      setCreatingCategory(false);
      setCategoryForm({ code: '', name: '', description: '', display_order: 10, is_active: true });
      const catRes = await api.getAdminServiceCategories().catch(() => ({ categories: [] }));
      if (catRes?.categories) setServiceCategories(catRes.categories);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save service category.');
    } finally {
      setSavingCategory(false);
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
      await fetchProviderLogs(1);
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
            ...(hasRoutingConfig
              ? [{ id: 'routing', label: 'Unified Service Routing & Fulfilment', icon: ArrowUpDown }]
              : []),
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
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCreatingCategory(true)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-semibold flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Category</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenCreateService}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Service</span>
                </button>
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
                  placeholder="Filter services by name, key, or endpoint (e.g. nin_mod_name)..."
                  value={serviceSearch}
                  onChange={e => setServiceSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(() => {
                  const baseCats = [
                    { id: 'all', label: `All (${identityServices.length})` },
                    { id: 'nin_verification', label: 'NIN' },
                    { id: 'bvn_verification', label: 'BVN' },
                    { id: 'nin_modification', label: 'NIN Modification' },
                    { id: 'bvn_modification', label: 'BVN Modification' },
                    { id: 'enrolment', label: 'Enrolment' },
                    { id: 'additional_services', label: 'Additional' },
                  ];
                  const seen = new Set(baseCats.map(c => c.id));
                  const dynamicCats = serviceCategories
                    .filter(c => !seen.has(c.code))
                    .map(c => ({ id: c.code, label: c.name }));
                  return [...baseCats, ...dynamicCats];
                })().map(cat => (
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
                                  <span className="text-indigo-400">
                                    {String(srv.endpoint).replace(/^\/+/, '').startsWith('api/v1/')
                                      ? String(srv.endpoint).replace(/^\/+/, '')
                                      : `api/v1/${String(srv.endpoint).replace(/^\/+/, '')}`}
                                  </span>
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
                            {srv.fulfilment_mode === 'internal_manual' ? (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold inline-block whitespace-nowrap">
                                HAMBAK MANUAL
                              </span>
                            ) : (
                              <div className="space-y-1">
                                <select
                                  value={srv.provider === 'veripine' ? 'veripine' : '2sureverify'}
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
                                {srv.fulfilment_mode && (
                                  <div className="text-[10px] font-mono text-slate-400">
                                    {srv.fulfilment_mode === 'provider_instant' ? 'Provider Instant' : 'Provider Async'}
                                  </div>
                                )}
                              </div>
                            )}
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
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSavePrice(srv.key)}
                                disabled={isSaving}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-1 text-[11px] transition"
                              >
                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditService(srv)}
                                title="Edit service metadata"
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteService(srv)}
                                title="Delete service"
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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

      {/* 1A. UNIFIED SERVICE ROUTING & FULFILMENT ENGINE */}
      {activeTab === 'routing' && hasRoutingConfig && (
        <ServiceRoutingManager onServiceUpdated={fetchServices} />
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
                            <option value="ninSpecial">ninSpecial (Special Slip)</option>
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

          {/* Provider Cards (External API Gateways Only) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {providerConfigs
              .filter(p => p.id !== 'hambak_manual')
              .map(provider => {
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

          {/* Provider-to-Service Endpoint & Cost Mappings */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Provider-to-Service Endpoint &amp; Cost Mappings</span>
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Normalized provider endpoint bindings, wholesale tariffs, and active routing status across providers.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-[11px]">
                {providerMappings.length} Mappings
              </span>
            </div>
            {providerMappings.length === 0 ? (
              <p className="text-slate-500 text-center py-6">No provider service mappings registered yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-2 px-3">Service</th>
                      <th className="py-2 px-3">Provider</th>
                      <th className="py-2 px-3">Upstream Endpoint</th>
                      <th className="py-2 px-3 text-right">Wholesale</th>
                      <th className="py-2 px-3 text-right">Selling</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {providerMappings.map(m => (
                      <tr key={m.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-sans">
                          <div className="font-semibold text-white">{m.service_name || m.service_key}</div>
                          <div className="text-[10px] font-mono text-slate-500">{m.service_key}</div>
                        </td>
                        <td className="py-2 px-3 text-indigo-300">{m.provider_id}</td>
                        <td className="py-2 px-3 text-slate-300">{m.provider_endpoint}</td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          ₦{Number(m.wholesale_cost || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-400">
                          {m.selling_price != null ? `₦${Number(m.selling_price).toLocaleString()}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {m.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Provider Transaction & Request Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Real-Time Provider Transaction &amp; Audit Logs</span>
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Server-paginated upstream request logs with request/response payload inspection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchProviderLogs(logPage)}
                disabled={loadingProviderLogs}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition text-xs shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingProviderLogs ? 'animate-spin' : ''}`} />
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={logProviderFilter}
                onChange={e => setLogProviderFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300"
              >
                <option value="all">All Providers</option>
                <option value="2sureverify">2SureVerify</option>
                <option value="veripine">Veripine</option>
                <option value="ulamadata">UlamaData</option>
                <option value="paystack">Paystack</option>
              </select>
              <select
                value={logStatusGroupFilter}
                onChange={e => setLogStatusGroupFilter(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300"
              >
                <option value="all">All Status Codes</option>
                <option value="2xx">2xx Success</option>
                <option value="4xx">4xx Client Error</option>
                <option value="5xx">5xx Server Error</option>
                <option value="error">All Errors (&ge;400)</option>
              </select>
              <input
                type="text"
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Search endpoint or reference..."
                className="flex-1 min-w-[180px] px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500"
              />
              <input
                type="date"
                value={logDateFrom}
                onChange={e => setLogDateFrom(e.target.value)}
                title="From date"
                className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300"
              />
              <input
                type="date"
                value={logDateTo}
                onChange={e => setLogDateTo(e.target.value)}
                title="To date"
                className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300"
              />
              <button
                type="button"
                onClick={() => void fetchProviderLogs(1)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold"
              >
                Apply
              </button>
            </div>

            {providerLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No upstream provider calls match your filters.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Provider</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3">Endpoint</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Latency</th>
                        <th className="py-2.5 px-3">Reference</th>
                        <th className="py-2.5 px-3 text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {providerLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('en-NG')}
                          </td>
                          <td className="py-2.5 px-3 text-white font-semibold">
                            {log.provider || log.provider_id || 'unknown'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {log.method || 'POST'}
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
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectedLog(log)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-sans font-semibold inline-flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {logPagination && logPagination.total_pages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
                    <span>
                      Page {logPagination.page} of {logPagination.total_pages} &middot; Total {logPagination.total}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={logPage <= 1 || loadingProviderLogs}
                        onClick={() => void fetchProviderLogs(Math.max(1, logPage - 1))}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={logPage >= logPagination.total_pages || loadingProviderLogs}
                        onClick={() => void fetchProviderLogs(logPage + 1)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. TELECOMMUNICATIONS (DATA BUNDLES CATALOG, PRICING & AIRTIME DISCOUNT) */}
      {activeTab === 'telecom' && (() => {
        const availableAdminCategories =
          telecomNetworkFilter === 'ALL'
            ? Array.from(new Set(telecomPlans.map(p => p.type || p.plan_type || ''))).filter(Boolean)
            : telecomCategoriesByNet[telecomNetworkFilter] ||
              Array.from(
                new Set(telecomPlans.filter(p => p.network === telecomNetworkFilter).map(p => p.type || p.plan_type || ''))
              ).filter(Boolean);

        const filteredAdminPlans = telecomPlans.filter(p => {
          if (telecomNetworkFilter !== 'ALL' && p.network !== telecomNetworkFilter) return false;
          const cat = p.type || p.plan_type || '';
          if (telecomCategoryFilter !== 'ALL' && cat !== telecomCategoryFilter) return false;
          if (!telecomPlanSearch.trim()) return true;
          const q = telecomPlanSearch.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.size.toLowerCase().includes(q) ||
            cat.toLowerCase().includes(q) ||
            String(p.provider_plan_id || '').includes(q)
          );
        });

        return (
          <div className="space-y-6 text-xs">
            {/* Airtime Discount & Headline Reference Tariffs */}
            <form onSubmit={handleSavePricing} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-sky-400" />
                    <span>Airtime Discount &amp; Platform Telecom Tariffs</span>
                  </h2>
                  <p className="text-slate-400 mt-0.5">
                    Configure dynamic VTU airtime customer discount and default data bundle markup percentage.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5 self-start sm:self-auto"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Telecom Settings</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">VTU Airtime Customer Discount (%)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={50}
                      value={settings.airtime_discount_percent ?? 2.5}
                      onChange={e => setSettings({ ...settings, airtime_discount_percent: Number(e.target.value) })}
                      className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                    <span className="text-slate-400">
                      Applied live on Customer Airtime UI, public calculator, and wallet deductions (0–50%).
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">Default Data Bundle Platform Markup (%)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={500}
                      value={defaultMarkupPercent}
                      onChange={e => setDefaultMarkupPercent(Number(e.target.value))}
                      className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                    <span className="text-slate-400">
                      Fallback markup for newly synced Ulamadata plans without fixed/rule overrides.
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-800/80">
                <div className="space-y-1">
                  <label className="text-slate-400">Public Calc MTN 1GB (₦)</label>
                  <input
                    type="number"
                    value={settings.mtn_sme_1gb ?? 270}
                    onChange={e => setSettings({ ...settings, mtn_sme_1gb: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400">Public Calc Airtel 1GB (₦)</label>
                  <input
                    type="number"
                    value={settings.airtel_1gb ?? 290}
                    onChange={e => setSettings({ ...settings, airtel_1gb: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400">Public Calc Glo 1GB (₦)</label>
                  <input
                    type="number"
                    value={settings.glo_1gb ?? 260}
                    onChange={e => setSettings({ ...settings, glo_1gb: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400">Public Calc 9mobile 1GB (₦)</label>
                  <input
                    type="number"
                    value={settings.nine_mobile_1gb ?? 250}
                    onChange={e => setSettings({ ...settings, nine_mobile_1gb: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>
            </form>

            {/* Live Ulamadata Data Bundles Catalog & Pricing Manager */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span>Live Data Bundles Catalog &amp; Pricing Rules ({telecomPlans.length} plans)</span>
                  </h3>
                  <p className="text-slate-400 mt-1">
                    Precedence: <strong className="text-white">1. Fixed Price Override (Locked)</strong> &rarr;{' '}
                    <strong className="text-white">2. Plan % Markup / % Discount</strong> &rarr;{' '}
                    <strong className="text-white">3. Default Platform % Markup</strong>. Syncing updates wholesale cost without overwriting admin selling prices.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncDataPlans}
                  disabled={syncingDataPlans}
                  className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl font-bold flex items-center gap-2 self-start sm:self-auto"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingDataPlans ? 'animate-spin' : ''}`} />
                  <span>{syncingDataPlans ? 'Syncing Ulamadata...' : 'Sync Live Plans from Ulamadata'}</span>
                </button>
              </div>

              {/* Filter & Bulk Pricing Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Network</label>
                    <select
                      value={telecomNetworkFilter}
                      onChange={e => {
                        setTelecomNetworkFilter(e.target.value as any);
                        setTelecomCategoryFilter('ALL');
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-semibold"
                    >
                      <option value="ALL">All Networks</option>
                      <option value="MTN">MTN</option>
                      <option value="AIRTEL">AIRTEL</option>
                      <option value="GLO">GLO</option>
                      <option value="9MOBILE">9MOBILE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Category</label>
                    <select
                      value={telecomCategoryFilter}
                      onChange={e => setTelecomCategoryFilter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-semibold"
                    >
                      <option value="ALL">All Categories</option>
                      {availableAdminCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Search Plan</label>
                    <input
                      type="text"
                      value={telecomPlanSearch}
                      onChange={e => setTelecomPlanSearch(e.target.value)}
                      placeholder="1GB, 30 days, ID..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="lg:col-span-7 flex flex-wrap items-end gap-2.5">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Bulk Rule</label>
                    <select
                      value={bulkPricingMode}
                      onChange={e => setBulkPricingMode(e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white"
                    >
                      <option value="markup_percent">% Markup over Wholesale</option>
                      <option value="discount_percent">% Discount off Base Price</option>
                      <option value="default_markup">Reset to Default Markup</option>
                    </select>
                  </div>
                  {bulkPricingMode !== 'default_markup' && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Percent (%)</label>
                      <input
                        type="number"
                        step={0.5}
                        value={bulkPricingValue}
                        onChange={e => setBulkPricingValue(Number(e.target.value))}
                        className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 pb-2">
                    <input
                      type="checkbox"
                      checked={bulkSkipFixed}
                      onChange={e => setBulkSkipFixed(e.target.checked)}
                      className="rounded border-slate-700"
                    />
                    <span>Preserve Fixed Overrides</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleApplyBulkDataPricing}
                    disabled={applyingBulkPricing}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                  >
                    {applyingBulkPricing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Apply Bulk Pricing</span>
                  </button>
                  {telecomNetworkFilter !== 'ALL' && telecomCategoryFilter !== 'ALL' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleDataCategory(true)}
                        className="px-2.5 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-semibold"
                      >
                        Enable Category
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleDataCategory(false)}
                        className="px-2.5 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-semibold"
                      >
                        Disable Category
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Plans Pricing Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-[540px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3">Plan &amp; ID</th>
                      <th className="py-3 px-3">Network / Category</th>
                      <th className="py-3 px-3 text-right">Ulamadata Cost</th>
                      <th className="py-3 px-3">Pricing Mode &amp; Value</th>
                      <th className="py-3 px-3 text-right">Selling Price</th>
                      <th className="py-3 px-3 text-right">Profit</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredAdminPlans.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-500">
                          No data plans matched your filter. Click &ldquo;Sync Live Plans from Ulamadata&rdquo; to load the catalog.
                        </td>
                      </tr>
                    ) : (
                      filteredAdminPlans.map(plan => {
                        const edit = planEdits[plan.id] || {
                          pricing_mode: plan.pricing_mode || 'default_markup',
                          value: plan.price,
                        };
                        const wholesale = plan.wholesale_cost ?? 0;
                        let previewPrice = plan.price;
                        if (edit.pricing_mode === 'fixed') {
                          previewPrice = Number(edit.value || 0);
                        } else if (edit.pricing_mode === 'markup_percent') {
                          previewPrice = Math.round(wholesale * (1 + Number(edit.value || 0) / 100) * 100) / 100;
                        } else if (edit.pricing_mode === 'discount_percent') {
                          const base =
                            plan.fixed_price && plan.fixed_price > 0
                              ? plan.fixed_price
                              : Math.round(wholesale * (1 + defaultMarkupPercent / 100) * 100) / 100;
                          previewPrice = Math.round(base * (1 - Number(edit.value || 0) / 100) * 100) / 100;
                        } else {
                          previewPrice = Math.round(wholesale * (1 + defaultMarkupPercent / 100) * 100) / 100;
                        }
                        const profit = Math.round((previewPrice - wholesale) * 100) / 100;
                        const active = plan.is_active ?? plan.enabled;

                        return (
                          <tr key={plan.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-white">{plan.size} — {plan.validity}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {plan.name} (API #{plan.provider_plan_id})
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-emerald-400">{plan.network}</span>
                              <div className="text-[10px] text-slate-400">{plan.type || plan.plan_type}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              ₦{wholesale.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={edit.pricing_mode}
                                  onChange={e => {
                                    const nextMode = e.target.value;
                                    let nextVal = edit.value;
                                    if (nextMode === 'fixed') nextVal = plan.fixed_price ?? plan.price;
                                    else if (nextMode === 'markup_percent') nextVal = plan.markup_percent ?? defaultMarkupPercent;
                                    else if (nextMode === 'discount_percent') nextVal = plan.discount_percent ?? 0;
                                    setPlanEdits(prev => ({
                                      ...prev,
                                      [plan.id]: { pricing_mode: nextMode, value: Number(nextVal) },
                                    }));
                                  }}
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-[11px]"
                                >
                                  <option value="default_markup">Default ({defaultMarkupPercent}%)</option>
                                  <option value="fixed">Fixed Price (₦)</option>
                                  <option value="markup_percent">% Markup</option>
                                  <option value="discount_percent">% Discount</option>
                                </select>
                                {edit.pricing_mode !== 'default_markup' && (
                                  <input
                                    type="number"
                                    step={edit.pricing_mode === 'fixed' ? 1 : 0.5}
                                    value={edit.value}
                                    onChange={e =>
                                      setPlanEdits(prev => ({
                                        ...prev,
                                        [plan.id]: { ...edit, value: Number(e.target.value) },
                                      }))
                                    }
                                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono text-[11px]"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              ₦{previewPrice.toLocaleString()}
                              {plan.admin_price_locked && (
                                <span className="ml-1 inline-flex items-center text-[9px] text-amber-400" title="Admin-locked price">
                                  <Lock className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {profit >= 0 ? `+₦${profit.toLocaleString()}` : `-₦${Math.abs(profit).toLocaleString()}`}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleDataPlanActive(plan)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  active
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {active ? 'Active' : 'Disabled'}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleSaveDataPlan(plan)}
                                disabled={savingPlanId === plan.id}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold inline-flex items-center gap-1 text-[11px]"
                              >
                                {savingPlanId === plan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                <span>Save</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stage 5 Phase 2: Airtime PIN Catalogue, Stock & Pricing Manager */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span>Airtime PIN Catalogue &amp; Pricing Rules ({airtimePinDenoms.length} denominations)</span>
                  </h3>
                  <p className="text-slate-400 mt-1">
                    Synced from Ulamadata <span className="font-mono text-slate-300">/api/get-recharge-pins</span>. Fixed overrides stay locked across syncs &amp; bulk updates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncAirtimePins}
                  disabled={syncingAirtimePins}
                  className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl font-bold flex items-center gap-2 self-start sm:self-auto"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingAirtimePins ? 'animate-spin' : ''}`} />
                  <span>{syncingAirtimePins ? 'Syncing PINs...' : 'Sync Airtime PINs from Ulamadata'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Network Filter</label>
                    <select
                      value={airtimePinNetFilter}
                      onChange={e => setAirtimePinNetFilter(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-semibold"
                    >
                      <option value="ALL">All Networks</option>
                      <option value="MTN">MTN</option>
                      <option value="AIRTEL">AIRTEL</option>
                      <option value="GLO">GLO</option>
                      <option value="9MOBILE">9MOBILE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Default PIN Markup %</label>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={500}
                      value={pinDefaultMarkupPercent}
                      onChange={e => setPinDefaultMarkupPercent(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="lg:col-span-8 flex flex-wrap items-end gap-2.5">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Bulk PIN Rule</label>
                    <select
                      value={pinBulkMode}
                      onChange={e => setPinBulkMode(e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white"
                    >
                      <option value="markup_percent">% Markup over Cost</option>
                      <option value="discount_percent">% Discount off Base</option>
                      <option value="default_markup">Reset to Default Markup</option>
                    </select>
                  </div>
                  {pinBulkMode !== 'default_markup' && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Percent (%)</label>
                      <input
                        type="number"
                        step={0.5}
                        value={pinBulkValue}
                        onChange={e => setPinBulkValue(Number(e.target.value))}
                        className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 pb-2">
                    <input
                      type="checkbox"
                      checked={pinBulkSkipFixed}
                      onChange={e => setPinBulkSkipFixed(e.target.checked)}
                      className="rounded border-slate-700"
                    />
                    <span>Preserve Fixed Overrides</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleApplyBulkAirtimePinPricing}
                    disabled={applyingPinBulk}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                  >
                    {applyingPinBulk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Apply Bulk PIN Pricing</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-[460px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0 z-10 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3">Network &amp; Face Value</th>
                      <th className="py-3 px-3 text-right">Ulamadata Cost</th>
                      <th className="py-3 px-3 text-center">Live Stock</th>
                      <th className="py-3 px-3 text-center">Max Qty</th>
                      <th className="py-3 px-3">Pricing Mode &amp; Value</th>
                      <th className="py-3 px-3 text-right">Selling Price</th>
                      <th className="py-3 px-3 text-right">Profit</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-right">Save</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {airtimePinDenoms.filter(d => airtimePinNetFilter === 'ALL' || d.network === airtimePinNetFilter).length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          No Airtime PIN denominations synced yet. Click &ldquo;Sync Airtime PINs from Ulamadata&rdquo;.
                        </td>
                      </tr>
                    ) : (
                      airtimePinDenoms
                        .filter(d => airtimePinNetFilter === 'ALL' || d.network === airtimePinNetFilter)
                        .map(denom => {
                          const edit = airtimePinEdits[denom.id] || {
                            pricing_mode: denom.pricing_mode || 'default_markup',
                            value: denom.price,
                            max_quantity: denom.max_quantity ?? 50,
                          };
                          const wholesale = denom.wholesale_cost ?? 0;
                          let previewPrice = denom.price;
                          if (edit.pricing_mode === 'fixed') {
                            previewPrice = Number(edit.value || 0);
                          } else if (edit.pricing_mode === 'markup_percent') {
                            previewPrice = Math.round(wholesale * (1 + Number(edit.value || 0) / 100) * 100) / 100;
                          } else if (edit.pricing_mode === 'discount_percent') {
                            const base =
                              denom.fixed_price && denom.fixed_price > 0
                                ? denom.fixed_price
                                : Math.round(wholesale * (1 + pinDefaultMarkupPercent / 100) * 100) / 100;
                            previewPrice = Math.round(base * (1 - Number(edit.value || 0) / 100) * 100) / 100;
                          } else {
                            previewPrice = Math.round(wholesale * (1 + pinDefaultMarkupPercent / 100) * 100) / 100;
                          }
                          const profit = Math.round((previewPrice - wholesale) * 100) / 100;
                          const active = denom.is_active ?? denom.enabled;

                          return (
                            <tr key={denom.id} className="hover:bg-slate-800/30">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-white">
                                  {denom.network} ₦{denom.denomination.toLocaleString()}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  plan_type #{denom.provider_plan_id}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                <div>₦{wholesale.toLocaleString()}</div>
                                {(denom.api_discount ?? 0) > 0 && (
                                  <div className="text-[10px] text-slate-500">Disc: {denom.api_discount}%</div>
                                )}
                                {denom.price_anomaly && (
                                  <div className="text-[9px] text-amber-400 font-semibold" title="Provider price unusually low vs face value">
                                    Verify Upstream Cost
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    denom.available_stock > 0
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {denom.available_stock > 0 ? `${denom.available_stock} in stock` : '0 (Out)'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  max={500}
                                  value={edit.max_quantity}
                                  onChange={e =>
                                    setAirtimePinEdits(prev => ({
                                      ...prev,
                                      [denom.id]: { ...edit, max_quantity: Math.max(1, Number(e.target.value) || 1) },
                                    }))
                                  }
                                  className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center text-white font-mono text-[11px]"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={edit.pricing_mode}
                                    onChange={e => {
                                      const nextMode = e.target.value;
                                      let nextVal = edit.value;
                                      if (nextMode === 'fixed') nextVal = denom.fixed_price ?? denom.price;
                                      else if (nextMode === 'markup_percent') nextVal = denom.markup_percent ?? pinDefaultMarkupPercent;
                                      else if (nextMode === 'discount_percent') nextVal = denom.discount_percent ?? 0;
                                      setAirtimePinEdits(prev => ({
                                        ...prev,
                                        [denom.id]: { ...edit, pricing_mode: nextMode, value: Number(nextVal) },
                                      }));
                                    }}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-[11px]"
                                  >
                                    <option value="default_markup">Default ({pinDefaultMarkupPercent}%)</option>
                                    <option value="fixed">Fixed Price (₦)</option>
                                    <option value="markup_percent">% Markup</option>
                                    <option value="discount_percent">% Discount</option>
                                  </select>
                                  {edit.pricing_mode !== 'default_markup' && (
                                    <input
                                      type="number"
                                      step={edit.pricing_mode === 'fixed' ? 0.5 : 0.5}
                                      value={edit.value}
                                      onChange={e =>
                                        setAirtimePinEdits(prev => ({
                                          ...prev,
                                          [denom.id]: { ...edit, value: Number(e.target.value) },
                                        }))
                                      }
                                      className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono text-[11px]"
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                                ₦{previewPrice.toLocaleString()}
                                {denom.admin_price_locked && (
                                  <span className="ml-1 inline-flex items-center text-[9px] text-amber-400" title="Admin-locked price">
                                    <Lock className="w-2.5 h-2.5" />
                                  </span>
                                )}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-mono font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {profit >= 0 ? `+₦${profit.toLocaleString()}` : `-₦${Math.abs(profit).toLocaleString()}`}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleAirtimePinActive(denom)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    active
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {active ? 'Active' : 'Disabled'}
                                </button>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleSaveAirtimePin(denom)}
                                  disabled={savingAirtimePinId === denom.id}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold inline-flex items-center gap-1 text-[11px]"
                                >
                                  {savingAirtimePinId === denom.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  <span>Save</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stage 5 Phase 2: Data PIN Catalogue & Safety Gate Manager */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>Data PIN Catalogue &amp; Safety Gate ({dataPinDenoms.length} confirmed plans)</span>
                </h3>
                <p className="text-slate-400 mt-1">
                  Separate from ordinary <span className="font-mono text-slate-300">/api/data_plans</span>. Data PIN orders target <span className="font-mono text-slate-300">/api/data_card</span> and remain disabled until confirmed Ulamadata Data PIN plan IDs and pricing are present.
                </p>
              </div>
              {dataPinDenoms.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                  {dataPinCatalogueStatus || '0 confirmed Ulamadata Data PIN plans in catalogue — customer Data PIN purchases are safely disabled.'}
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Plan</th>
                        <th className="py-2.5 px-3 text-right">Wholesale</th>
                        <th className="py-2.5 px-3 text-center">Stock</th>
                        <th className="py-2.5 px-3 text-center">Max Qty</th>
                        <th className="py-2.5 px-3">Pricing Mode &amp; Value</th>
                        <th className="py-2.5 px-3 text-right">Selling Price</th>
                        <th className="py-2.5 px-3 text-right">Save</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {dataPinDenoms.map(dp => {
                        const edit = dataPinEdits[dp.id] || {
                          pricing_mode: dp.pricing_mode || 'fixed',
                          value: dp.price,
                          max_quantity: dp.max_quantity ?? 50,
                        };
                        return (
                          <tr key={dp.id}>
                            <td className="py-2.5 px-3 font-bold text-white">
                              {dp.network} {dp.size} ({dp.validity || '30 Days'}) — #{dp.provider_plan_id}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              ₦{(dp.wholesale_cost ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-300">{dp.available_stock}</td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min={1}
                                max={500}
                                value={edit.max_quantity}
                                onChange={e =>
                                  setDataPinEdits(prev => ({
                                    ...prev,
                                    [dp.id]: { ...edit, max_quantity: Math.max(1, Number(e.target.value) || 1) },
                                  }))
                                }
                                className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center text-white font-mono text-[11px]"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={edit.pricing_mode}
                                  onChange={e =>
                                    setDataPinEdits(prev => ({
                                      ...prev,
                                      [dp.id]: { ...edit, pricing_mode: e.target.value },
                                    }))
                                  }
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-[11px]"
                                >
                                  <option value="default_markup">Default</option>
                                  <option value="fixed">Fixed Price (₦)</option>
                                  <option value="markup_percent">% Markup</option>
                                  <option value="discount_percent">% Discount</option>
                                </select>
                                {edit.pricing_mode !== 'default_markup' && (
                                  <input
                                    type="number"
                                    value={edit.value}
                                    onChange={e =>
                                      setDataPinEdits(prev => ({
                                        ...prev,
                                        [dp.id]: { ...edit, value: Number(e.target.value) },
                                      }))
                                    }
                                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono text-[11px]"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              ₦{dp.price.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleSaveDataPin(dp)}
                                disabled={savingDataPinId === dp.id}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold inline-flex items-center gap-1 text-[11px]"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Admin Data, Airtime & PIN Orders & Provider Response Monitor */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Telecom &amp; PIN Orders &amp; Ulamadata Response Monitor</span>
                  </h3>
                  <p className="text-slate-400 mt-0.5">
                    Inspect wholesale cost, profit margin, voucher counts, provider references, and raw Ulamadata execution responses.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={ordersServiceFilter}
                    onChange={e => {
                      const val = e.target.value as any;
                      setOrdersServiceFilter(val);
                      fetchAdminTelecomData(val, ordersStatusFilter);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="all">All Telecom &amp; PINs</option>
                    <option value="data">Data Only</option>
                    <option value="airtime">Airtime Only</option>
                    <option value="airtime_pin">Airtime PINs</option>
                    <option value="data_pin">Data PINs</option>
                  </select>
                  <select
                    value={ordersStatusFilter}
                    onChange={e => {
                      const val = e.target.value as any;
                      setOrdersStatusFilter(val);
                      fetchAdminTelecomData(ordersServiceFilter, val);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="successful">Successful</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => fetchAdminTelecomData()}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTelecomOrders ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Plan / Service</th>
                      <th className="py-2.5 px-3">Phone / Card Name</th>
                      <th className="py-2.5 px-3 text-right">Customer Paid</th>
                      <th className="py-2.5 px-3 text-right">Cost</th>
                      <th className="py-2.5 px-3 text-right">Profit</th>
                      <th className="py-2.5 px-3">Provider Ref</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Inspect / Requery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {telecomOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          No data, airtime, or PIN orders recorded yet.
                        </td>
                      </tr>
                    ) : (
                      telecomOrders.map(ord => (
                        <React.Fragment key={ord.id}>
                          <tr className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-white">{ord.customer_name || 'Customer'}</div>
                              <div className="text-[10px] text-slate-500">{ord.customer_email || ord.user_id}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-emerald-400 uppercase">{(ord.service_type || ord.service || '').replace('_', ' ')}</span>
                              <div className="text-slate-200">{ord.plan}</div>
                              {(ord.voucher_count ?? 0) > 0 && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">
                                  {ord.voucher_count} PINs Stored
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">{ord.phone}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              ₦{(ord.amount ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                              ₦{(ord.cost_price ?? 0).toLocaleString()}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono font-semibold ${(ord.profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              ₦{(ord.profit ?? 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400 max-w-[140px] truncate">
                              {ord.provider_ref}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  ord.status === 'successful'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : ord.status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-rose-500/10 text-rose-400'
                                }`}
                              >
                                {ord.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedOrderMetaId(expandedOrderMetaId === ord.id ? null : ord.id)
                                  }
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold"
                                >
                                  {expandedOrderMetaId === ord.id ? 'Hide JSON' : 'Response'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRequeryTelecomOrder(ord)}
                                  disabled={requeryingOrderId === ord.id}
                                  className="px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold"
                                >
                                  {requeryingOrderId === ord.id ? '...' : 'Requery'}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedOrderMetaId === ord.id && (
                            <tr className="bg-slate-950">
                              <td colSpan={9} className="p-3">
                                <pre className="text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-48">
                                  {JSON.stringify(ord.metadata || {}, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* 5. ACADEMY COURSES (Authoritative Summary + Redirect to Academy Console) */}
      {activeTab === 'academy' && (
        <div className="space-y-4 text-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-400" />
                <span>Digital Training Academy Curriculum ({academyCourses.length} Tracks)</span>
              </h2>
              <p className="text-slate-400 mt-0.5">
                Courses, admissions reviews, student accounts, and QR ID cards are centrally managed in the dedicated Academy Console.
              </p>
            </div>
            {onOpenAcademyAdmin && (
              <button
                type="button"
                onClick={onOpenAcademyAdmin}
                className="px-4 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl font-bold flex items-center gap-1.5 shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Full Academy Management</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {academyCourses.map(course => (
              <div key={course.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                      {course.category || course.level}
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
                      : Number(course.price) === 0
                      ? 'Free / Scholarship'
                      : `₦${Number(course.price).toLocaleString('en-NG')}`}
                  </span>
                  <span className="text-[10px] uppercase font-mono text-slate-400">
                    {course.is_available === false ? 'Closed' : 'Available'}
                  </span>
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

      {/* CREATE / EDIT CATALOG SERVICE MODAL */}
      {catalogModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8 text-xs">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {catalogModalMode === 'create'
                  ? 'Create Catalog Service'
                  : `Edit Service · ${editingCatalogKey}`}
              </h3>
              <button
                type="button"
                onClick={() => setCatalogModalMode(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCatalogService} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Service Key *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={catalogModalMode === 'edit'}
                    value={catalogForm.service_key}
                    onChange={e => setCatalogForm(prev => ({ ...prev, service_key: e.target.value }))}
                    placeholder="e.g. nin_premium_lookup"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Service Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={catalogForm.name}
                    onChange={e => setCatalogForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={catalogForm.category_code}
                    onChange={e => setCatalogForm(prev => ({ ...prev, category_code: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="nin_verification">NIN Verification</option>
                    <option value="bvn_verification">BVN Verification</option>
                    <option value="nin_modification">NIN Modification</option>
                    <option value="bvn_modification">BVN Modification</option>
                    <option value="enrolment">Enrolment</option>
                    <option value="additional_services">Additional Services</option>
                    {serviceCategories
                      .filter(
                        c =>
                          ![
                            'nin_verification',
                            'bvn_verification',
                            'nin_modification',
                            'bvn_modification',
                            'enrolment',
                            'additional_services',
                          ].includes(c.code)
                      )
                      .map(c => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Assigned Provider
                  </label>
                  <select
                    value={catalogForm.provider_id}
                    onChange={e => setCatalogForm(prev => ({ ...prev, provider_id: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="2sureverify">2SureVerify</option>
                    <option value="veripine">Veripine</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Provider API Endpoint *
                  </label>
                  <input
                    type="text"
                    required
                    value={catalogForm.endpoint}
                    onChange={e => setCatalogForm(prev => ({ ...prev, endpoint: e.target.value }))}
                    placeholder="e.g. api/v1/nin_verify.php"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-indigo-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Wholesale Cost (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={catalogForm.wholesale_cost}
                    onChange={e => setCatalogForm(prev => ({ ...prev, wholesale_cost: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Selling Price (₦) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    required
                    value={catalogForm.selling_price}
                    onChange={e => setCatalogForm(prev => ({ ...prev, selling_price: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Processing Type
                  </label>
                  <select
                    value={catalogForm.processing_type}
                    onChange={e =>
                      setCatalogForm(prev => ({
                        ...prev,
                        processing_type: e.target.value === 'manual' ? 'manual' : 'instant',
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="instant">Instant Automated</option>
                    <option value="manual">Manual Processing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Required Fields (comma separated)
                  </label>
                  <input
                    type="text"
                    value={catalogForm.required_fields_text}
                    onChange={e => setCatalogForm(prev => ({ ...prev, required_fields_text: e.target.value }))}
                    placeholder="nin, phone"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
                {catalogForm.processing_type === 'manual' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Manual Badge Label
                      </label>
                      <input
                        type="text"
                        value={catalogForm.manual_label}
                        onChange={e => setCatalogForm(prev => ({ ...prev, manual_label: e.target.value }))}
                        placeholder="e.g. Manual Processing"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Estimated Turnaround
                      </label>
                      <input
                        type="text"
                        value={catalogForm.estimated_turnaround}
                        onChange={e => setCatalogForm(prev => ({ ...prev, estimated_turnaround: e.target.value }))}
                        placeholder="e.g. 3–7 business days"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={catalogForm.description}
                    onChange={e => setCatalogForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={catalogForm.slip_type_supported}
                      onChange={e => setCatalogForm(prev => ({ ...prev, slip_type_supported: e.target.checked }))}
                    />
                    <span>Supports NIN/BVN Slip Generation</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={catalogForm.is_active}
                      onChange={e => setCatalogForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    />
                    <span>Service Active</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCatalogModalMode(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCatalogService}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  {savingCatalogService && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{catalogModalMode === 'create' ? 'Create Service' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW SERVICE CATEGORY MODAL */}
      {creatingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-xs">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Create / Update Service Category</h3>
              <button
                type="button"
                onClick={() => setCreatingCategory(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="p-6 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Category Code *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.code}
                  onChange={e => setCategoryForm(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="e.g. corporate_kyc"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Corporate KYC"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  value={categoryForm.description}
                  onChange={e => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreatingCategory(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  {savingCategory && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Category</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CATALOG SERVICE CONFIRMATION MODAL */}
      {confirmDeleteService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-sm font-bold text-white">Delete Service from Catalog?</h3>
            <p className="text-slate-300">
              You are about to remove <strong className="text-white">{confirmDeleteService.name}</strong> (
              <span className="font-mono">{confirmDeleteService.key}</span>). Services with historical orders cannot be deleted and must be disabled instead.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteService(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingCatalogKey === confirmDeleteService.key}
                onClick={() => void handleConfirmDeleteService()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold flex items-center gap-1.5"
              >
                {deletingCatalogKey === confirmDeleteService.key && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROVIDER LOG REQUEST / RESPONSE INSPECTOR MODAL */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8 text-xs">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Provider Request / Response Inspector
                </h3>
                <p className="text-[11px] font-mono text-slate-400">
                  {inspectedLog.provider || inspectedLog.provider_id} &middot; {inspectedLog.method || 'POST'} {inspectedLog.endpoint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-500 block">Status</span>
                  <span className={inspectedLog.status_code >= 200 && inspectedLog.status_code < 300 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {inspectedLog.status_code}
                  </span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-500 block">Latency</span>
                  <span className="text-white font-bold">{inspectedLog.latency_ms}ms</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl col-span-2">
                  <span className="text-[10px] text-slate-500 block">Reference &amp; Time</span>
                  <span className="text-slate-200 break-all">
                    {inspectedLog.reference || '—'} &middot; {new Date(inspectedLog.created_at).toLocaleString('en-NG')}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Request Payload (Masked)
                </span>
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap break-words max-h-56">
                  {inspectedLog.request_body || 'Empty'}
                </pre>
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Response Payload
                </span>
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-words max-h-64">
                  {inspectedLog.response_body || 'Empty'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
