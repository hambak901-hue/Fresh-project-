import React, { useEffect, useState, useCallback } from 'react';
import {
  Gift,
  Sliders,
  Megaphone,
  Award,
  CheckSquare,
  Users,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit3,
  ShieldCheck,
  Search,
  Lock,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  ReferralProgramConfig,
  ReferralCampaign,
  ReferralTier,
  ReferralRecordItem,
  ReferralRewardItem,
  ReferralGrowthReport,
} from '../../types';

type SubTab = 'rules' | 'campaigns' | 'tiers' | 'rewards' | 'referrals';

const QUALIFYING_SERVICE_LABELS: Record<string, string> = {
  data: 'Telecom Data Bundles',
  airtime: 'Telecom Airtime VTU',
  airtime_pin: 'Airtime ePINs',
  data_pin: 'Data ePINs',
  cable: 'Cable TV Subscriptions',
  electricity: 'Electricity Disco Bills',
  exam_pin: 'Educational Exam PINs',
  bulksms: 'Bulk SMS Dispatch',
  nin_verification: 'NIN Verification',
  bvn_verification: 'BVN Verification',
  nin_modification: 'NIN Modification',
  bvn_modification: 'BVN Modification',
  enrolment: 'NIN Enrolment',
  academy: 'Digital Academy Enrollment',
};

const REWARD_MODES = [
  { value: 'fixed', label: 'Fixed Naira Bonus per Qualifying Event' },
  { value: 'percent_of_spend', label: 'Percentage of Qualifying Spend (%)' },
  { value: 'percent_of_margin', label: 'Percentage of Net Profit Margin (%)' },
  { value: 'points', label: 'Loyalty Points Only' },
  { value: 'hybrid', label: 'Hybrid (Cash + Loyalty Points)' },
];

const TRIGGER_MODES = [
  { value: 'signup_verified', label: 'Upon Verified Account Signup' },
  { value: 'first_qualifying_transaction', label: 'First Qualifying Transaction Only' },
  { value: 'every_qualifying_transaction', label: 'Every Qualifying Transaction (Up to Cap)' },
  { value: 'up_to_n_tx', label: 'Up to N Qualifying Transactions per Referee' },
];

