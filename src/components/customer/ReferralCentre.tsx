import React, { useEffect, useState, useMemo } from 'react';
import {
  Gift,
  Copy,
  Check,
  Share2,
  Wallet,
  Sparkles,
  Landmark,
  Users,
  Award,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Ban,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { CustomerReferralDashboard } from '../../types';
import { TransactionPinModal } from './TransactionPinModal';

const NIGERIAN_BANKS = [
  'Access Bank',
  'First Bank of Nigeria',
  'GTBank (Guaranty Trust Bank)',
  'United Bank for Africa (UBA)',
  'Zenith Bank',
  'Opay',
  'PalmPay',
  'Moniepoint MFB',
  'Kuda Bank',
  'Fidelity Bank',
  'First City Monument Bank (FCMB)',
  'Stanbic IBTC Bank',
  'Sterling Bank',
  'Union Bank of Nigeria',
  'Wema Bank',
  'Keystone Bank',
  'Polaris Bank',
  'Jaiz Bank',
  'TAJBank',
  'Providus Bank',
  'Other',
];

type LedgerTab = 'referred' | 'rewards' | 'withdrawals' | 'points';

type PendingPinAction =
  | { type: 'wallet'; amount: number }
  | { type: 'points'; points: number }
  | {
      type: 'withdrawal';
      amount: number;
      bank_name: string;
      account_number: string;
      account_name: string;
    };

export function ReferralCentre() {
  const { user, refreshUser, openPinSetupModal } = useAuth();
  const [dashboard, setDashboard] = useState<CustomerReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<LedgerTab>('referred');

  // Convert to Wallet form
  const [walletAmount, setWalletAmount] = useState('');
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);

  // Convert Points form
  const [pointsAmount, setPointsAmount] = useState('');

  // Bank Withdrawal form
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedBank, setSelectedBank] = useState(NIGERIAN_BANKS[0]);
  const [customBankName, setCustomBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  // Cancellation state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // PIN confirmation
  const [pendingAction, setPendingAction] = useState<PendingPinAction | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCustomerReferralDashboard();
      if (res && res.success) {
        setDashboard(res);
      } else {
        setError('Unable to load referral dashboard data.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch referral & rewards summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const shareUrl = useMemo(() => {
    if (!dashboard?.referral_code && !user?.referral_code) return '';
    const path = dashboard?.share_path || `/?ref=${encodeURIComponent(dashboard?.referral_code || user?.referral_code || '')}`;
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
  }, [dashboard, user]);

  const handleCopyCode = () => {
    const code = dashboard?.referral_code || user?.referral_code;
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleWebShare = async () => {
    if (!shareUrl) return;
    const text = `Join me on HAMBAKTECH for fast NIN/BVN verification, data & utility bills! Use my code ${dashboard?.referral_code || user?.referral_code || ''}:`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Join HAMBAKTECH & Earn Rewards',
          text,
          url: shareUrl,
        });
        return;
      } catch {
        // User dismissed or unsupported; fall back cleanly to copy
      }
    }
    handleCopyLink();
    setFeedback({ type: 'success', message: 'Invite link copied to clipboard.' });
  };

  const requirePinOrExecute = (action: PendingPinAction) => {
    setFeedback(null);
    if (!user?.has_transaction_pin || user?.requires_pin_setup) {
      openPinSetupModal();
      return;
    }
    setPendingAction(action);
    setPinModalOpen(true);
  };

  const handleWalletConvertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    const amt = Number(walletAmount);
    const minConv = Number(dashboard.config.min_wallet_conversion || 0);
    const avail = Number(dashboard.balances.available_balance || 0);

    if (!Number.isFinite(amt) || amt <= 0) {
      setFeedback({ type: 'error', message: 'Enter a valid naira amount to convert.' });
      return;
    }
    if (amt < minConv) {
      setFeedback({ type: 'error', message: `Minimum wallet conversion is ₦${minConv.toLocaleString()}.` });
      return;
    }
    if (amt > avail) {
      setFeedback({ type: 'error', message: 'Amount exceeds your available referral balance.' });
      return;
    }
    requirePinOrExecute({ type: 'wallet', amount: amt });
  };

  const handlePointsConvertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    const pts = Math.floor(Number(pointsAmount));
    const minPts = Number(dashboard.config.min_points_to_convert || 1);
    const balPts = Number(dashboard.balances.points_balance || 0);

    if (!Number.isFinite(pts) || pts <= 0) {
      setFeedback({ type: 'error', message: 'Enter a valid number of points to redeem.' });
      return;
    }
    if (pts < minPts) {
      setFeedback({ type: 'error', message: `Minimum points conversion is ${minPts.toLocaleString()} pts.` });
      return;
    }
    if (pts > balPts) {
      setFeedback({ type: 'error', message: 'Points exceed your current loyalty points balance.' });
      return;
    }
    requirePinOrExecute({ type: 'points', points: pts });
  };

  const handleWithdrawalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    const amt = Number(withdrawAmount);
    const minW = Number(dashboard.config.min_bank_withdrawal || 0);
    const maxW = Number(dashboard.config.max_bank_withdrawal || 0);
    const avail = Number(dashboard.balances.available_balance || 0);
    const bankName = selectedBank === 'Other' ? customBankName.trim() : selectedBank;
    const acctNo = accountNumber.replace(/\D/g, '');
    const acctName = accountName.trim();

    if (!Number.isFinite(amt) || amt <= 0) {
      setFeedback({ type: 'error', message: 'Enter a valid withdrawal amount.' });
      return;
    }
    if (amt < minW) {
      setFeedback({ type: 'error', message: `Minimum bank withdrawal is ₦${minW.toLocaleString()}.` });
      return;
    }
    if (maxW > 0 && amt > maxW) {
      setFeedback({ type: 'error', message: `Maximum bank withdrawal is ₦${maxW.toLocaleString()}.` });
      return;
    }
    if (amt > avail) {
      setFeedback({ type: 'error', message: 'Amount exceeds your available referral balance.' });
      return;
    }
    if (!bankName) {
      setFeedback({ type: 'error', message: 'Please specify your bank name.' });
      return;
    }
    if (acctNo.length !== 10) {
      setFeedback({ type: 'error', message: 'Account number must be exactly 10 digits (NUBAN).' });
      return;
    }
    if (acctName.length < 3) {
      setFeedback({ type: 'error', message: 'Please enter the exact bank account name.' });
      return;
    }

    requirePinOrExecute({
      type: 'withdrawal',
      amount: amt,
      bank_name: bankName,
      account_number: acctNo,
      account_name: acctName,
    });
  };

  const executeConfirmedAction = async (verifiedPin?: string) => {
    setPinModalOpen(false);
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    setSubmittingAction(action.type);
    setFeedback(null);

    try {
      if (action.type === 'wallet') {
        const res = await api.convertReferralToWallet(action.amount, verifiedPin);
        setFeedback({
          type: 'success',
          message: res.message || `₦${action.amount.toLocaleString()} credited to your main wallet (${res.reference}).`,
        });
        setWalletAmount('');
        await refreshUser();
      } else if (action.type === 'points') {
        const res = await api.convertReferralPoints(action.points, verifiedPin);
        setFeedback({
          type: 'success',
          message:
            res.message ||
            `${res.points_redeemed.toLocaleString()} pts redeemed for ₦${res.naira_credited.toLocaleString()} available balance.`,
        });
        setPointsAmount('');
      } else if (action.type === 'withdrawal') {
        const res = await api.requestReferralWithdrawal({
          amount: action.amount,
          bank_name: action.bank_name,
          account_number: action.account_number,
          account_name: action.account_name,
          transaction_pin: verifiedPin,
        });
        setFeedback({
          type: 'success',
          message: res.message || `Bank withdrawal request ${res.withdrawal?.reference || ''} submitted for review.`,
        });
        setWithdrawAmount('');
        setActiveTab('withdrawals');
      }
      await loadDashboard();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Action failed. Please check your inputs and try again.' });
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleCancelWithdrawal = async (id: string, reference: string) => {
    setCancellingId(id);
    setFeedback(null);
    try {
      const res = await api.cancelReferralWithdrawal(id);
      setFeedback({
        type: 'success',
        message: res.message || `Withdrawal ${reference} cancelled and funds returned to Available Balance.`,
      });
      await loadDashboard();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to cancel withdrawal request.' });
    } finally {
      setCancellingId(null);
    }
  };

  const feePreview = useMemo(() => {
    if (!dashboard) return { gross: 0, fee: 0, net: 0 };
    const gross = Math.max(0, Number(withdrawAmount) || 0);
    if (gross <= 0) return { gross: 0, fee: 0, net: 0 };
    const feeType = dashboard.config.bank_withdrawal_fee_type || 'fixed';
    const feeVal = Number(dashboard.config.bank_withdrawal_fee_value || 0);
    const fee = feeType === 'percent' ? Math.round((gross * feeVal) / 100 * 100) / 100 : feeVal;
    const net = Math.max(0, Math.round((gross - fee) * 100) / 100);
    return { gross, fee, net };
  }, [dashboard, withdrawAmount]);

  const pointsPreviewNaira = useMemo(() => {
    if (!dashboard) return 0;
    const pts = Math.max(0, Math.floor(Number(pointsAmount) || 0));
    return Math.round(pts * Number(dashboard.config.points_to_naira_rate || 0) * 100) / 100;
  }, [dashboard, pointsAmount]);

  const statusBadgeClass = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (['available', 'qualified', 'paid', 'approved'].includes(s)) {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    }
    if (['pending', 'processing'].includes(s)) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    }
    if (['rejected', 'failed', 'reversed', 'cancelled'].includes(s)) {
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    }
    return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
  };

  if (loading && !dashboard) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-indigo-400" />
        <p className="text-xs font-medium">Loading your referral earnings &amp; rewards ledger...</p>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-4">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
        <p className="text-sm font-bold text-slate-900 dark:text-white">{error}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  const { balances, stats, config, terms, current_tier, next_tier } = dashboard;
  const programDisabled = !config.enabled || !terms.enabled;

  const tierProgressPct = (() => {
    if (!next_tier) return 100;
    const reqUsers = Math.max(1, Number(next_tier.min_referred_users || 1));
    const userRatio = Math.min(1, Number(stats.qualified_referred || 0) / reqUsers);
    return Math.round(userRatio * 100);
  })();

  return (
    <div className="space-y-6">
      {/* Header Hero */}
      <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 border border-indigo-700/40 rounded-2xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[11px] font-semibold">
              <Gift className="w-3.5 h-3.5" />
              <span>HAMBAKTECH Referral &amp; Loyalty Programme</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {terms.headline || 'Invite Friends & Earn Real Rewards'}
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              {terms.reward_summary ||
                'Share your personal invite code. Whenever your invited friends complete qualifying transactions, you earn cash rewards and loyalty points.'}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-blue-200/90">
              <span>Min. Qualifying Purchase: <strong className="text-white">₦{Number(terms.min_qualifying_spend || 0).toLocaleString()}</strong></span>
              <span>&bull;</span>
              <span>Hold Window: <strong className="text-white">{Number(terms.settlement_hold_hours || 0)}h</strong></span>
              <span>&bull;</span>
              <span>Points Rate: <strong className="text-white">1 pt = ₦{Number(config.points_to_naira_rate || 0).toLocaleString()}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center">
            <button
              type="button"
              onClick={loadDashboard}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {programDisabled && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-100 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              New referral reward accruals are currently paused by the administrator. Existing available balances can still be managed below.
            </span>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* 4 Primary Balance KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Available Earnings</span>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            ₦{Number(balances.available_balance || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Ready to convert to wallet or withdraw
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Pending Hold Balance</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
            ₦{Number(balances.pending_balance || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Settles after {terms.settlement_hold_hours}h verification hold
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Reserved for Payout</span>
            <Landmark className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            ₦{Number(balances.reserved_for_withdrawal || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            In active withdrawal review queue
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Loyalty Points</span>
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
            {Number(balances.points_balance || 0).toLocaleString()} pts
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Est. value: ₦{(Number(balances.points_balance || 0) * Number(config.points_to_naira_rate || 0)).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Lifetime Stats + Tier Progress + Invite Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invite & Share Card */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Your Personal Invite Details</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Share your referral code or direct invite URL. Referrals are tracked automatically at registration.
              </p>
            </div>
            <Users className="w-5 h-5 text-blue-600 dark:text-indigo-400 shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Referral Code</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-base font-extrabold font-mono text-blue-700 dark:text-emerald-400 tracking-wider">
                  {dashboard.referral_code}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                  title="Copy Code"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Shareable Invite URL</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                  {shareUrl}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[11px] font-semibold flex items-center gap-1 transition"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleWebShare}
                    className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                    title="Share Invite Link"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Lifetime mini-stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Earned</p>
              <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                ₦{Number(balances.total_earned || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Converted to Wallet</p>
              <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                ₦{Number(balances.total_converted || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Bank Paid Out</p>
              <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                ₦{Number(balances.total_withdrawn || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Qualified Friends</p>
              <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {stats.qualified_referred} / {stats.total_referred}
              </p>
            </div>
          </div>

          {/* Collapsible Terms */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => setTermsOpen(!termsOpen)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-indigo-400 transition"
            >
              <span>Programme Rules &amp; Terms</span>
              {termsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {termsOpen && (
              <div className="mt-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                {terms.terms_and_conditions ||
                  'Only settled non-reversed purchases meeting minimum qualifying spend generate rewards. Self-referrals and duplicate accounts are prohibited.'}
              </div>
            )}
          </div>
        </div>

        {/* Loyalty Tier Status Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Referrer Tier
              </span>
              <Award className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {current_tier?.name || 'Starter Partner'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {current_tier
                  ? `${current_tier.commission_multiplier}x reward multiplier • ${current_tier.points_multiplier}x points`
                  : 'Complete qualified referrals to unlock tier multipliers.'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className="text-slate-500 dark:text-slate-400">
                {next_tier ? `Next: ${next_tier.name}` : 'Highest Tier Unlocked'}
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{tierProgressPct}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all"
                style={{ width: `${tierProgressPct}%` }}
              />
            </div>
            {next_tier ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Reach {next_tier.min_referred_users} qualified referrals &amp; ₦
                {Number(next_tier.min_referred_revenue || 0).toLocaleString()} referred spend to unlock{' '}
                <strong className="text-slate-700 dark:text-slate-200">{next_tier.commission_multiplier}x rewards</strong>.
              </p>
            ) : (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                You are enjoying top-tier referral multipliers!
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3 Action Cards: Wallet Conversion, Points Redemption, Bank Withdrawal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Convert Earnings to Main Wallet */}
        <form
          onSubmit={handleWalletConvertSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Convert to Wallet</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Instant main wallet credit</p>
                </div>
              </div>
              <Lock className="w-3.5 h-3.5 text-slate-400" />
            </div>

            {!config.wallet_conversion_enabled ? (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                Wallet conversion is currently disabled by administrator.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Amount (₦)
                  </label>
                  <input
                    type="number"
                    min={config.min_wallet_conversion || 1}
                    max={balances.available_balance || 0}
                    step="0.01"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    placeholder={`Min ₦${Number(config.min_wallet_conversion || 0).toLocaleString()}`}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[500, 1000, 2000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={balances.available_balance < preset}
                      onClick={() => setWalletAmount(String(preset))}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-[11px] font-mono text-slate-700 dark:text-slate-300 transition"
                    >
                      ₦{preset.toLocaleString()}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={balances.available_balance <= 0}
                    onClick={() => setWalletAmount(String(balances.available_balance))}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 disabled:opacity-40 text-[11px] font-semibold transition"
                  >
                    Max
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={
              !config.wallet_conversion_enabled ||
              submittingAction === 'wallet' ||
              Number(balances.available_balance || 0) < Number(config.min_wallet_conversion || 0)
            }
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
          >
            {submittingAction === 'wallet' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Convert to Wallet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* 2. Redeem Loyalty Points */}
        <form
          onSubmit={handlePointsConvertSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Redeem Points</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    1 pt = ₦{Number(config.points_to_naira_rate || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <Lock className="w-3.5 h-3.5 text-slate-400" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Points to Redeem
              </label>
              <input
                type="number"
                min={config.min_points_to_convert || 1}
                max={balances.points_balance || 0}
                step="1"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(e.target.value)}
                placeholder={`Min ${Number(config.min_points_to_convert || 1).toLocaleString()} pts`}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Available Earnings Credit:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                ₦{pointsPreviewNaira.toLocaleString()}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              submittingAction === 'points' ||
              Number(balances.points_balance || 0) < Number(config.min_points_to_convert || 1)
            }
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
          >
            {submittingAction === 'points' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Redeem Points</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* 3. Request Bank Withdrawal */}
        <form
          onSubmit={handleWithdrawalSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3.5 shadow-sm flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Bank Withdrawal</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Admin-verified cash payout</p>
                </div>
              </div>
              <Lock className="w-3.5 h-3.5 text-slate-400" />
            </div>

            {!config.bank_withdrawal_enabled ? (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                Bank cash withdrawals are currently disabled by administrator.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Amount (₦)
                    </label>
                    <input
                      type="number"
                      min={config.min_bank_withdrawal || 1}
                      max={config.max_bank_withdrawal || undefined}
                      step="1"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={`Min ₦${Number(config.min_bank_withdrawal || 0).toLocaleString()}`}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Bank Name
                    </label>
                    <select
                      value={selectedBank}
                      onChange={(e) => setSelectedBank(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                    >
                      {NIGERIAN_BANKS.map((bank) => (
                        <option key={bank} value={bank}>
                          {bank}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedBank === 'Other' && (
                  <input
                    type="text"
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                    placeholder="Enter bank or microfinance name"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit Account No."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Account Holder Name"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                {feePreview.gross > 0 && (
                  <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">
                      Fee: ₦{feePreview.fee.toLocaleString()}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      Net Payout: ₦{feePreview.net.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={
              !config.bank_withdrawal_enabled ||
              submittingAction === 'withdrawal' ||
              Number(balances.available_balance || 0) < Number(config.min_bank_withdrawal || 0)
            }
            className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
          >
            {submittingAction === 'withdrawal' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Request Bank Withdrawal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Ledgers Navigation & Tables */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          {[
            { id: 'referred' as LedgerTab, label: `Referred Friends (${dashboard.referred_users.length})`, icon: Users },
            { id: 'rewards' as LedgerTab, label: `Rewards Ledger (${dashboard.rewards.length})`, icon: Gift },
            { id: 'withdrawals' as LedgerTab, label: `Withdrawals (${dashboard.withdrawals.length})`, icon: Landmark },
            { id: 'points' as LedgerTab, label: `Points & Monthly Trend`, icon: TrendingUp },
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
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 1. Referred Users */}
        {activeTab === 'referred' && (
          <div className="overflow-x-auto">
            {dashboard.referred_users.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <Users className="w-7 h-7 mx-auto text-slate-400 mb-2" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">No referred users yet</p>
                <p>Share your referral code or invite link to start growing your rewards network.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Invited User (Privacy Masked)</th>
                    <th className="py-3 px-4">Joined</th>
                    <th className="py-3 px-4">Campaign</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Qualifying Spend</th>
                    <th className="py-3 px-4">Reward Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {dashboard.referred_users.map((ref) => (
                    <tr key={ref.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {ref.masked_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(ref.joined_at || ref.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {ref.campaign_code || 'Standard'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusBadgeClass(ref.status)}`}>
                          {ref.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        ₦{Number(ref.qualifying_spend || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +₦{Number(ref.earned_from_user || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 2. Rewards Ledger */}
        {activeTab === 'rewards' && (
          <div className="overflow-x-auto">
            {dashboard.rewards.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <Gift className="w-7 h-7 mx-auto text-slate-400 mb-2" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">No rewards earned yet</p>
                <p>Rewards appear here whenever a referred customer completes a qualifying transaction.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Date &amp; Ref</th>
                    <th className="py-3 px-4">Referee</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Order Amt</th>
                    <th className="py-3 px-4">Reward</th>
                    <th className="py-3 px-4">Status &amp; Hold Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {dashboard.rewards.map((rw) => (
                    <tr key={rw.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <p className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                          {rw.source_reference}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {new Date(rw.created_at).toLocaleString()}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-medium">{rw.referred_masked_name || 'Member'}</td>
                      <td className="py-3 px-4 capitalize">
                        {String(rw.service_category || 'service').replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        ₦{Number(rw.tx_amount || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          +₦{Number(rw.reward_amount || 0).toLocaleString()}
                        </span>
                        {Number(rw.points_awarded || 0) > 0 && (
                          <span className="block text-[10px] text-indigo-600 dark:text-indigo-400">
                            +{rw.points_awarded} pts
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusBadgeClass(rw.status)}`}>
                          {rw.status}
                        </span>
                        {rw.status === 'pending' && rw.settles_at && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Settles: {new Date(rw.settles_at).toLocaleString()}
                          </p>
                        )}
                        {rw.status_reason && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-xs">
                            {rw.status_reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 3. Withdrawal History */}
        {activeTab === 'withdrawals' && (
          <div className="overflow-x-auto">
            {dashboard.withdrawals.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <Landmark className="w-7 h-7 mx-auto text-slate-400 mb-2" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">No withdrawal requests yet</p>
                <p>Submit a bank payout request above whenever your available earnings meet the minimum threshold.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Reference &amp; Date</th>
                    <th className="py-3 px-4">Bank Destination</th>
                    <th className="py-3 px-4">Gross / Fee / Net</th>
                    <th className="py-3 px-4">Status &amp; Payout Details</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {dashboard.withdrawals.map((wd) => (
                    <tr key={wd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <p className="font-mono font-bold text-slate-900 dark:text-white">{wd.reference}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {new Date(wd.created_at).toLocaleString()}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{wd.bank_name}</p>
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {wd.account_number} &bull; {wd.account_name}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <p className="font-bold text-emerald-600 dark:text-emerald-400">
                          Net: ₦{Number(wd.net_amount || 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Gross ₦{Number(wd.gross_amount || 0).toLocaleString()} (Fee ₦{Number(wd.fee_amount || 0).toLocaleString()})
                        </p>
                      </td>
                      <td className="py-3 px-4 space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusBadgeClass(wd.status)}`}>
                          {wd.status}
                        </span>
                        {wd.payment_reference && (
                          <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                            Pay Ref: {wd.payment_reference}
                          </p>
                        )}
                        {wd.rejection_reason && (
                          <p className="text-[10px] text-red-500 max-w-xs">{wd.rejection_reason}</p>
                        )}
                        {wd.payout_notes && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-xs">{wd.payout_notes}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {wd.status === 'pending' && (
                          <button
                            type="button"
                            disabled={cancellingId === wd.id}
                            onClick={() => handleCancelWithdrawal(wd.id, wd.reference)}
                            className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                          >
                            {cancellingId === wd.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Ban className="w-3 h-3" />
                            )}
                            <span>Cancel</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 4. Points Ledger & Monthly Trend */}
        {activeTab === 'points' && (
          <div className="p-5 space-y-6">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                6-Month Earnings Summary
              </h4>
              {dashboard.monthly_trend.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No monthly reward history yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {dashboard.monthly_trend.map((m) => (
                    <div
                      key={m.month}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1"
                    >
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{m.month}</p>
                      <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        ₦{Number(m.cash_earned || 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {m.reward_count} rewards &bull; {m.points_earned} pts
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              {dashboard.points_ledger.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No loyalty points movements recorded yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Date &amp; Ref</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Points</th>
                      <th className="py-3 px-4">Balance After</th>
                      <th className="py-3 px-4">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {dashboard.points_ledger.map((pt) => (
                      <tr key={pt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <p className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                            {pt.reference}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {new Date(pt.created_at).toLocaleString()}
                          </p>
                        </td>
                        <td className="py-3 px-4 capitalize font-semibold">{pt.type}</td>
                        <td className={`py-3 px-4 font-mono font-bold ${pt.points >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500'}`}>
                          {pt.points >= 0 ? `+${pt.points}` : pt.points} pts
                        </td>
                        <td className="py-3 px-4 font-mono">{pt.balance_after} pts</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{pt.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transaction PIN Modal */}
      <TransactionPinModal
        isOpen={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={(verifiedPin) => executeConfirmedAction(verifiedPin)}
        title={
          pendingAction?.type === 'wallet'
            ? 'Authorize Wallet Conversion'
            : pendingAction?.type === 'points'
              ? 'Authorize Points Redemption'
              : 'Authorize Bank Withdrawal'
        }
        description={
          pendingAction?.type === 'wallet'
            ? `Transfer ₦${pendingAction.amount.toLocaleString()} from Referral Earnings to your main wallet.`
            : pendingAction?.type === 'points'
              ? `Redeem ${pendingAction.points.toLocaleString()} loyalty points into Available Referral Earnings.`
              : pendingAction?.type === 'withdrawal'
                ? `Request bank payout of ₦${pendingAction.amount.toLocaleString()} to ${pendingAction.bank_name} (${pendingAction.account_number}).`
                : undefined
        }
        amount={
          pendingAction?.type === 'wallet' || pendingAction?.type === 'withdrawal'
            ? pendingAction.amount
            : undefined
        }
      />
    </div>
  );
}
