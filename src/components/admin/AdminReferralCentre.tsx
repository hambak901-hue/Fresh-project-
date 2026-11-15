import React, { useEffect, useState } from 'react';
import {
  Gift,
  Sliders,
  Megaphone,
  Award,
  CheckSquare,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit3,
  ShieldCheck,
  Clock,
  Search,
  Check,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  ReferralAdminSettings,
  ReferralCampaign,
  ReferralTier,
  ReferralRewardItem,
} from '../../types';

type SubTab = 'rules' | 'campaigns' | 'tiers' | 'rewards';

const ELIGIBLE_SERVICE_LABELS: Record<string, string> = {
  telecom_data: 'Telecom Data Plans',
  telecom_airtime: 'Telecom Airtime VTU',
  telecom_pin: 'Airtime & Data ePINs',
  telecom_bills: 'Cable TV & Electricity Bills',
  nin_verification: 'NIN Verification Slips',
  bvn_verification: 'BVN Verification Reports',
  modification: 'NIN & BVN Modifications',
  enrolment: 'NIN Enrolment Services',
};

const REWARD_MODELS = [
  { value: 'fixed', label: 'Fixed Naira Bonus per Qualifying Tx' },
  { value: 'percent_of_spend', label: 'Percentage of Customer Spend (%)' },
  { value: 'percent_of_margin', label: 'Percentage of Net Profit Margin (%)' },
  { value: 'milestone', label: 'Milestone Bonus' },
  { value: 'points', label: 'Loyalty Points Only' },
  { value: 'campaign', label: 'Active Campaign Rule' },
  { value: 'tier', label: 'Tier-Weighted Percentage' },
  { value: 'hybrid', label: 'Hybrid (Cash + Loyalty Points)' },
];

