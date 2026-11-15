/**
 * @file ReferralCentrePage.tsx
 * Customer Referral, Loyalty Points, Wallet Conversion & Bank Withdrawal Centre.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  Copy,
  Check,
  Share2,
  Wallet,
  Coins,
  Landmark,
  Users,
  Award,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ReferralDashboardData } from '../../types';
import { TransactionPinModal } from './TransactionPinModal';

type PendingAction =
  | { type: 'wallet_convert'; amount: number }
  | { type: 'points_convert'; points: number }
  | { type: 'withdraw'; amount: number; bank_name: string; account_number: string; account_name: string }
  | null;

const formatNaira = (val?: number | null) =>
  `₦${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, string> = {
  qualified: 'text-emerald-700 dark:text-emerald-400',
  available: 'text-emerald-700 dark:text-emerald-400',
  paid: 'text-emerald-700 dark:text-emerald-400',
  paid_out: 'text-emerald-700 dark:text-emerald-400',
  approved: 'text-blue-700 dark:text-blue-400',
  processing: 'text-blue-700 dark:text-blue-400',
  pending: 'text-amber-700 dark:text-amber-400',
  registered: 'text-slate-600 dark:text-slate-400',
  flagged: 'text-rose-700 dark:text-rose-400',
  blocked: 'text-rose-700 dark:text-rose-400',
  rejected: 'text-rose-700 dark:text-rose-400',
  reversed: 'text-rose-700 dark:text-rose-400',
  failed: 'text-rose-700 dark:text-rose-400',
  cancelled: 'text-slate-500 dark:text-slate-400',
};

export const ReferralCentrePage: React.FC = () => {
  const { user, pinPolicy, updateBalance, refreshUser } = useAuth();

  const [data, setData] = useState<ReferralDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'convert' | 'withdraw' | 'ledger'>('overview');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Convert cash to wallet
  const [walletAmount, setWalletAmount] = useState('');
  // Convert points to wallet
  const [pointsInput, setPointsInput] = useState('');
  // Bank withdrawal form
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // PIN confirmation
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getReferralDashboard();
      if (res.success) {
        setData(res);
      } else {
        setError('Unable to load Referral Centre data.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load Referral Centre data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleCopy = (text: string, which: 'code' | 'link') => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    if (which === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  const openWhatsAppShare = () => {
    if (!data) return;
    const tpl =
      data.config?.whatsapp_share_template ||
      'Join me on HAMBAKTECH using my referral code {code}: {link}';
    const text = tpl
      .replace(/\{code\}/gi, data.referral_code)
      .replace(/\{link\}/gi, data.referral_link);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const startProtectedAction = (action: PendingAction, needsPinKey: 'referral_wallet_conversion' | 'referral_withdrawal') => {
    setNotice(null);
    const pinEnforced =
      pinPolicy?.enforce_transaction_pin &&
      (pinPolicy?.protected_categories?.[needsPinKey] ?? true);

    if (!user?.has_transaction_pin && (pinPolicy?.require_pin_activation_for_all_customers || pinEnforced)) {
      window.dispatchEvent(new CustomEvent('hambak:pin-setup-required'));
      return;
    }

    if (!pinEnforced) {
      void executeAction(action, '');
      return;
    }

    setPendingAction(action);
    setPinModalOpen(true);
  };

  const executeAction = async (action: PendingAction, verifiedPin: string) => {
    if (!action) return;
    setSubmitting(true);
    setNotice(null);
    try {
      if (action.type === 'wallet_convert') {
        const res = await api.convertReferralToWallet(
          action.amount,
          verifiedPin,
          `REF-WAL-${Date.now()}`
        );
        if (typeof res.new_wallet_balance === 'number') {
          updateBalance(res.new_wallet_balance);
        }
        setWalletAmount('');
        setNotice({ type: 'success', text: res.message || 'Referral reward transferred to main wallet!' });
      } else if (action.type === 'points_convert') {
        const res = await api.convertReferralPoints(action.points, verifiedPin);
        if (typeof res.new_wallet_balance === 'number') {
          updateBalance(res.new_wallet_balance);
        }
        setPointsInput('');
        setNotice({ type: 'success', text: res.message || 'Loyalty points converted to wallet balance!' });
      } else if (action.type === 'withdraw') {
        const res = await api.requestReferralWithdrawal({
          amount: action.amount,
          bank_name: action.bank_name,
          account_number: action.account_number,
          account_name: action.account_name,
          pin: verifiedPin,
          idempotency_key: `REF-WD-${Date.now()}`,
        });
        setWithdrawAmount('');
        setNotice({
          type: 'success',
          text: res.message || 'Withdrawal request submitted and queued for admin payout.',
        });
      }
      await Promise.all([loadDashboard(), refreshUser()]);
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Action could not be completed.' });
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  };

  const handleWalletConvertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(walletAmount);
    if (!amount || amount <= 0) {
      setNotice({ type: 'error', text: 'Enter a valid Naira amount to convert.' });
      return;
    }
    if (data && amount > data.balance.available_balance) {
      setNotice({ type: 'error', text: 'Amount exceeds your available referral balance.' });
      return;
    }
    if (data && amount < data.config.min_wallet_conversion_naira) {
      setNotice({
        type: 'error',
        text: `Minimum wallet conversion is ${formatNaira(data.config.min_wallet_conversion_naira)}.`,
      });
      return;
    }
    startProtectedAction({ type: 'wallet_convert', amount }, 'referral_wallet_conversion');
  };

  const handlePointsConvertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const points = parseInt(pointsInput, 10);
    if (!points || points <= 0) {
      setNotice({ type: 'error', text: 'Enter a valid number of points to redeem.' });
      return;
    }
    if (data && points > data.balance.points_balance) {
      setNotice({ type: 'error', text: 'Entered points exceed your available points balance.' });
      return;
    }
    if (data && points < data.config.min_points_conversion) {
      setNotice({
        type: 'error',
        text: `Minimum points redemption is ${data.config.min_points_conversion.toLocaleString()} pts.`,
      });
      return;
    }
    startProtectedAction({ type: 'points_convert', points }, 'referral_wallet_conversion');
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      setNotice({ type: 'error', text: 'Enter a valid withdrawal amount.' });
      return;
    }
    if (!bankName.trim() || !accountName.trim() || accountNumber.replace(/\D/g, '').length !== 10) {
      setNotice({ type: 'error', text: 'Provide your bank name, account holder name, and 10-digit NUBAN.' });
      return;
    }
    if (data) {
      if (amount > data.balance.available_balance) {
        setNotice({ type: 'error', text: 'Withdrawal exceeds available referral balance.' });
        return;
      }
      if (amount < data.config.min_withdrawal_naira) {
        setNotice({
          type: 'error',
          text: `Minimum bank withdrawal is ${formatNaira(data.config.min_withdrawal_naira)}.`,
        });
        return;
      }
      if (amount > data.config.max_withdrawal_naira) {
        setNotice({
          type: 'error',
          text: `Maximum single withdrawal is ${formatNaira(data.config.max_withdrawal_naira)}.`,
        });
        return;
      }
    }
    startProtectedAction(
      {
        type: 'withdraw',
        amount,
        bank_name: bankName.trim(),
        account_number: accountNumber.replace(/\D/g, ''),
        account_name: accountName.trim(),
      },
      'referral_withdrawal'
    );
  };

  const handleCancelWithdrawal = async (id: string) => {
    setCancellingId(id);
    setNotice(null);
    try {
      const res = await api.cancelReferralWithdrawal(id);
      setNotice({ type: 'success', text: res.message || 'Pending withdrawal cancelled and funds released.' });
      await loadDashboard();
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Unable to cancel withdrawal.' });
    } finally {
      setCancellingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-xs font-medium">Loading Referral &amp; Rewards Centre...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{error || 'Unable to load referral data'}</p>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const { config, balance, stats, current_tier, tiers, referred_users, rewards, withdrawals, points_ledger } = data;
  const wdAmountNum = parseFloat(withdrawAmount) || 0;
  const estFee =
    wdAmountNum > 0
      ? config.withdrawal_fee_type === 'percent'
        ? Math.round((wdAmountNum * config.withdrawal_fee_value) * 100) / 10000
        : config.withdrawal_fee_value
      : 0;
  const estNetPayout = Math.max(0, wdAmountNum - estFee);
  const estPointsValue = (parseInt(pointsInput, 10) || 0) * config.point_value_naira;

  const nextTier = tiers.find(
    t => t.min_qualified_referrals > stats.qualified_referrals || t.min_referred_volume > stats.referred_volume
  );

  return (
    <div className="space-y-6">
      {/* Header & Share Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
              <Gift className="w-4 h-4" />
              <span>{config.program_name}</span>
              {current_tier && (
                <span className="text-slate-400 font-normal">&bull; {current_tier.name}</span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Referrals, Rewards &amp; Cashouts
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              {config.terms_summary || 'Invite friends to HAMBAKTECH and earn settled cash bonuses & loyalty points whenever they transact.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={openWhatsAppShare}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share on WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Copyable Code & Link Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Your Referral Code
              </p>
              <p className="text-base font-bold font-mono text-slate-900 dark:text-white tracking-wider truncate">
                {data.referral_code}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(data.referral_code, 'code')}
              className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Your Referral Link
              </p>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                {data.referral_link}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(data.referral_link, 'link')}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Available Rewards</span>
            <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1.5">
            {formatNaira(balance.available_balance)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            Pending: {formatNaira(balance.pending_balance)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Loyalty Points</span>
            <Coins className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1.5">
            {Number(balance.points_balance || 0).toLocaleString()} pts
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            Est. {formatNaira(balance.points_balance * config.point_value_naira)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Invited Users</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1.5">
            {stats.total_referrals}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            Qualified: {stats.qualified_referrals}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Lifetime Earned</span>
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1.5">
            {formatNaira(stats.lifetime_earned)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            To Wallet: {formatNaira(balance.transferred_to_wallet_total)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Bank Payouts</span>
            <Landmark className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1.5">
            {formatNaira(balance.total_withdrawn)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            Reserved: {formatNaira(balance.reserved_for_withdrawal)}
          </p>
        </div>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'overview', label: 'Tier & Program Overview' },
          { id: 'convert', label: 'Convert Rewards & Points to Wallet' },
          { id: 'withdraw', label: 'Cash Withdrawal to Bank' },
          { id: 'ledger', label: `Activity & Referrals (${referred_users.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl font-semibold whitespace-nowrap transition border ${
              activeTab === tab.id
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <span>Partner Tiers &amp; Multipliers</span>
            </h2>
            {nextTier && (
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
                Next milestone: <span className="font-bold">{nextTier.name}</span> &mdash; Reach{' '}
                <span className="font-semibold tabular-nums">{nextTier.min_qualified_referrals}</span> qualified referrals and{' '}
                <span className="font-semibold tabular-nums">{formatNaira(nextTier.min_referred_volume)}</span> referred spend for a{' '}
                <span className="font-bold">{nextTier.reward_multiplier}x</span> multiplier.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tiers.map(tier => {
                const isCurrent = current_tier?.id === tier.id;
                return (
                  <div
                    key={tier.id}
                    className={`p-4 rounded-xl border ${
                      isCurrent
                        ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{tier.name}</span>
                      <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
                        {tier.reward_multiplier}x
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                      Min {tier.min_qualified_referrals} qualified &bull; {formatNaira(tier.min_referred_volume)} volume
                    </p>
                    {isCurrent && (
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mt-1.5">
                        Current Tier
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Qualifying Rules</span>
            </h2>
            <ul className="space-y-2 text-slate-600 dark:text-slate-300 leading-relaxed list-disc list-inside">
              <li>
                Minimum qualifying spend:{' '}
                <strong className="tabular-nums">{formatNaira(config.min_qualifying_spend)}</strong>
              </li>
              <li>
                Settlement hold window:{' '}
                <strong className="tabular-nums">{config.settlement_hold_hours} hours</strong> after transaction completion
              </li>
              <li>
                Point exchange rate:{' '}
                <strong className="tabular-nums">1 pt = {formatNaira(config.point_value_naira)}</strong>
              </li>
              <li>
                Minimum wallet transfer:{' '}
                <strong className="tabular-nums">{formatNaira(config.min_wallet_conversion_naira)}</strong>
              </li>
              <li>
                Bank withdrawal range:{' '}
                <strong className="tabular-nums">
                  {formatNaira(config.min_withdrawal_naira)} &ndash; {formatNaira(config.max_withdrawal_naira)}
                </strong>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB: CONVERT TO WALLET & POINTS */}
      {activeTab === 'convert' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleWalletConvertSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Transfer Rewards to Main Wallet</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                Available: <strong>{formatNaira(balance.available_balance)}</strong> &bull; Minimum:{' '}
                {formatNaira(config.min_wallet_conversion_naira)}
                {config.wallet_conversion_fee_naira > 0
                  ? ` • Fee: ${formatNaira(config.wallet_conversion_fee_naira)}`
                  : ' • Zero Fee'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Amount to Transfer (NGN)
              </label>
              <input
                type="number"
                min={config.min_wallet_conversion_naira}
                max={balance.available_balance}
                step="0.01"
                required
                value={walletAmount}
                onChange={e => setWalletAmount(e.target.value)}
                placeholder={`Min ${config.min_wallet_conversion_naira}`}
                disabled={!config.wallet_conversion_enabled || submitting}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold tabular-nums text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={!config.wallet_conversion_enabled || submitting || balance.available_balance <= 0}
              className="w-full py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold transition"
            >
              {config.wallet_conversion_enabled ? 'Convert to Wallet Balance' : 'Wallet Conversion Temporarily Paused'}
            </button>
          </form>

          <form
            onSubmit={handlePointsConvertSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Redeem Loyalty Points to Wallet</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                Points Balance: <strong>{balance.points_balance.toLocaleString()} pts</strong> &bull; Rate: 1 pt ={' '}
                {formatNaira(config.point_value_naira)} &bull; Min: {config.min_points_conversion} pts
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Points to Redeem
              </label>
              <input
                type="number"
                min={config.min_points_conversion}
                max={balance.points_balance}
                step={1}
                required
                value={pointsInput}
                onChange={e => setPointsInput(e.target.value)}
                placeholder={`Min ${config.min_points_conversion} pts`}
                disabled={submitting}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold tabular-nums text-slate-900 dark:text-white"
              />
              {estPointsValue > 0 && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1.5 tabular-nums">
                  Wallet Credit Preview: {formatNaira(estPointsValue)}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || balance.points_balance < config.min_points_conversion}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition"
            >
              Redeem Points to Main Wallet
            </button>
          </form>
        </div>
      )}

      {/* TAB: BANK CASH WITHDRAWAL */}
      {activeTab === 'withdraw' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleWithdrawSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Request Bank Withdrawal</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                Available: <strong>{formatNaira(balance.available_balance)}</strong>
                {config.require_kyc_level_for_withdrawal > 1 && ` • Requires KYC Level ${config.require_kyc_level_for_withdrawal}+`}
              </p>
            </div>

            {user && user.kyc_level < config.require_kyc_level_for_withdrawal && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                Your current KYC Level is {user.kyc_level}. Bank cash withdrawals require KYC Level {config.require_kyc_level_for_withdrawal}.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Withdrawal Amount (NGN)
              </label>
              <input
                type="number"
                required
                min={config.min_withdrawal_naira}
                max={config.max_withdrawal_naira}
                step="0.01"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                placeholder={`${config.min_withdrawal_naira} - ${config.max_withdrawal_naira}`}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                required
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="e.g. Access Bank, OPAY, GTBank"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Account Number (10-digit NUBAN)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                required
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="0123456789"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Account Holder Name
              </label>
              <input
                type="text"
                required
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                placeholder="Account beneficiary full name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            {wdAmountNum > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1 tabular-nums">
                <div className="flex justify-between text-slate-500">
                  <span>Processing Fee:</span>
                  <span>{formatNaira(estFee)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                  <span>Net Bank Payout:</span>
                  <span className="text-emerald-700 dark:text-emerald-400">{formatNaira(estNetPayout)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!config.withdrawal_enabled || submitting}
              className="w-full py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold transition"
            >
              {config.withdrawal_enabled ? 'Submit Payout Request' : 'Cash Withdrawals Disabled'}
            </button>
          </form>

          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Bank Withdrawal History ({withdrawals.length})
            </h2>
            {withdrawals.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No cash withdrawal requests yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {withdrawals.map(wd => (
                  <div key={wd.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                        <span className="font-mono">{wd.withdrawal_number}</span>
                        <span className={`uppercase text-[11px] ${STATUS_STYLE[wd.status] || 'text-slate-500'}`}>
                          {wd.status}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        {wd.bank_name} &bull; {wd.account_number} ({wd.account_name})
                      </p>
                      {wd.payment_reference && (
                        <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                          Bank Ref: {wd.payment_reference}
                        </p>
                      )}
                      {wd.rejection_reason && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400">{wd.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right tabular-nums">
                        <p className="font-bold text-slate-900 dark:text-white">{formatNaira(wd.net_amount)}</p>
                        <p className="text-[11px] text-slate-400">Fee: {formatNaira(wd.fee_amount)}</p>
                      </div>
                      {wd.status === 'pending' && (
                        <button
                          type="button"
                          disabled={cancellingId === wd.id}
                          onClick={() => handleCancelWithdrawal(wd.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{cancellingId === wd.id ? 'Cancelling...' : 'Cancel'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: REFERRALS & REWARDS LEDGER */}
      {activeTab === 'ledger' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Referred Customers ({referred_users.length})
            </h2>
            {referred_users.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                Share your referral code <span className="font-mono font-bold">{data.referral_code}</span> to see signups here.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {referred_users.map(ref => (
                  <div key={ref.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {ref.customer_label || 'Customer'}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {ref.qualifying_tx_count} txns &bull; {formatNaira(ref.qualifying_spend_total)} spend &bull;{' '}
                        {new Date(ref.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="font-bold text-slate-900 dark:text-white">{formatNaira(ref.reward_earned_total)}</p>
                      <p className={`text-[11px] font-semibold uppercase ${STATUS_STYLE[ref.status] || 'text-slate-500'}`}>
                        {ref.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Rewards &amp; Points Ledger
            </h2>
            {rewards.length === 0 && points_ledger.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No rewards or points recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto pr-1">
                {rewards.map(rw => (
                  <div key={rw.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white capitalize">
                        {rw.service_category.replace(/_/g, ' ')} {rw.referred_customer ? `• ${rw.referred_customer}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {rw.source_reference} &bull; {new Date(rw.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {formatNaira(rw.reward_cash)} {rw.reward_points > 0 ? `+ ${rw.reward_points} pts` : ''}
                      </p>
                      <p className={`text-[11px] font-semibold uppercase ${STATUS_STYLE[rw.status] || 'text-slate-500'}`}>
                        {rw.status}
                      </p>
                    </div>
                  </div>
                ))}
                {points_ledger.map(pt => (
                  <div key={pt.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{pt.description}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {pt.reference} &bull; {new Date(pt.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className={`font-bold ${pt.entry_type === 'CREDIT' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        {pt.entry_type === 'CREDIT' ? '+' : '-'}{pt.points} pts
                      </p>
                      {pt.naira_value > 0 && <p className="text-[11px] text-slate-400">{formatNaira(pt.naira_value)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transaction PIN Modal */}
      <TransactionPinModal
        isOpen={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingAction(null);
        }}
        title="Authorize Referral Action"
        amount={
          pendingAction?.type === 'wallet_convert' || pendingAction?.type === 'withdraw'
            ? pendingAction.amount
            : undefined
        }
        onSuccess={(verifiedPin) => {
          setPinModalOpen(false);
          void executeAction(pendingAction, verifiedPin || '');
        }}
      />
    </div>
  );
};