export function AdminReferralCentre() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';

  const [activeTab, setActiveTab] = useState<SubTab>('rules');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [config, setConfig] = useState<ReferralProgramConfig | null>(null);
  const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([]);
  const [tiers, setTiers] = useState<ReferralTier[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecordItem[]>([]);
  const [rewards, setRewards] = useState<ReferralRewardItem[]>([]);
  const [report, setReport] = useState<ReferralGrowthReport | null>(null);

  const [rewardFilterStatus, setRewardFilterStatus] = useState<string>('all');
  const [rewardSearch, setRewardSearch] = useState<string>('');
  const [referralSearch, setReferralSearch] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  // Campaign Form State
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    campaign_code: '',
    description: '',
    reward_mode: 'fixed',
    reward_value: 150,
    points_bonus: 15,
    min_spend: 500,
    budget_cap: 100000,
    starts_at: '',
    ends_at: '',
    is_active: true,
  });
  const [savingCampaign, setSavingCampaign] = useState(false);

  // Tier Form State
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [showTierForm, setShowTierForm] = useState(false);
  const [tierForm, setTierForm] = useState({
    tier_key: '',
    name: '',
    min_qualified_referrals: 5,
    min_referred_volume: 10000,
    reward_multiplier: 1.25,
    bonus_cash: 0,
    bonus_points: 50,
    reseller_only: false,
    display_order: 1,
    is_active: true,
  });
  const [savingTier, setSavingTier] = useState(false);

  // Reward moderation reason modal
  const [modModal, setModModal] = useState<{
    reward: ReferralRewardItem;
    action: 'settle' | 'reverse' | 'flag';
  } | null>(null);
  const [modReason, setModReason] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminReferralOverview();
      if (res && res.success) {
        setConfig(res.config);
        setCampaigns(res.campaigns || []);
        setTiers(res.tiers || []);
        setReferrals(res.referrals || []);
        setRewards(res.rewards || []);
        setReport(res.report || null);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to load referral engine overview.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    if (!isSuperAdmin) {
      setFeedback({ type: 'error', message: 'Only Super Admin can modify master referral rules and caps.' });
      return;
    }
    setSavingConfig(true);
    setFeedback(null);
    try {
      const res = await api.updateAdminReferralConfig(config);
      if (res?.config) {
        setConfig(res.config);
      }
      setFeedback({
        type: 'success',
        message: res?.message || 'Referral rules, margin protection floors, and withdrawal settings saved.',
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
      campaign_code: '',
      description: '',
      reward_mode: 'fixed',
      reward_value: 150,
      points_bonus: 15,
      min_spend: 500,
      budget_cap: 100000,
      starts_at: '',
      ends_at: '',
      is_active: true,
    });
    setShowCampaignForm(true);
  };

  const openEditCampaign = (c: ReferralCampaign) => {
    setEditingCampaignId(c.id);
    setCampaignForm({
      name: c.name || '',
      campaign_code: c.campaign_code || '',
      description: c.description || '',
      reward_mode: c.reward_mode || 'fixed',
      reward_value: Number(c.reward_value || 0),
      points_bonus: Number(c.points_bonus || 0),
      min_spend: Number(c.min_spend || 0),
      budget_cap: Number(c.budget_cap || 0),
      starts_at: c.starts_at ? String(c.starts_at).slice(0, 16) : '',
      ends_at: c.ends_at ? String(c.ends_at).slice(0, 16) : '',
      is_active: Boolean(c.is_active),
    });
    setShowCampaignForm(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCampaign(true);
    setFeedback(null);
    try {
      const res = await api.saveAdminReferralCampaign(
        {
          name: campaignForm.name.trim(),
          campaign_code: campaignForm.campaign_code.trim().toUpperCase(),
          description: campaignForm.description.trim(),
          reward_mode: campaignForm.reward_mode,
          reward_value: Number(campaignForm.reward_value),
          points_bonus: Number(campaignForm.points_bonus),
          min_spend: Number(campaignForm.min_spend),
          budget_cap: Number(campaignForm.budget_cap),
          starts_at: campaignForm.starts_at || null,
          ends_at: campaignForm.ends_at || null,
          is_active: campaignForm.is_active,
        },
        editingCampaignId || undefined
      );
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
      setFeedback({ type: 'success', message: 'Campaign removed.' });
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
      tier_key: '',
      name: '',
      min_qualified_referrals: 5,
      min_referred_volume: 10000,
      reward_multiplier: 1.25,
      bonus_cash: 0,
      bonus_points: 50,
      reseller_only: false,
      display_order: tiers.length + 1,
      is_active: true,
    });
    setShowTierForm(true);
  };

  const openEditTier = (t: ReferralTier) => {
    setEditingTierId(t.id);
    setTierForm({
      tier_key: t.tier_key || '',
      name: t.name || '',
      min_qualified_referrals: Number(t.min_qualified_referrals || 0),
      min_referred_volume: Number(t.min_referred_volume || 0),
      reward_multiplier: Number(t.reward_multiplier || 1),
      bonus_cash: Number(t.bonus_cash || 0),
      bonus_points: Number(t.bonus_points || 0),
      reseller_only: Boolean(t.reseller_only),
      display_order: Number(t.display_order || 1),
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
          tier_key: tierForm.tier_key.trim() || undefined,
          name: tierForm.name.trim(),
          min_qualified_referrals: Number(tierForm.min_qualified_referrals),
          min_referred_volume: Number(tierForm.min_referred_volume),
          reward_multiplier: Number(tierForm.reward_multiplier),
          bonus_cash: Number(tierForm.bonus_cash),
          bonus_points: Number(tierForm.bonus_points),
          reseller_only: tierForm.reseller_only,
          display_order: Number(tierForm.display_order),
          is_active: tierForm.is_active,
        },
        editingTierId || undefined
      );
      setFeedback({ type: 'success', message: res.message || 'Partner tier saved.' });
      setShowTierForm(false);
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save partner tier.' });
    } finally {
      setSavingTier(false);
    }
  };

  const handleDeleteTier = async (id: string) => {
    setActionLoadingId(id);
    try {
      await api.deleteAdminReferralTier(id);
      setFeedback({ type: 'success', message: 'Partner tier removed.' });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete tier.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSettlementSweep = async () => {
    setSweeping(true);
    setFeedback(null);
    try {
      const res = await api.adminSettleMatureReferrals();
      setFeedback({
        type: 'success',
        message: res.message || `${res.settled_count} mature pending reward(s) released.`,
      });
      await loadOverview();
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
      const res = await api.adminReferralRewardAction(modModal.reward.id, modModal.action, modReason.trim());
      setFeedback({ type: 'success', message: res.message || 'Reward status updated.' });
      setModModal(null);
      setModReason('');
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update reward status.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReferralStatusChange = async (id: string, status: 'registered' | 'qualified' | 'flagged' | 'blocked') => {
    setActionLoadingId(id);
    setFeedback(null);
    try {
      const res = await api.adminUpdateReferralStatus(id, status, `Status updated to ${status} by admin`);
      setFeedback({ type: 'success', message: res.message || `Referral updated to ${status}.` });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update referral status.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading && !config) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-indigo-400" />
        <p className="text-xs font-medium">Loading Referral &amp; Rewards Engine...</p>
      </div>
    );
  }

  const filteredRewards = rewards.filter((rw) => {
    if (rewardFilterStatus !== 'all' && rw.status !== rewardFilterStatus) return false;
    if (!rewardSearch.trim()) return true;
    const q = rewardSearch.toLowerCase();
    return (
      (rw.source_reference || '').toLowerCase().includes(q) ||
      (rw.referrer_name || '').toLowerCase().includes(q) ||
      (rw.referrer_email || '').toLowerCase().includes(q) ||
      (rw.referred_name || '').toLowerCase().includes(q) ||
      (rw.service_category || '').toLowerCase().includes(q)
    );
  });

  const filteredReferrals = referrals.filter((rf) => {
    if (!referralSearch.trim()) return true;
    const q = referralSearch.toLowerCase();
    return (
      (rf.referrer_name || '').toLowerCase().includes(q) ||
      (rf.referrer_email || '').toLowerCase().includes(q) ||
      (rf.referred_name || '').toLowerCase().includes(q) ||
      (rf.referred_email || '').toLowerCase().includes(q) ||
      (rf.referral_code_used || '').toLowerCase().includes(q)
    );
  });

  const summary = report?.summary;

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
            Configure reward models, margin-protection floors, velocity caps, campaigns, partner tiers, and settlement holds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={sweeping}
            onClick={handleSettlementSweep}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
          >
            {sweeping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>Settle Mature Rewards</span>
          </button>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            You are viewing Referral Governance in Moderator mode. Global rules, campaigns, tiers, and settled reward reversals require Super Admin authorization.
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            &times;
          </button>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Referrals</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">{summary.total_referrals}</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Qualified</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
              {summary.qualified_referrals}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Approved Rewards</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">
              ₦{Number(summary.approved_rewards_naira || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Available Liability</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              ₦{Number(summary.outstanding_available_balances || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Pending Hold</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
              ₦{Number(summary.pending_reward_liability || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Open Withdrawals</p>
            <p className="text-xl font-extrabold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1">
              {summary.pending_withdrawal_count}
            </p>
          </div>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'rules' as SubTab, label: 'Engine Rules & Caps', icon: Sliders },
          { id: 'campaigns' as SubTab, label: `Campaigns (${campaigns.length})`, icon: Megaphone },
          { id: 'tiers' as SubTab, label: `Partner Tiers (${tiers.length})`, icon: Award },
          { id: 'rewards' as SubTab, label: `Rewards & Hold (${rewards.length})`, icon: CheckSquare },
          { id: 'referrals' as SubTab, label: `Attributed Signups (${referrals.length})`, icon: Users },
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

      {/* TAB 1: RULES & CAPS */}
      {activeTab === 'rules' && config && (
        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Programme Activation &amp; Formula</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Control referral accruals, code prefixing, trigger events, and point valuation.
                </p>
              </div>
              <label className="inline-flex items-center gap-2.5 cursor-pointer px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={Boolean(config.enabled)}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {config.enabled ? 'Referral Engine ACTIVE' : 'Referral Engine PAUSED'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Program Name</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={config.program_name}
                  onChange={(e) => setConfig({ ...config, program_name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Code Prefix / Length</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={config.code_prefix}
                    onChange={(e) => setConfig({ ...config, code_prefix: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono"
                  />
                  <input
                    type="number"
                    min={4}
                    max={10}
                    disabled={!isSuperAdmin}
                    value={config.code_length}
                    onChange={(e) => setConfig({ ...config, code_length: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Reward Mode</label>
                <select
                  disabled={!isSuperAdmin}
                  value={config.reward_mode}
                  onChange={(e) => setConfig({ ...config, reward_mode: e.target.value as any })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                >
                  {REWARD_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Reward Trigger</label>
                <select
                  disabled={!isSuperAdmin}
                  value={config.trigger_mode}
                  onChange={(e) => setConfig({ ...config, trigger_mode: e.target.value as any })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white"
                >
                  {TRIGGER_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Flat Reward (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isSuperAdmin}
                  value={config.flat_reward_naira}
                  onChange={(e) => setConfig({ ...config, flat_reward_naira: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">% of Spend</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isSuperAdmin}
                  value={config.percent_of_spend}
                  onChange={(e) => setConfig({ ...config, percent_of_spend: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">% of Net Margin</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isSuperAdmin}
                  value={config.percent_of_margin}
                  onChange={(e) => setConfig({ ...config, percent_of_margin: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Points / Tx &amp; ₦ Value</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    disabled={!isSuperAdmin}
                    value={config.points_per_qualifying_tx}
                    onChange={(e) => setConfig({ ...config, points_per_qualifying_tx: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono"
                    title="Points per qualifying transaction"
                  />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isSuperAdmin}
                    value={config.point_value_naira}
                    onChange={(e) => setConfig({ ...config, point_value_naira: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono"
                    title="1 point Naira value"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Margin Protection, Velocity Caps &amp; Anti-Abuse Rules</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Rewards are suppressed if net margin falls below the floor, or capped by monthly/per-referee limits.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Min Qualifying Spend (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isSuperAdmin}
                  value={config.min_qualifying_spend}
                  onChange={(e) => setConfig({ ...config, min_qualifying_spend: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Min Net Margin Floor (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isSuperAdmin}
                  value={config.min_net_margin_naira}
                  onChange={(e) => setConfig({ ...config, min_net_margin_naira: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Monthly Cap / Referrer (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  disabled={!isSuperAdmin}
                  value={config.monthly_reward_cap_naira}
                  onChange={(e) => setConfig({ ...config, monthly_reward_cap_naira: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Max Rewards / Referee</label>
                <input
                  type="number"
                  min={1}
                  disabled={!isSuperAdmin}
                  value={config.max_rewards_per_referee}
                  onChange={(e) => setConfig({ ...config, max_rewards_per_referee: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Settlement Hold (Hours)</label>
                <input
                  type="number"
                  min={0}
                  disabled={!isSuperAdmin}
                  value={config.settlement_hold_hours}
                  onChange={(e) => setConfig({ ...config, settlement_hold_hours: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Max Signups / IP / 24h</label>
                <input
                  type="number"
                  min={1}
                  disabled={!isSuperAdmin}
                  value={config.max_signups_per_ip_24h}
                  onChange={(e) => setConfig({ ...config, max_signups_per_ip_24h: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Points / ₦1,000 Spend</label>
                <input
                  type="number"
                  min={0}
                  disabled={!isSuperAdmin}
                  value={config.points_per_1000_naira}
                  onChange={(e) => setConfig({ ...config, points_per_1000_naira: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">Min Points to Redeem</label>
                <input
                  type="number"
                  min={1}
                  disabled={!isSuperAdmin}
                  value={config.min_points_conversion}
                  onChange={(e) => setConfig({ ...config, min_points_conversion: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={Boolean(config.block_self_referral)}
                  onChange={(e) => setConfig({ ...config, block_self_referral: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <span>Block Self-Referrals (Same User / Phone / Email)</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={Boolean(config.block_same_ip_signup)}
                  onChange={(e) => setConfig({ ...config, block_same_ip_signup: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <span>Flag Same-IP Referral Signups</span>
              </label>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Wallet Conversion &amp; Bank Withdrawal Rules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={Boolean(config.wallet_conversion_enabled)}
                    onChange={(e) => setConfig({ ...config, wallet_conversion_enabled: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Allow Wallet Conversion</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isSuperAdmin}
                    value={config.min_wallet_conversion_naira}
                    onChange={(e) => setConfig({ ...config, min_wallet_conversion_naira: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                    title="Min wallet conversion (₦)"
                  />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isSuperAdmin}
                    value={config.wallet_conversion_fee_naira}
                    onChange={(e) => setConfig({ ...config, wallet_conversion_fee_naira: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                    title="Wallet conversion fee (₦)"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Min Conversion (₦) / Conversion Fee (₦)</p>
              </div>

              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={Boolean(config.withdrawal_enabled)}
                    onChange={(e) => setConfig({ ...config, withdrawal_enabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Allow Bank Cash Withdrawal</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isSuperAdmin}
                    value={config.min_withdrawal_naira}
                    onChange={(e) => setConfig({ ...config, min_withdrawal_naira: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs font-mono"
                    title="Min withdrawal"
                  />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isSuperAdmin}
                    value={config.max_withdrawal_naira}
                    onChange={(e) => setConfig({ ...config, max_withdrawal_naira: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs font-mono"
                    title="Max single withdrawal"
                  />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isSuperAdmin}
                    value={config.daily_withdrawal_limit_naira}
                    onChange={(e) => setConfig({ ...config, daily_withdrawal_limit_naira: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs font-mono"
                    title="Daily withdrawal limit"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Min / Max / Daily Limit (₦)</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase text-slate-500">
                  Withdrawal Fee &amp; Min KYC Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    disabled={!isSuperAdmin}
                    value={config.withdrawal_fee_type}
                    onChange={(e) => setConfig({ ...config, withdrawal_fee_type: e.target.value as 'flat' | 'percent' })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2 py-2 text-xs"
                  >
                    <option value="flat">Flat (₦)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isSuperAdmin}
                    value={config.withdrawal_fee_value}
                    onChange={(e) => setConfig({ ...config, withdrawal_fee_value: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs font-mono"
                  />
                  <select
                    disabled={!isSuperAdmin}
                    value={config.require_kyc_level_for_withdrawal}
                    onChange={(e) => setConfig({ ...config, require_kyc_level_for_withdrawal: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2 py-2 text-xs"
                  >
                    <option value={1}>KYC 1+</option>
                    <option value={2}>KYC 2+</option>
                    <option value={3}>KYC 3</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-500">Fee Type / Fee Value / Minimum KYC Tier</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Eligible Qualifying Services</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(QUALIFYING_SERVICE_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={Boolean(config.qualifying_services?.[key])}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        qualifying_services: {
                          ...(config.qualifying_services || {}),
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

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Share Copy, Terms &amp; Email Alerts</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  WhatsApp Share Template (supports {'{code}'} &amp; {'{link}'})
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={config.whatsapp_share_template || ''}
                  onChange={(e) => setConfig({ ...config, whatsapp_share_template: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Customer Program Summary / Terms
                </label>
                <textarea
                  rows={3}
                  disabled={!isSuperAdmin}
                  value={config.terms_summary || ''}
                  onChange={(e) => setConfig({ ...config, terms_summary: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-xs leading-relaxed"
                />
              </div>
              <div className="flex flex-wrap gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={Boolean(config.notify_email_on_reward)}
                    onChange={(e) => setConfig({ ...config, notify_email_on_reward: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Email Referrer When Reward is Earned</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={Boolean(config.notify_email_on_withdrawal)}
                    onChange={(e) => setConfig({ ...config, notify_email_on_withdrawal: e.target.checked })}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>Email Notifications on Cash Withdrawals</span>
                </label>
              </div>
            </div>

            {isSuperAdmin && (
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
            )}
          </div>
        </form>
      )}

      {/* TAB 2: CAMPAIGNS */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Track segmented promotions (<code className="font-mono">?ref=CODE&amp;campaign=CAMPAIGN_CODE</code>) with dedicated reward overrides and budget caps.
            </p>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={openNewCampaign}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>New Campaign</span>
              </button>
            )}
          </div>

          {showCampaignForm && (
            <form onSubmit={handleSaveCampaign} className="bg-white dark:bg-slate-900 border border-blue-500/30 rounded-2xl p-5 space-y-4 shadow-lg">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingCampaignId ? 'Edit Referral Campaign' : 'Create Referral Campaign'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Campaign Name"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="CAMPAIGN_CODE (e.g. CAMPUS26)"
                  value={campaignForm.campaign_code}
                  onChange={(e) => setCampaignForm({ ...campaignForm, campaign_code: e.target.value.toUpperCase() })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono uppercase"
                />
                <select
                  value={campaignForm.reward_mode}
                  onChange={(e) => setCampaignForm({ ...campaignForm, reward_mode: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <option value="fixed">Fixed Bonus (₦)</option>
                  <option value="percent_of_spend">% of Spend</option>
                  <option value="percent_of_margin">% of Net Margin</option>
                  <option value="points">Points Only</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Reward Value (₦ or %)"
                  value={campaignForm.reward_value}
                  onChange={(e) => setCampaignForm({ ...campaignForm, reward_value: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="number"
                  placeholder="Bonus Points"
                  value={campaignForm.points_bonus}
                  onChange={(e) => setCampaignForm({ ...campaignForm, points_bonus: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Budget Cap (₦)"
                  value={campaignForm.budget_cap}
                  onChange={(e) => setCampaignForm({ ...campaignForm, budget_cap: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={campaignForm.is_active}
                    onChange={(e) => setCampaignForm({ ...campaignForm, is_active: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Campaign Active</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCampaignForm(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCampaign}
                    className="px-4 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
                  >
                    {savingCampaign ? 'Saving...' : 'Save Campaign'}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                        {c.campaign_code}
                      </span>
                      <span className={`text-[11px] font-semibold ${c.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {c.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1.5">{c.name}</h4>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEditCampaign(c)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === c.id}
                        onClick={() => handleDeleteCampaign(c.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-4 font-mono tabular-nums">
                  <span>Mode: {c.reward_mode}</span>
                  <span>Value: {c.reward_value}</span>
                  <span>Points: +{c.points_bonus}</span>
                  <span>Spent: ₦{Number(c.spent_budget || 0).toLocaleString()} / ₦{Number(c.budget_cap || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: TIERS */}
      {activeTab === 'tiers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reward top affiliates and high-volume partners automatically with commission multipliers.
            </p>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={openNewTier}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Partner Tier</span>
              </button>
            )}
          </div>

          {showTierForm && (
            <form onSubmit={handleSaveTier} className="bg-white dark:bg-slate-900 border border-blue-500/30 rounded-2xl p-5 space-y-4 shadow-lg">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingTierId ? 'Edit Partner Tier' : 'Create Partner Tier'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Tier Name (e.g. Gold Partner)"
                  value={tierForm.name}
                  onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                <input
                  type="number"
                  min={0}
                  required
                  placeholder="Min Qualified Referrals"
                  value={tierForm.min_qualified_referrals}
                  onChange={(e) => setTierForm({ ...tierForm, min_qualified_referrals: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Min Referred Volume (₦)"
                  value={tierForm.min_referred_volume}
                  onChange={(e) => setTierForm({ ...tierForm, min_referred_volume: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.05"
                  min={1}
                  max={5}
                  required
                  placeholder="Multiplier (e.g. 1.5)"
                  value={tierForm.reward_multiplier}
                  onChange={(e) => setTierForm({ ...tierForm, reward_multiplier: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Bonus Cash (₦)"
                  value={tierForm.bonus_cash}
                  onChange={(e) => setTierForm({ ...tierForm, bonus_cash: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="number"
                  placeholder="Bonus Points"
                  value={tierForm.bonus_points}
                  onChange={(e) => setTierForm({ ...tierForm, bonus_points: Number(e.target.value) })}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={tierForm.is_active}
                    onChange={(e) => setTierForm({ ...tierForm, is_active: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Tier Active</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTierForm(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTier}
                    className="px-4 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
                  >
                    {savingTier ? 'Saving...' : 'Save Tier'}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((t) => (
              <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{t.name}</h4>
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{t.reward_multiplier}x</span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                  {t.min_qualified_referrals}+ qualified &bull; ₦{Number(t.min_referred_volume || 0).toLocaleString()} vol
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  Bonus: +₦{Number(t.bonus_cash || 0).toLocaleString()} / +{t.bonus_points} pts
                </p>
                {isSuperAdmin && (
                  <div className="flex justify-end gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button type="button" onClick={() => openEditTier(t)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={actionLoadingId === t.id}
                      onClick={() => handleDeleteTier(t.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: REWARD MODERATION */}
      {activeTab === 'rewards' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {['all', 'pending', 'available', 'rejected', 'reversed', 'skipped'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setRewardFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                    rewardFilterStatus === st ? 'bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reference or user..."
                value={rewardSearch}
                onChange={(e) => setRewardSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Reference &amp; Service</th>
                  <th className="py-3 px-4">Referrer</th>
                  <th className="py-3 px-4">Referred Customer</th>
                  <th className="py-3 px-4">Reward &amp; Margin</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRewards.map((rw) => (
                  <tr key={rw.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-mono font-bold text-slate-900 dark:text-white">{rw.source_reference}</p>
                      <p className="text-[10px] text-slate-500 capitalize">{rw.service_category.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{rw.referrer_name || 'N/A'}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{rw.referrer_email}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{rw.referred_name || rw.referred_customer || 'N/A'}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{rw.referred_email}</p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        ₦{Number(rw.reward_cash || 0).toLocaleString()} + {rw.reward_points} pts
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Spend ₦{Number(rw.gross_amount || 0).toLocaleString()} &bull; Margin ₦{Number(rw.net_margin || 0).toLocaleString()}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="uppercase text-[11px] font-semibold">{rw.status}</span>
                      {rw.status_reason && <p className="text-[10px] text-slate-500 max-w-xs">{rw.status_reason}</p>}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      {rw.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setModModal({ reward: rw, action: 'settle' })}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold"
                          >
                            Settle
                          </button>
                          <button
                            type="button"
                            onClick={() => setModModal({ reward: rw, action: 'flag' })}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-semibold"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {isSuperAdmin && (rw.status === 'pending' || rw.status === 'available') && (
                        <button
                          type="button"
                          onClick={() => setModModal({ reward: rw, action: 'reverse' })}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-semibold"
                        >
                          Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: ATTRIBUTED REFERRALS */}
      {activeTab === 'referrals' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspect attribution links, signup IPs, fraud flags, and block suspicious referral rings.
            </p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search customer or code..."
                value={referralSearch}
                onChange={(e) => setReferralSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Referrer</th>
                  <th className="py-3 px-4">Referred Customer</th>
                  <th className="py-3 px-4">Activity &amp; Spend</th>
                  <th className="py-3 px-4">Status &amp; Risk</th>
                  <th className="py-3 px-4 text-right">Update Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredReferrals.map((rf) => (
                  <tr key={rf.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{rf.referrer_name}</p>
                      <p className="text-[10px] font-mono text-slate-500">{rf.referral_code_used || rf.referrer_code}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{rf.referred_name}</p>
                      <p className="text-[10px] font-mono text-slate-500">{rf.referred_email} &bull; {rf.signup_ip}</p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <p>{rf.qualifying_tx_count} txns &bull; ₦{Number(rf.qualifying_spend_total || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        Earned: ₦{Number(rf.reward_earned_total || 0).toLocaleString()}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="uppercase text-[11px] font-bold">{rf.status}</span>
                      {rf.flag_reason && <p className="text-[10px] text-amber-600">{rf.flag_reason}</p>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <select
                        disabled={actionLoadingId === rf.id}
                        value={rf.status}
                        onChange={(e) => handleReferralStatusChange(rf.id, e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                      >
                        <option value="registered">Registered</option>
                        <option value="qualified">Qualified</option>
                        <option value="flagged">Flagged</option>
                        <option value="blocked">Blocked</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reward Moderation Modal */}
      {modModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white capitalize">
              {modModal.action} Referral Reward
            </h3>
            <p className="text-xs text-slate-500">
              Source Ref: <span className="font-mono font-bold text-slate-900 dark:text-white">{modModal.reward.source_reference}</span>
              {' '} &bull; Cash: ₦{Number(modModal.reward.reward_cash || 0).toLocaleString()}
            </p>
            <textarea
              rows={2}
              value={modReason}
              onChange={(e) => setModReason(e.target.value)}
              placeholder="Audit reason..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingId === modModal.reward.id}
                onClick={confirmRewardModeration}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
              >
                Confirm {modModal.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
