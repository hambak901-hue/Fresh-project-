/**
 * @file DashboardOverview.tsx
 * Customer Dashboard Overview page displaying:
 * - Available wallet balance
 * - Total, successful, pending, and failed transactions (tabular figures)
 * - Quick service access grid
 * - Recent activities feed
 * - Recent orders
 * - Notifications & Announcements
 * Powered by real backend data via /api/customer/summary.
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useCms } from '../../context/CmsContext';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Smartphone,
  Zap,
  CheckCircle2,
  Clock,
  XCircle,
  Bell,
  ChevronRight,
  RefreshCw,
  Plus,
  ArrowRight,
  Printer,
  GraduationCap,
  QrCode,
  Gift,
  BookOpen,
  Lock,
  Copy,
  Check,
  Building,
} from 'lucide-react';
import {
  AcademyAccessSummary,
  AcademyApplication,
  AcademyStudent,
  DashboardKey,
  RoleDashboardConfig,
} from '../../types';
import { getDashboardLabel } from '../../lib/roles';
import { StudentIdCardModal } from '../academy/StudentIdCardModal';

interface DashboardOverviewProps {
  onNavigateToPage: (page: string) => void;
  onOpenFundModal: () => void;
  effectiveDashboardKey?: DashboardKey;
  activeConfig?: RoleDashboardConfig | null;
  previewAcademyData?: any;
  isPreviewMode?: boolean;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onNavigateToPage,
  onOpenFundModal,
  effectiveDashboardKey = 'customer',
  activeConfig,
  previewAcademyData,
  isPreviewMode = false,
}) => {
  const { user } = useAuth();
  const { rates } = useCms();
  const airtimeDiscountPercent = rates?.airtime_discount_percent ?? 2.5;
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [academyStudents, setAcademyStudents] = useState<AcademyStudent[]>([]);
  const [academyApps, setAcademyApps] = useState<AcademyApplication[]>([]);
  const [academyAccess, setAcademyAccess] = useState<AcademyAccessSummary | null>(null);
  const [academyCoursesCount, setAcademyCoursesCount] = useState<number>(12);
  const [idCardStudent, setIdCardStudent] = useState<AcademyStudent | null>(null);
  const [copiedOverviewAcc, setCopiedOverviewAcc] = useState<boolean>(false);

  useEffect(() => {
    loadSummary();
  }, [effectiveDashboardKey]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const shouldFetchAcademy =
        effectiveDashboardKey === 'student' ||
        Boolean(previewAcademyData) ||
        Boolean(user && !isPreviewMode);
      const [sumRes, acadRes] = await Promise.all([
        api.getCustomerSummary().catch(() => null),
        shouldFetchAcademy ? api.getCustomerAcademy().catch(() => null) : Promise.resolve(null),
      ]);
      if (sumRes?.success) {
        setSummary(sumRes);
      }
      if (acadRes?.success) {
        setAcademyStudents(acadRes.students || previewAcademyData?.sample_students || []);
        setAcademyApps(acadRes.applications || []);
        setAcademyAccess(acadRes.access || null);
        setAcademyCoursesCount((acadRes.courses || []).length || previewAcademyData?.courses_count || 12);
      } else if (previewAcademyData) {
        setAcademyStudents(previewAcademyData.sample_students || []);
        setAcademyCoursesCount(previewAcademyData.courses_count || 12);
      }
    } catch (err) {
      console.warn('Failed to load dashboard summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const metrics = summary?.metrics || {
    wallet_balance: user?.wallet_balance || 0,
    total_transactions: 0,
    successful_transactions: 0,
    pending_transactions: 0,
    failed_transactions: 0,
  };

  const sections = activeConfig?.sections || {};
  const showSection = (key: string, defaultVal = true): boolean =>
    key in sections ? Boolean(sections[key]) : defaultVal;

  const activeEnrollment =
    academyStudents.find((s) => s.academic_status === 'active' || s.academic_status === 'graduated') || null;
  const needsEmailVerification = Boolean(
    user && !isPreviewMode && user.email_verification_required && !user.email_verified
  );

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <span>{activeConfig?.badge_text || getDashboardLabel(effectiveDashboardKey)}</span>
            <span className="text-slate-600">&bull;</span>
            <button
              onClick={() => onNavigateToPage('kyc')}
              className="hover:underline flex items-center gap-1 text-slate-300 hover:text-emerald-400 transition"
            >
              <span>Level {user?.kyc_level ?? (user?.kyc_status === 'verified' ? 2 : 1)}</span>
              <span className="text-slate-600">&bull;</span>
              <span className="uppercase text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                KYC {user?.kyc_status?.toUpperCase() || 'VERIFIED'}
              </span>
            </button>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
            {isPreviewMode
              ? activeConfig?.title || getDashboardLabel(effectiveDashboardKey)
              : `Welcome, ${user?.full_name || 'Customer'}`}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeConfig?.subtitle ||
              'Your real-time operations dashboard for Nigerian telecom vending, identity lookups, and wallet management.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSummary}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onOpenFundModal}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Fund Wallet</span>
          </button>
        </div>
      </div>

      {/* STUDENT ACADEMY WORKSPACE HERO (Enrolled Students or Student Role Preview) */}
      {(effectiveDashboardKey === 'student' || academyAccess?.can_access_student_hub) &&
        showSection('student_academy_hero', true) && (
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-blue-950/60 border border-emerald-500/30 space-y-4 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  Digital Training Academy — Student Hub
                </h2>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                  {activeEnrollment
                    ? `Enrolled in ${activeEnrollment.course_title} (${activeEnrollment.student_id}) • Status: ${activeEnrollment.academic_status.toUpperCase()}`
                    : academyAccess?.has_approved_awaiting_enrollment
                    ? 'Your Academy admission is approved! Open My Academy to verify prerequisites and complete enrollment for your Student ID Card.'
                    : `Explore all ${academyCoursesCount} official training tracks, check application progress, and track admission status.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {activeEnrollment && (
                <button
                  type="button"
                  onClick={() => setIdCardStudent(activeEnrollment)}
                  className="px-3.5 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition"
                >
                  <QrCode className="w-4 h-4 text-blue-700" />
                  <span>View Student ID Card</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigateToPage('academy')}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition"
              >
                <BookOpen className="w-4 h-4" />
                <span>{academyAccess?.has_approved_awaiting_enrollment && !activeEnrollment ? 'Complete Enrollment' : 'Open My Academy & Courses'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-emerald-500/20 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Available Courses</span>
              <span className="font-mono font-bold text-white text-base tabular-nums">{academyCoursesCount} Tracks</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">My Applications</span>
              <span className="font-mono font-bold text-amber-300 text-base tabular-nums">{academyApps.length}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Active Enrollments / ID Cards</span>
              <span className="font-mono font-bold text-emerald-400 text-base tabular-nums">{academyStudents.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* ACADEMY APPLICATION STATUS STRIP FOR NON-ENROLLED APPLICANTS (Customer / Agent) */}
      {effectiveDashboardKey !== 'student' &&
        !academyAccess?.can_access_student_hub &&
        academyApps.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-teal-950/40 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {academyAccess?.has_approved_awaiting_enrollment
                  ? 'Academy Admission Approved — Complete Enrollment'
                  : `Academy Application Status (${academyApps.length} on file)`}
              </h3>
              <p className="text-xs text-slate-300">
                {academyAccess?.has_approved_awaiting_enrollment
                  ? 'Review enrollment requirements and activate your official Student ID Card.'
                  : `Latest reference: ${academyApps[0].application_ref} (${academyApps[0].status.replace(/_/g, ' ')})`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToPage('academy')}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shrink-0 flex items-center gap-1.5"
          >
            <span>{academyAccess?.has_approved_awaiting_enrollment ? 'Complete Enrollment' : 'Open My Academy'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* AGENT / RESELLER PARTNER DESK PANEL */}
      {effectiveDashboardKey === 'agent' && showSection('agent_reseller_panel', true) && (
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-sky-950/70 via-slate-900 to-indigo-950/60 border border-sky-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Authorized Agent &amp; Reseller Desk</h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Access bulk telecom vending, NIMC/BVN identity services, printing orders, and track partner referral commissions.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateToPage('referrals')}
              className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition"
            >
              <Gift className="w-4 h-4" />
              <span>Agent Commissions</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateToPage('nin')}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs whitespace-nowrap transition"
            >
              Identity Desk
            </button>
          </div>
        </div>
      )}

      {/* KYC Tier Upgrade Banner */}
      {showSection('kyc_upgrade_banner', true) && (!user?.kyc_level || user?.kyc_level < 2) && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Upgrade to Level 2 Identity Verification</h3>
              <p className="text-xs text-slate-400">
                Unlock individual dedicated virtual bank accounts (NUBAN), ₦200,000 daily limits, and sovereign NIN verification.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToPage('kyc')}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 flex items-center gap-1.5 shadow-md transition"
          >
            <span>Verify KYC Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Stats Grid */}
      {(showSection('wallet_balance_card', true) || showSection('transaction_kpis', true)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Wallet Balance Card */}
          {showSection('wallet_balance_card', true) && (
        <div className="sm:col-span-2 lg:col-span-1 rounded-2xl bg-gradient-to-tr from-slate-900 to-emerald-950/40 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase text-[10px] tracking-wider">Available Balance</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono tabular-nums">
            ₦{Number(metrics.wallet_balance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/80">
            <span className="text-slate-400">
              {needsEmailVerification ? 'Status: Email Verification Pending' : 'Status: Active'}
            </span>
            <button
              onClick={() => onNavigateToPage('wallet')}
              className="text-emerald-400 hover:underline font-semibold flex items-center gap-0.5"
            >
                <span>Manage Wallet</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
          )}

          {/* Successful Transactions */}
        {showSection('transaction_kpis', true) && (
          <>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase text-[10px] tracking-wider">Successful Operations</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-extrabold text-white font-mono tabular-nums">
                {metrics.successful_transactions}
              </div>
              <div className="text-[11px] text-slate-400">
                Total Logged: <span className="text-slate-200 font-mono font-bold">{metrics.total_transactions}</span>
              </div>
            </div>

            {/* Pending Operations */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase text-[10px] tracking-wider">Pending Processing</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-extrabold text-white font-mono tabular-nums">
                {metrics.pending_transactions}
              </div>
              <div className="text-[11px] text-slate-400">
                Paystack &amp; KYC reviews
              </div>
            </div>

            {/* Failed Operations */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase text-[10px] tracking-wider">Failed / Cancelled</span>
                <XCircle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-3xl font-extrabold text-white font-mono tabular-nums">
                {metrics.failed_transactions}
              </div>
              <div className="text-[11px] text-slate-400">
                Automatically refunded
              </div>
            </div>
          </>
        )}
        </div>
      )}

      {/* Quick Service Access Grid */}
      {showSection('quick_actions_grid', true) && (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Quick Actions</h2>
          {needsEmailVerification && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
              <Lock className="w-3 h-3" />
              <span>Verify email to unlock services</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigateToPage('nin')}
            className="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-left space-y-2 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-4 h-4" />
              </div>
              {needsEmailVerification && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div>
              <div className="text-xs font-bold text-white">Verify NIN / BVN</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {needsEmailVerification ? 'Locked until email verified' : 'Instant sovereign slip generation'}
              </div>
            </div>
          </button>

          <button
            onClick={() => onNavigateToPage('telecom')}
            className="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/40 text-left space-y-2 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Smartphone className="w-4 h-4" />
              </div>
              {needsEmailVerification && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div>
              <div className="text-xs font-bold text-white">Buy SME Data</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {needsEmailVerification ? 'Locked until email verified' : 'MTN 1GB from ₦270'}
              </div>
            </div>
          </button>

          <button
            onClick={() => onNavigateToPage('telecom')}
            className="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 text-left space-y-2 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-4 h-4" />
              </div>
              {needsEmailVerification && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div>
              <div className="text-xs font-bold text-white">Recharge Airtime</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {needsEmailVerification ? 'Locked until email verified' : `Instant ${airtimeDiscountPercent}% cashback discount`}
              </div>
            </div>
          </button>

          <button
            onClick={onOpenFundModal}
            className="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/40 text-left space-y-2 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Wallet className="w-4 h-4" />
              </div>
              {needsEmailVerification && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div>
              <div className="text-xs font-bold text-white">Fund Wallet</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {needsEmailVerification ? 'Verify email to unlock' : 'Card & virtual accounts'}
              </div>
            </div>
          </button>

          <button
            onClick={() => onNavigateToPage('printing')}
            className="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/40 text-left space-y-2 transition-all group col-span-2 sm:col-span-4 lg:col-span-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Printing &amp; Document Services</span>
                    {needsEmailVerification && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {needsEmailVerification
                      ? 'Verify your email address to place printing and document orders'
                      : 'Documents, photocopying, flex banners, plastic ID cards, photos & custom quotes'}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition-colors" />
            </div>
          </button>
        </div>
      </div>
      )}

      {/* Two Column Layout: Recent Activities & Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Recent Activities Feed */}
        {showSection('recent_activities', true) && (
        <div className="lg:col-span-8 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-base font-bold text-white">Recent Activities</h2>
            <button
              onClick={() => onNavigateToPage('transactions')}
              className="text-xs text-emerald-400 hover:underline font-semibold"
            >
              View Full Ledger
            </button>
          </div>

          <div className="space-y-3">
            {(!summary?.recent_activities || summary.recent_activities.length === 0) ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No transactions or orders recorded yet. Fund your wallet or verify your first identity.
              </div>
            ) : (
              summary.recent_activities.slice(0, 6).map((act: any) => (
                <div
                  key={act.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                        act.type === 'credit'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {act.type === 'credit' ? (
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-white truncate max-w-xs sm:max-w-md">{act.title}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {new Date(act.timestamp).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono font-bold ${
                        act.type === 'credit' ? 'text-emerald-400' : 'text-slate-200'
                      }`}
                    >
                      {act.type === 'credit' ? '+' : '-'}₦{Number(act.amount).toLocaleString()}
                    </div>
                    <span className="text-[10px] uppercase font-mono text-emerald-400/90">
                      {act.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}

        {/* Right: Announcements & Notifications Glance */}
        {(showSection('notice_board', true) || showSection('virtual_account_card', true)) && (
        <div className="lg:col-span-4 space-y-6">
          {/* Announcements Card */}
          {showSection('notice_board', true) && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Bell className="w-4 h-4 text-emerald-400" />
                <span>Notice Board</span>
              </div>
              <button
                onClick={() => onNavigateToPage('notifications')}
                className="text-[11px] text-emerald-400 hover:underline"
              >
                All
              </button>
            </div>

            <div className="space-y-2.5">
              {(summary?.announcements || []).slice(0, 2).map((a: any) => (
                <div key={a.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                  <div className="font-bold text-white text-[11px] truncate">{a.title}</div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{a.content}</p>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Personal Paystack Dedicated Virtual Account / Wallet Funding Card */}
          {showSection('virtual_account_card', true) && (() => {
            const vaState = summary?.virtual_account_state;
            const activeVa = vaState?.has_virtual_account ? vaState?.virtual_account : null;
            return (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Personal Bank Transfer Account</span>
                  </span>
                  {vaState?.provisioning_status && (
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                      {String(vaState.provisioning_status).replace(/_/g, ' ')}
                    </span>
                  )}
                </div>

                {activeVa ? (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="text-[11px] text-slate-400">{activeVa.bank_name} &bull; {activeVa.account_name}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-black font-mono text-emerald-400 tracking-wider">
                        {activeVa.account_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText?.(activeVa.account_number).catch(() => {});
                          setCopiedOverviewAcc(true);
                          setTimeout(() => setCopiedOverviewAcc(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        {copiedOverviewAcc ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOverviewAcc ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Transfer from any Nigerian bank to credit your wallet automatically.
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="text-[10px] text-emerald-400 font-mono font-bold">INSTANT AUTO-CREDIT</div>
                    <div className="text-sm font-bold text-white">Card, Bank Transfer &amp; USSD</div>
                    <div className="text-[11px] text-slate-400">
                      {vaState?.message || 'Verified online deposits credit your NGN wallet immediately via Paystack.'}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onNavigateToPage('wallet')}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                >
                  {activeVa ? 'Manage Wallet & Transfers' : 'Open Wallet & Bank Account'}
                </button>
              </div>
            );
          })()}
        </div>
        )}
      </div>

      <StudentIdCardModal
        isOpen={Boolean(idCardStudent)}
        onClose={() => setIdCardStudent(null)}
        student={idCardStudent}
      />
    </div>
  );
};