export function AdminReferralCentre() {
  const [activeTab, setActiveTab] = useState<SubTab>('rules');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [summary, setSummary] = useState<{
    total_referrals: number;
    qualified_referrals: number;
    total_available_liability: number;
    total_pending_liability: number;
    total_reserved_liability: number;
    total_rewards_issued: number;
    open_withdrawals: number;
  } | null>(null);

  const [settings, setSettings] = useState<ReferralAdminSettings | null>(null);
  const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([]);
  const [tiers, setTiers] = useState<ReferralTier[]>([]);
  const [rewards, setRewards] = useState<ReferralRewardItem[]>([]);
  const [rewardFilterStatus, setRewardFilterStatus] = useState<string>('all');
  const [rewardSearch, setRewardSearch] = useState<string>('');
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  // Campaign Modal/Form State
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    slug: '',
    description: '',
    reward_model: 'fixed',
    reward_value: 100,
    bonus_points: 10,
    min_spend: 500,
    starts_at: '',
    ends_at: '',
    max_redemptions: '',
    is_active: true,
  });
  const [savingCampaign, setSavingCampaign] = useState(false);

  // Tier Form State
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [showTierForm, setShowTierForm] = useState(false);
  const [tierForm, setTierForm] = useState({
    name: '',
    slug: '',
    min_referred_users: 5,
    min_referred_revenue: 10000,
    commission_multiplier: 1.25,
    fixed_bonus: 0,
    points_multiplier: 1.5,
    is_active: true,
  });
  const [savingTier, setSavingTier] = useState(false);

  // Reward moderation reason modal
  const [modModal, setModModal] = useState<{
    reward: ReferralRewardItem;
    action: 'approve' | 'reject' | 'reverse';
  } | null>(null);
  const [modReason, setModReason] = useState('');

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminReferralOverview();
      if (res && res.success) {
        setSettings(res.settings);
        setCampaigns(res.campaigns || []);
        setTiers(res.tiers || []);
        setSummary(res.summary);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to load referral engine overview.' });
    } finally {
      setLoading(false);
    }
  };

  const loadRewards = async (status = rewardFilterStatus, search = rewardSearch) => {
    setLoadingRewards(true);
    try {
      const res = await api.listAdminReferralRewards({ status, search });
      if (res && res.success) {
        setRewards(res.rewards || []);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to fetch referral rewards ledger.' });
    } finally {
      setLoadingRewards(false);
    }
  };

  useEffect(() => {
    loadOverview();
    loadRewards();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingConfig(true);
    setFeedback(null);
    try {
      const res = await api.updateAdminReferralConfig(settings);
      if (res?.settings) {
        setSettings(res.settings);
      }
      setFeedback({
        type: 'success',
        message: res?.message || 'Referral rules, caps, and margin protection settings saved.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save referral settings.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const openNewCampaign = () => {
    setEditingCampaignId(null);
    setCampaignForm({
      name: '',
      slug: '',
      description: '',
      reward_model: 'fixed',
      reward_value: 150,
      bonus_points: 15,
      min_spend: 500,
      starts_at: '',
      ends_at: '',
      max_redemptions: '',
      is_active: true,
    });
    setShowCampaignForm(true);
  };

  const openEditCampaign = (c: ReferralCampaign) => {
    setEditingCampaignId(c.id);
    setCampaignForm({
      name: c.name || '',
      slug: c.slug || '',
      description: c.description || '',
      reward_model: c.reward_model || 'fixed',
      reward_value: Number(c.reward_value || 0),
      bonus_points: Number(c.bonus_points || 0),
      min_spend: Number(c.min_spend || 0),
      starts_at: c.starts_at ? String(c.starts_at).slice(0, 16) : '',
      ends_at: c.ends_at ? String(c.ends_at).slice(0, 16) : '',
      max_redemptions: c.max_redemptions ? String(c.max_redemptions) : '',
      is_active: Boolean(c.is_active),
    });
    setShowCampaignForm(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCampaign(true);
    setFeedback(null);
    try {
      const payload: Partial<ReferralCampaign> = {
        name: campaignForm.name.trim(),
        slug: campaignForm.slug.trim(),
        description: campaignForm.description.trim(),
        reward_model: campaignForm.reward_model,
        reward_value: Number(campaignForm.reward_value),
        bonus_points: Number(campaignForm.bonus_points),
        min_spend: Number(campaignForm.min_spend),
        starts_at: campaignForm.starts_at || null,
        ends_at: campaignForm.ends_at || null,
        max_redemptions: campaignForm.max_redemptions ? Number(campaignForm.max_redemptions) : null,
        is_active: campaignForm.is_active,
      };
      const res = await api.saveAdminReferralCampaign(payload, editingCampaignId || undefined);
      setFeedback({ type: 'success', message: res.message || 'Campaign saved.' });
      setShowCampaignForm(false);
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save campaign.' });
    } finally {
      setSavingCampaign(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    setActionLoadingId(id);
    try {
      await api.deleteAdminReferralCampaign(id);
      setFeedback({ type: 'success', message: 'Campaign deleted.' });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to delete campaign.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const openNewTier = () => {
    setEditingTierId(null);
    setTierForm({
      name: '',
      slug: '',
      min_referred_users: 10,
      min_referred_revenue: 25000,
      commission_multiplier: 1.5,
      fixed_bonus: 50,
      points_multiplier: 1.5,
      is_active: true,
    });
    setShowTierForm(true);
  };

  const openEditTier = (t: ReferralTier) => {
    setEditingTierId(t.id);
    setTierForm({
      name: t.name || '',
      slug: t.slug || '',
      min_referred_users: Number(t.min_referred_users || 0),
      min_referred_revenue: Number(t.min_referred_revenue || 0),
      commission_multiplier: Number(t.commission_multiplier || 1),
      fixed_bonus: Number(t.fixed_bonus || 0),
      points_multiplier: Number(t.points_multiplier || 1),
      is_active: Boolean(t.is_active),
    });
    setShowTierForm(true);
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTier(true);
    setFeedback(null);
    try {
      const res = await api.saveAdminReferralTier(
        {
          name: tierForm.name.trim(),
          slug: tierForm.slug.trim(),
          min_referred_users: Number(tierForm.min_referred_users),
          min_referred_revenue: Number(tierForm.min_referred_revenue),
          commission_multiplier: Number(tierForm.commission_multiplier),
          fixed_bonus: Number(tierForm.fixed_bonus),
          points_multiplier: Number(tierForm.points_multiplier),
          is_active: tierForm.is_active,
        },
        editingTierId || undefined
      );
      setFeedback({ type: 'success', message: res.message || 'Loyalty tier saved.' });
      setShowTierForm(false);
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save loyalty tier.' });
    } finally {
      setSavingTier(false);
    }
  };

  const handleDeleteTier = async (id: string) => {
    setActionLoadingId(id);
    try {
      await api.deleteAdminReferralTier(id);
      setFeedback({ type: 'success', message: 'Tier deleted.' });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete tier.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSettlementSweep = async (forceAll: boolean) => {
    setSweeping(true);
    setFeedback(null);
    try {
      const res = await api.runAdminReferralSettlementSweep(forceAll);
      setFeedback({
        type: 'success',
        message:
          res.message ||
          `Settlement sweep complete: ${res.settled_count} rewards released (₦${Number(res.settled_amount || 0).toLocaleString()}).`,
      });
      await Promise.all([loadOverview(), loadRewards()]);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Settlement sweep failed.' });
    } finally {
      setSweeping(false);
    }
  };

  const confirmRewardModeration = async () => {
    if (!modModal) return;
    setActionLoadingId(modModal.reward.id);
    setFeedback(null);
    try {
      const res = await api.actionAdminReferralReward(modModal.reward.id, modModal.action, modReason.trim());
      setFeedback({ type: 'success', message: res.message || 'Reward status updated.' });
      setModModal(null);
      setModReason('');
      await Promise.all([loadOverview(), loadRewards()]);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update reward status.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading && !settings) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-indigo-400" />
        <p className="text-xs font-medium">Loading Referral &amp; Rewards Engine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Gift className="w-3.5 h-3.5" />
            <span>Dynamic Referral &amp; Growth Governance</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Referral, Rewards &amp; Loyalty Control Centre
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure reward models, margin-protection floors, velocity caps, seasonal campaigns, loyalty tiers, and settlement holds without code changes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            loadOverview();
            loadRewards();
          }}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 self-start md:self-center transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Engine</span>
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Referrals</p>
            <p className="text-xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">{summary.total_referrals}</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Qualified</p>
            <p className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {summary.qualified_referrals}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Rewards Issued</p>
            <p className="text-xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              ₦{Number(summary.total_rewards_issued || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Available Liability</p>
            <p className="text-xl font-extrabold font-mono text-slate-900 dark:text-white mt-1">
              ₦{Number(summary.total_available_liability || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Pending Hold</p>
            <p className="text-xl font-extrabold font-mono text-amber-600 dark:text-amber-400 mt-1">
              ₦{Number(summary.total_pending_liability || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Open Withdrawals</p>
            <p className="text-xl font-extrabold font-mono text-blue-600 dark:text-blue-400 mt-1">
              {summary.open_withdrawals}
            </p>
          </div>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'rules' as SubTab, label: 'Engine Rules & Caps', icon: Sliders },
          { id: 'campaigns' as SubTab, label: `Campaigns (${campaigns.length})`, icon: Megaphone },
          { id: 'tiers' as SubTab, label: `Loyalty Tiers (${tiers.length})`, icon: Award },
          { id: 'rewards' as SubTab, label: `Reward Moderation & Hold (${rewards.length})`, icon: CheckSquare },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition ${
                active
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ENGINE RULES & CAPS */}
      {activeTab === 'rules' && settings && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Master Toggle + Reward Model */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Programme Activation &amp; Reward Model</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Control overall referral reward accruals and primary calculation formula.
                </p>
              </div>
              <label className="inline-flex items-center gap-2.5 cursor-pointer px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {settings.enabled ? 'Referral Engine ACTIVE' : 'Referral Engine PAUSED'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Reward Model
                </label>
                <select
                  value={settings.reward_model}
                  onChange={(e) => setSettings({ ...settings, reward_model: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                >
                  {REWARD_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Fixed Reward (₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.fixed_reward_amount}
                  onChange={(e) => setSettings({ ...settings, fixed_reward_amount: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  % of Spend Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.percent_of_spend_rate}
                  onChange={(e) => setSettings({ ...settings, percent_of_spend_rate: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  % of Net Margin Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.percent_of_margin_rate}
                  onChange={(e) => setSettings({ ...settings, percent_of_margin_rate: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Points per Qualifying Tx
                </label>
                <input
                  type="number"
                  value={settings.points_per_qualifying_tx}
                  onChange={(e) => setSettings({ ...settings, points_per_qualifying_tx: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  1 Point = Naira Value (₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.points_to_naira_rate}
                  onChange={(e) => setSettings({ ...settings, points_to_naira_rate: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Min Points to Redeem
                </label>
                <input
                  type="number"
                  value={settings.min_points_to_convert}
                  onChange={(e) => setSettings({ ...settings, min_points_to_convert: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Margin Protection & Fraud Caps */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Margin Protection, Velocity Caps &amp; Hold Rules</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Rewards are automatically capped or suppressed if net margin after provider cost drops below your configured profit floor.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Min Qualifying Spend (₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.min_qualifying_spend}
                  onChange={(e) => setSettings({ ...settings, min_qualifying_spend: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Min Net Margin Floor (₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.min_net_margin_floor}
                  onChange={(e) => setSettings({ ...settings, min_net_margin_floor: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Max Reward per Tx (₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.max_reward_per_tx}
                  onChange={(e) => setSettings({ ...settings, max_reward_per_tx: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Max Daily Cap / Referrer (₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.max_daily_reward_per_referrer}
                  onChange={(e) => setSettings({ ...settings, max_daily_reward_per_referrer: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Max Monthly Cap / Referrer (₦)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.max_monthly_reward_per_referrer}
                  onChange={(e) => setSettings({ ...settings, max_monthly_reward_per_referrer: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Max Recurring Tx / Referee
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.max_recurring_tx_count}
                  onChange={(e) => setSettings({ ...settings, max_recurring_tx_count: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Settlement Hold Window (Hours)
                </label>
                <input
                  type="number"
                  min={0}
                  value={settings.settlement_hold_hours}
                  onChange={(e) => setSettings({ ...settings, settlement_hold_hours: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.first_purchase_only}
                  onChange={(e) => setSettings({ ...settings, first_purchase_only: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <span>First Qualifying Purchase Only per Referred Customer</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_approve_after_hold}
                  onChange={(e) => setSettings({ ...settings, auto_approve_after_hold: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <span>Auto-Release Pending Rewards After Hold Window</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.reseller_eligible}
                  onChange={(e) => setSettings({ ...settings, reseller_eligible: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <span>Agent / Reseller Accounts Eligible</span>
              </label>
            </div>
          </div>

          {/* Payout & Wallet Conversion Rules */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Wallet Conversion &amp; Bank Withdrawal Rules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.wallet_conversion_enabled}
                    onChange={(e) => setSettings({ ...settings, wallet_conversion_enabled: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Allow Wallet Conversion</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.min_wallet_conversion}
                  onChange={(e) => setSettings({ ...settings, min_wallet_conversion: Number(e.target.value) })}
                  placeholder="Minimum Wallet Conversion (₦)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-500">Minimum conversion amount (₦)</p>
              </div>

              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.bank_withdrawal_enabled}
                    onChange={(e) => setSettings({ ...settings, bank_withdrawal_enabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Allow Bank Cash Withdrawal</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={settings.min_bank_withdrawal}
                    onChange={(e) => setSettings({ ...settings, min_bank_withdrawal: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={settings.max_bank_withdrawal}
                    onChange={(e) => setSettings({ ...settings, max_bank_withdrawal: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Min (₦) / Max (₦) per withdrawal</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Bank Withdrawal Fee
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={settings.bank_withdrawal_fee_type}
                    onChange={(e) =>
                      setSettings({ ...settings, bank_withdrawal_fee_type: e.target.value as 'fixed' | 'percent' })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="fixed">Fixed (₦)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.bank_withdrawal_fee_value}
                    onChange={(e) => setSettings({ ...settings, bank_withdrawal_fee_value: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Deducted from gross payout</p>
              </div>
            </div>
          </div>

          {/* Eligible Service Categories */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Eligible Qualifying Services</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(ELIGIBLE_SERVICE_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(settings.eligible_services?.[key])}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        eligible_services: {
                          ...(settings.eligible_services || {}),
                          [key]: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Marketing Copy & Notifications */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Customer Copy &amp; Email Alerts</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">
                  Headline Banner Text
                </label>
                <input
                  type="text"
                  value={settings.headline || ''}
                  onChange={(e) => setSettings({ ...settings, headline: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">
                  Terms &amp; Conditions Copy
                </label>
                <textarea
                  rows={3}
                  value={settings.terms_and_conditions || ''}
                  onChange={(e) => setSettings({ ...settings, terms_and_conditions: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white leading-relaxed"
                />
              </div>
              <div className="flex flex-wrap gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.email_notify_referrer_on_reward}
                    onChange={(e) =>
                      setSettings({ ...settings, email_notify_referrer_on_reward: e.target.checked })
                    }
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Email Referrer When Reward is Earned</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.email_notify_on_withdrawal}
                    onChange={(e) => setSettings({ ...settings, email_notify_on_withdrawal: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Email Notifications on Withdrawal Requests &amp; Payouts</span>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingConfig}
                className="px-6 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 transition shadow-md"
              >
                {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Save All Referral Settings</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: CAMPAIGNS CRUD */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create tracked campaign links (<code className="font-mono">?ref=CODE&amp;campaign=slug</code>) with custom reward rates or limited redemptions.
            </p>
            <button
              type="button"
              onClick={openNewCampaign}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Campaign</span>
            </button>
          </div>

          {showCampaignForm && (
            <form
              onSubmit={handleSaveCampaign}
              className="bg-white dark:bg-slate-900 border border-blue-500/30 rounded-2xl p-5 space-y-4 shadow-lg"
            >
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingCampaignId ? 'Edit Referral Campaign' : 'Create Referral Campaign'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Campaign Name (e.g. Back to School Promo)"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Slug (e.g. school-promo)"
                  value={campaignForm.slug}
                  onChange={(e) => setCampaignForm({ ...campaignForm, slug: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <select
                  value={campaignForm.reward_model}
                  onChange={(e) => setCampaignForm({ ...campaignForm, reward_model: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="fixed">Fixed Bonus (₦)</option>
                  <option value="percent_of_spend">% of Spend</option>
                  <option value="percent_of_margin">% of Margin</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Reward Value"
                  value={campaignForm.reward_value}
                  onChange={(e) => setCampaignForm({ ...campaignForm, reward_value: Number(e.target.value) })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="number"
                  placeholder="Bonus Points"
                  value={campaignForm.bonus_points}
                  onChange={(e) => setCampaignForm({ ...campaignForm, bonus_points: Number(e.target.value) })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="number"
                  placeholder="Min Spend (₦)"
                  value={campaignForm.min_spend}
                  onChange={(e) => setCampaignForm({ ...campaignForm, min_spend: Number(e.target.value) })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="datetime-local"
                  value={campaignForm.starts_at}
                  onChange={(e) => setCampaignForm({ ...campaignForm, starts_at: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="datetime-local"
                  value={campaignForm.ends_at}
                  onChange={(e) => setCampaignForm({ ...campaignForm, ends_at: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="number"
                  placeholder="Max Redemptions (optional)"
                  value={campaignForm.max_redemptions}
                  onChange={(e) => setCampaignForm({ ...campaignForm, max_redemptions: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <input
                type="text"
                placeholder="Campaign description..."
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campaignForm.is_active}
                    onChange={(e) => setCampaignForm({ ...campaignForm, is_active: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Active Campaign</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCampaignForm(false)}
                    className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCampaign}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    {savingCampaign && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Campaign</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Campaign &amp; Slug</th>
                  <th className="py-3 px-4">Reward Rule</th>
                  <th className="py-3 px-4">Min Spend</th>
                  <th className="py-3 px-4">Redemptions</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No campaigns created yet.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900 dark:text-white">{c.name}</p>
                        <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">{c.slug}</p>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {c.reward_model === 'fixed' ? `₦${c.reward_value}` : `${c.reward_value}%`} ({c.reward_model})
                        {Number(c.bonus_points || 0) > 0 && ` + ${c.bonus_points} pts`}
                      </td>
                      <td className="py-3 px-4 font-mono">₦{Number(c.min_spend || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 font-mono">
                        {c.current_redemptions || 0} {c.max_redemptions ? `/ ${c.max_redemptions}` : ''}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            c.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-500/10 text-slate-500'
                          }`}
                        >
                          {c.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditCampaign(c)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === c.id}
                            onClick={() => handleDeleteCampaign(c.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LOYALTY TIERS CRUD */}
      {activeTab === 'tiers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reward loyal brand ambassadors with higher cash multipliers and bonus points as their referred volume grows.
            </p>
            <button
              type="button"
              onClick={openNewTier}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Tier</span>
            </button>
          </div>

          {showTierForm && (
            <form
              onSubmit={handleSaveTier}
              className="bg-white dark:bg-slate-900 border border-blue-500/30 rounded-2xl p-5 space-y-4 shadow-lg"
            >
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingTierId ? 'Edit Loyalty Tier' : 'Create Loyalty Tier'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Tier Name (e.g. Gold Partner)"
                  value={tierForm.name}
                  onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Slug (e.g. gold)"
                  value={tierForm.slug}
                  onChange={(e) => setTierForm({ ...tierForm, slug: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Min Qualified Users</label>
                  <input
                    type="number"
                    required
                    value={tierForm.min_referred_users}
                    onChange={(e) => setTierForm({ ...tierForm, min_referred_users: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Min Referred Revenue (₦)</label>
                  <input
                    type="number"
                    required
                    value={tierForm.min_referred_revenue}
                    onChange={(e) => setTierForm({ ...tierForm, min_referred_revenue: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Commission Multiplier (x)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={tierForm.commission_multiplier}
                    onChange={(e) => setTierForm({ ...tierForm, commission_multiplier: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Extra Fixed Bonus (₦)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={tierForm.fixed_bonus}
                    onChange={(e) => setTierForm({ ...tierForm, fixed_bonus: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Points Multiplier (x)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={tierForm.points_multiplier}
                    onChange={(e) => setTierForm({ ...tierForm, points_multiplier: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tierForm.is_active}
                    onChange={(e) => setTierForm({ ...tierForm, is_active: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Active Tier</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTierForm(false)}
                    className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTier}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    {savingTier && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Tier</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tier Name</th>
                  <th className="py-3 px-4">Min Referrals</th>
                  <th className="py-3 px-4">Min Revenue</th>
                  <th className="py-3 px-4">Multipliers</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {tiers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No loyalty tiers configured yet.
                    </td>
                  </tr>
                ) : (
                  tiers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900 dark:text-white">{t.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">{t.slug}</p>
                      </td>
                      <td className="py-3 px-4 font-mono">{t.min_referred_users}</td>
                      <td className="py-3 px-4 font-mono">₦{Number(t.min_referred_revenue || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 font-mono">
                        {t.commission_multiplier}x Cash &bull; {t.points_multiplier}x Pts
                        {Number(t.fixed_bonus || 0) > 0 && ` (+₦${t.fixed_bonus})`}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-500/10 text-slate-500'
                          }`}
                        >
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditTier(t)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === t.id}
                            onClick={() => handleDeleteTier(t.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: REWARD MODERATION & SETTLEMENT SWEEP */}
      {activeTab === 'rewards' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {['all', 'pending', 'available', 'rejected', 'reversed'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setRewardFilterStatus(st);
                    loadRewards(st, rewardSearch);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                    rewardFilterStatus === st
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search reference or user..."
                  value={rewardSearch}
                  onChange={(e) => setRewardSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadRewards(rewardFilterStatus, rewardSearch);
                  }}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={sweeping}
                onClick={() => handleSettlementSweep(false)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
              >
                {sweeping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                <span>Settle Mature Holds</span>
              </button>
              <button
                type="button"
                disabled={sweeping}
                onClick={() => handleSettlementSweep(true)}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
              >
                <span>Force Unlock All Holds</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            {loadingRewards ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                Loading rewards ledger...
              </div>
            ) : rewards.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No referral rewards match your filter criteria.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Reference &amp; Date</th>
                    <th className="py-3 px-4">Referrer</th>
                    <th className="py-3 px-4">Referee</th>
                    <th className="py-3 px-4">Service &amp; Margin</th>
                    <th className="py-3 px-4">Reward</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Moderation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {rewards.map((rw) => (
                    <tr key={rw.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <p className="font-mono font-bold text-slate-900 dark:text-white">{rw.source_reference}</p>
                        <p className="text-[10px] text-slate-500">{new Date(rw.created_at).toLocaleString()}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{rw.referrer_name || 'N/A'}</p>
                        <p className="text-[10px] font-mono text-slate-500">{rw.referrer_code || rw.referrer_email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium">{rw.referred_name || rw.referred_masked_name || 'Member'}</p>
                        <p className="text-[10px] font-mono text-slate-500">{rw.referred_email || ''}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="capitalize font-medium">{String(rw.service_category || '').replace(/_/g, ' ')}</p>
                        <p className="text-[10px] font-mono text-slate-500">
                          Spend: ₦{Number(rw.tx_amount || 0).toLocaleString()} &bull; Net Margin: ₦
                          {Number(rw.net_margin_before_reward || 0).toLocaleString()}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          ₦{Number(rw.reward_amount || 0).toLocaleString()}
                        </span>
                        {Number(rw.points_awarded || 0) > 0 && (
                          <span className="block text-[10px] text-indigo-500">+{rw.points_awarded} pts</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                            rw.status === 'available'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : rw.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {rw.status}
                        </span>
                        {rw.status_reason && (
                          <p className="text-[10px] text-slate-500 max-w-[160px] truncate" title={rw.status_reason}>
                            {rw.status_reason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {rw.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setModReason('');
                                  setModModal({ reward: rw, action: 'approve' });
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setModReason('');
                                  setModModal({ reward: rw, action: 'reject' });
                                }}
                                className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
                          {(rw.status === 'pending' || rw.status === 'available') && (
                            <button
                              type="button"
                              onClick={() => {
                                setModReason('');
                                setModModal({ reward: rw, action: 'reverse' });
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-semibold inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reverse</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Reward Moderation Confirmation Modal */}
      {modModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white capitalize">
              {modModal.action} Referral Reward
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Reference <strong className="font-mono">{modModal.reward.source_reference}</strong> &bull; Amount:{' '}
              <strong>₦{Number(modModal.reward.reward_amount || 0).toLocaleString()}</strong>
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Audit Reason / Notes {modModal.action !== 'approve' ? '(Recommended)' : '(Optional)'}
              </label>
              <input
                type="text"
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                placeholder="Enter reason for audit log..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingId === modModal.reward.id}
                onClick={confirmRewardModeration}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 ${
                  modModal.action === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : modModal.action === 'reject'
                      ? 'bg-red-600 hover:bg-red-500'
                      : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {actionLoadingId === modModal.reward.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span className="capitalize">Confirm {modModal.action}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
