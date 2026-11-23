/**
 * @file AcademyPage.tsx
 * Public HAMBAK TECH & SERVICES Digital Training Academy Portal.
 * Showcases all 12 official courses, online admission with Under-18 parent/guardian validation,
 * application tracking (HTDA-APP-YYYY-XXXXX), and official QR Student ID Card preview.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Search,
  MapPin,
  Mail,
  FileCheck,
  ShieldAlert,
  UserCheck,
  Sparkles,
  ArrowRight,
  X,
  QrCode,
  Phone,
  Award,
  Upload,
  Lock,
  History,
  Send,
} from 'lucide-react';
import { api, setStoredToken } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  AcademyApplication,
  AcademyApplicationEvent,
  AcademyCourse,
  AcademyInvitationInfo,
  AcademySettings,
  AcademyStudent,
} from '../../types';
import { StudentIdCardModal } from '../academy/StudentIdCardModal';

interface AcademyPageProps {
  onOpenAuth?: (mode: 'login' | 'register') => void;
  onNavigate?: (page: string) => void;
  activationToken?: string | null;
  onActivationComplete?: () => Promise<void> | void;
}

function computeAgeFromDob(dob: string): number | null {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const m = today.getMonth() - parsed.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < parsed.getDate())) {
    age--;
  }
  return age;
}

function formatTuition(price: number | null | undefined): string {
  if (price === null || price === undefined) return 'Contact Academy';
  if (Number(price) === 0) return 'Free / Scholarship';
  return `₦${Number(price).toLocaleString('en-NG')}`;
}

function getStatusBadgeClasses(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'enrolled') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300';
  }
  if (s === 'approved') {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300';
  }
  if (s === 'rejected' || s === 'withdrawn') {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300';
  }
  if (s === 'information_requested' || s === 'info_requested') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300';
  }
  return 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300';
}

export const AcademyPage: React.FC<AcademyPageProps> = ({
  onNavigate,
  onOpenAuth,
  activationToken,
  onActivationComplete,
}) => {
  const { user, refreshUser } = useAuth();
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'courses' | 'apply' | 'track'>('courses');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [syllabusCourse, setSyllabusCourse] = useState<AcademyCourse | null>(null);

  // Account invitation activation state (?academy_activate=...)
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<AcademyInvitationInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [activatePassword, setActivatePassword] = useState('');
  const [activateConfirmPassword, setActivateConfirmPassword] = useState('');
  const [activatingAccount, setActivatingAccount] = useState(false);

  // Application form state
  const [form, setForm] = useState({
    course_id: '',
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: 'Male',
    address: '',
    state: 'Lagos',
    lga: 'Ibeju-Lekki',
    qualification: 'SSCE / Secondary',
    study_mode: 'Physical (Lekki Centre)',
    preferred_schedule: 'Weekday Morning',
    guardian_name: '',
    guardian_phone: '',
    guardian_address: '',
    guardian_relationship: 'Parent',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    passport_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFormPassport, setUploadingFormPassport] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDuplicateError, setIsDuplicateError] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    application_ref: string;
    application: AcademyApplication;
    message: string;
    account_notice?: string | null;
  } | null>(null);

  // Application Tracker state
  const [trackRef, setTrackRef] = useState('');
  const [trackEmail, setTrackEmail] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedApp, setTrackedApp] = useState<AcademyApplication | null>(null);
  const [trackedStudent, setTrackedStudent] = useState<AcademyStudent | null>(null);
  const [trackedTimeline, setTrackedTimeline] = useState<AcademyApplicationEvent[]>([]);
  const [resubmitToken, setResubmitToken] = useState<string | null>(null);
  const [resubmitMessage, setResubmitMessage] = useState('');
  const [resubmitPassportUrl, setResubmitPassportUrl] = useState('');
  const [uploadingTrackerPassport, setUploadingTrackerPassport] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitFeedback, setResubmitFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [idCardStudent, setIdCardStudent] = useState<AcademyStudent | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getPublicAcademy()
      .then((res) => {
        if (res?.success) {
          const list = res.courses || [];
          setCourses(list);
          setSettings(res.settings || null);
          if (list.length > 0) {
            const firstAvail = list.find((c) => c.is_available !== false) || list[0];
            setForm((prev) => ({ ...prev, course_id: prev.course_id || firstAvail.id }));
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load Academy catalog:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  // Pre-fill authenticated customer contact defaults cleanly without clobbering user input
  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      full_name: prev.full_name || user.full_name || '',
      email: prev.email || user.email || '',
      phone: prev.phone || user.phone_number || '',
      date_of_birth: prev.date_of_birth || user.date_of_birth || user.dob || '',
      address: prev.address || user.address || '',
      state: prev.state || user.state || 'Lagos',
      lga: prev.lga || user.lga || 'Ibeju-Lekki',
    }));
  }, [user]);

  // Validate Academy account invitation token when present in URL
  useEffect(() => {
    if (!activationToken) {
      setInviteInfo(null);
      setInviteError(null);
      return;
    }
    let active = true;
    setInviteLoading(true);
    setInviteError(null);
    api
      .validateAcademyInvitation(activationToken)
      .then((res) => {
        if (!active) return;
        if (res?.success && res.invitation) {
          setInviteInfo(res.invitation);
        } else {
          setInviteError('This Academy activation link is invalid or has expired.');
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setInviteError(err?.message || 'This Academy activation link is invalid or has expired.');
      })
      .finally(() => {
        if (active) setInviteLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activationToken]);

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationToken) return;
    setInviteError(null);
    if (activatePassword.length < 8) {
      setInviteError('Password must be at least 8 characters.');
      return;
    }
    if (activatePassword !== activateConfirmPassword) {
      setInviteError('Passwords do not match.');
      return;
    }
    try {
      setActivatingAccount(true);
      const res = await api.activateAcademyAccount({
        token: activationToken,
        password: activatePassword,
        full_name: inviteInfo?.full_name,
        phone: inviteInfo?.phone || undefined,
      });
      if (res?.success && res.token) {
        setStoredToken(res.token);
        await refreshUser();
        if (onActivationComplete) {
          await onActivationComplete();
        }
      } else {
        setInviteError('Unable to activate account right now.');
      }
    } catch (err: any) {
      setInviteError(err?.message || 'Unable to activate account.');
    } finally {
      setActivatingAccount(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    courses.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [courses]);

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      const catOk = selectedCategory === 'ALL' || c.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const qOk =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [courses, selectedCategory, searchQuery]);

  const computedAge = computeAgeFromDob(form.date_of_birth);
  const isMinor = computedAge !== null && computedAge < 18;

  const handleApplyClick = (courseId: string) => {
    setForm((prev) => ({ ...prev, course_id: courseId }));
    setSubmitError(null);
    setSubmittedResult(null);
    setActiveTab('apply');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUploadFormPassport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitError(null);
    try {
      setUploadingFormPassport(true);
      const res = await api.uploadAcademyPassport(file);
      if (res?.success && res.file_url) {
        setForm((prev) => ({ ...prev, passport_url: res.file_url }));
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Could not upload passport photograph.');
    } finally {
      setUploadingFormPassport(false);
      e.target.value = '';
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsDuplicateError(false);

    if (!form.course_id) {
      setSubmitError('Please select a training course.');
      return;
    }
    if (!form.date_of_birth || computedAge === null || computedAge < 5 || computedAge > 100) {
      setSubmitError('Please enter a valid date of birth.');
      return;
    }
    if (isMinor) {
      if (
        !form.guardian_name.trim() ||
        !form.guardian_phone.trim() ||
        !form.guardian_address.trim() ||
        !form.guardian_relationship.trim()
      ) {
        setSubmitError(
          'Applicants under 18 years old must provide complete Parent/Guardian Name, Phone Number, Address, and Relationship.'
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await api.submitAcademyApplication({
        ...form,
        email: form.email.trim().toLowerCase(),
      });
      if (res?.success) {
        setSubmittedResult({
          application_ref: res.application_ref,
          application: res.application,
          message: res.message,
          account_notice: res.account_notice,
        });
        setTrackRef(res.application_ref);
        setTrackEmail(form.email.trim().toLowerCase());
      } else {
        setSubmitError('Could not submit application. Please verify your entries.');
      }
    } catch (err: any) {
      if (err?.statusCode === 409 || err?.payload?.code === 'DUPLICATE_ACTIVE_APPLICATION') {
        setIsDuplicateError(true);
        setTrackEmail(form.email.trim().toLowerCase());
        const existingRef = err?.payload?.errors?.existing_application_ref;
        if (existingRef) setTrackRef(existingRef);
      }
      setSubmitError(err?.message || 'Submission failed. Please review all required fields.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setResubmitFeedback(null);
    setTrackedApp(null);
    setTrackedStudent(null);
    setTrackedTimeline([]);
    setResubmitToken(null);
    if (!trackRef.trim() || !trackEmail.trim()) {
      setTrackError('Enter both your Application Reference and Email Address.');
      return;
    }
    try {
      setTrackingLoading(true);
      const res = await api.checkAcademyApplicationStatus(
        trackRef.trim().toUpperCase(),
        trackEmail.trim().toLowerCase()
      );
      if (res?.success && res.application) {
        setTrackedApp(res.application);
        setTrackedStudent(res.student || res.application.student || null);
        setTrackedTimeline(res.timeline || res.application.timeline || []);
        setResubmitToken(res.resubmit_token || null);
        setResubmitPassportUrl(res.application.passport_url || '');
      } else {
        setTrackError('Application record not found.');
      }
    } catch (err: any) {
      setTrackError(err?.message || 'Unable to locate application record.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleTrackerPassportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !trackedApp) return;
    setResubmitFeedback(null);
    try {
      setUploadingTrackerPassport(true);
      const res = await api.uploadAcademyPassport(file, {
        resubmit_token: resubmitToken || undefined,
        application_id: trackedApp.id,
      });
      if (res?.success && res.file_url) {
        setResubmitPassportUrl(res.file_url);
        setResubmitFeedback({ type: 'success', message: 'Passport photograph uploaded. Submit your response below to attach it.' });
      }
    } catch (err: any) {
      setResubmitFeedback({ type: 'error', message: err?.message || 'Could not upload passport photograph.' });
    } finally {
      setUploadingTrackerPassport(false);
      e.target.value = '';
    }
  };

  const handleResubmitInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackedApp) return;
    setResubmitFeedback(null);
    if (!resubmitMessage.trim() && !resubmitPassportUrl) {
      setResubmitFeedback({ type: 'error', message: 'Please enter a response note or upload an updated passport photo.' });
      return;
    }
    try {
      setResubmitting(true);
      const res = await api.resubmitAcademyApplication(trackedApp.id, {
        resubmit_token: resubmitToken || undefined,
        applicant_response: resubmitMessage.trim() || undefined,
        passport_url: resubmitPassportUrl || undefined,
      });
      if (res?.success && res.application) {
        setTrackedApp(res.application);
        if (res.timeline) setTrackedTimeline(res.timeline);
        setResubmitToken(null);
        setResubmitMessage('');
        setResubmitFeedback({
          type: 'success',
          message: res.message || 'Your clarification has been submitted to the Admissions Team.',
        });
      }
    } catch (err: any) {
      setResubmitFeedback({ type: 'error', message: err?.message || 'Failed to submit response.' });
    } finally {
      setResubmitting(false);
    }
  };

  const openRealStudentIdCard = (studentRecord?: AcademyStudent | null) => {
    if (!studentRecord || !studentRecord.student_id) return;
    setIdCardStudent(studentRecord);
  };

  const academyName = settings?.academy_name || 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY';
  const academyEmail = settings?.email || settings?.contact_email || 'hambak901@gmail.com';
  const academyAddress = settings?.address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';
  const regNo = settings?.business_reg_number || 'BN 9284726';
  const motto = settings?.motto || 'Where Technology Meets Services';

  return (
    <div className="space-y-10 py-4">
      {/* Academy Header Banner */}
      <section className="rounded-3xl bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 text-white p-6 sm:p-10 shadow-xl border border-blue-700/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-300">
              <span>{regNo}</span>
              <span aria-hidden="true">&bull;</span>
              <span>{motto}</span>
              <span aria-hidden="true">&bull;</span>
              <span>
                {settings?.admission_open !== false ? 'Admissions Open' : 'Admissions Closed'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              {academyName}
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 leading-relaxed max-w-2xl">
              Practical, hands-on ICT, graphics design, hardware servicing, software engineering, and digital skills training in Lekki, Lagos State. Apply online for physical or hybrid cohorts and verify official graduate credentials via QR Student ID.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-blue-100">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-300" />
                {academyAddress}
              </span>
              <a
                href={`mailto:${academyEmail}`}
                className="inline-flex items-center gap-1.5 hover:text-amber-300 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-amber-300" />
                {academyEmail}
              </a>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 sm:p-5 space-y-2.5 lg:w-72 shrink-0">
            <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
              Admission Window
            </div>
            <div className="text-sm font-bold text-white">
              {settings?.admission_start_date && settings?.admission_end_date
                ? `${settings.admission_start_date} – ${settings.admission_end_date}`
                : 'Rolling Cohort Admissions'}
            </div>
            <p className="text-[11px] text-blue-100">
              {courses.length} Official Training Tracks &bull; Physical &amp; Online Modes
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('verify-student')}
                className="w-full mt-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Verify Student ID Card</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ACCOUNT INVITATION ACTIVATION CARD (?academy_activate=...) */}
      {(activationToken || inviteError) && (
        <section className="max-w-2xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border-2 border-blue-600/40 p-6 sm:p-8 shadow-xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Academy Portal Account Activation
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Set a secure password to activate your verified account and link your Academy application.
              </p>
            </div>
          </div>

          {inviteLoading ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
              Validating your activation invitation...
            </div>
          ) : inviteError ? (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-700/50 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{inviteError}</span>
            </div>
          ) : inviteInfo ? (
            inviteInfo.requires_existing_login ? (
              <div className="space-y-3 text-xs">
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/50 text-amber-900 dark:text-amber-200">
                  An account already exists for <strong className="font-mono">{inviteInfo.email}</strong>. Sign in with your existing password to automatically link application{' '}
                  <strong className="font-mono">{inviteInfo.application_ref}</strong>.
                </div>
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={() => onOpenAuth('login')}
                    className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold"
                  >
                    Sign In to Existing Account
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleActivateAccount} className="space-y-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 block">Applicant Name</span>
                    <strong className="text-slate-900 dark:text-white">{inviteInfo.full_name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Email Address</span>
                    <strong className="font-mono text-slate-900 dark:text-white">{inviteInfo.email}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Application Ref</span>
                    <strong className="font-mono text-blue-700 dark:text-blue-400">{inviteInfo.application_ref}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Selected Course</span>
                    <strong className="text-slate-900 dark:text-white">{inviteInfo.course_title}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Create Password (min. 8 characters) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={activatePassword}
                      onChange={(e) => setActivatePassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={activateConfirmPassword}
                      onChange={(e) => setActivateConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={activatingAccount}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>{activatingAccount ? 'Activating Account...' : 'Activate Account & Open Portal'}</span>
                </button>
              </form>
            )
          ) : null}
        </section>
      )}

      {/* Interactive Section Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('courses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'courses'
                ? 'bg-blue-700 text-white shadow-md shadow-blue-700/20'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>12 Training Courses</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apply')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'apply'
                ? 'bg-blue-700 text-white shadow-md shadow-blue-700/20'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Online Admission Form</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('track')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'track'
                ? 'bg-blue-700 text-white shadow-md shadow-blue-700/20'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Track Application &amp; Student ID</span>
          </button>
        </div>

        {activeTab === 'courses' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search academy courses..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>
        )}
      </div>

      {/* TAB 1: COURSES CATALOG */}
      {activeTab === 'courses' && (
        <div className="space-y-6">
          {/* Category Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  selectedCategory === cat
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat === 'ALL' ? `All Courses (${courses.length})` : cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              Loading official training curriculum...
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No courses match your filter criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => {
                const available = course.is_available !== false;
                return (
                  <div
                    key={course.id}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-sm hover:border-blue-400 dark:hover:border-blue-600 transition"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {course.category || 'ICT Training'}
                        </span>
                        <span aria-hidden="true">&bull;</span>
                        <span>{course.level}</span>
                        <span aria-hidden="true">&bull;</span>
                        <span className="font-mono">{course.duration}</span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                        {course.title}
                      </h3>

                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {course.description}
                      </p>

                      {(course.admission_start_date || course.admission_end_date) && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 pt-1">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Intake: {course.admission_start_date || 'Open'} &rarr;{' '}
                            {course.admission_end_date || 'Ongoing'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-5 mt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          {course.modules_count} Modules
                        </span>
                        <span
                          className={`font-bold ${
                            course.price === null || course.price === undefined
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'font-mono text-blue-700 dark:text-blue-400'
                          }`}
                        >
                          {formatTuition(course.price)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSyllabusCourse(course)}
                          className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold transition"
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          disabled={!available}
                          onClick={() => handleApplyClick(course.id)}
                          className="py-2 px-3 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-1"
                        >
                          <span>{available ? 'Apply Now' : 'Closed'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ONLINE ADMISSION APPLICATION */}
      {activeTab === 'apply' && (
        <div className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1 border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Online Admission Application Form
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Complete the form below to apply for admission into {academyName}. Applicants below 18 years of age must include parent or guardian authorization details.
            </p>
          </div>

          {submittedResult ? (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-700/50 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Admission Application Submitted
                  </h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    {submittedResult.message}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-emerald-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">
                    Application Reference Number
                  </div>
                  <div className="text-lg font-extrabold font-mono text-blue-700 dark:text-blue-400">
                    {submittedResult.application_ref}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('track')}
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition"
                >
                  Track Application Status
                </button>
              </div>
              {submittedResult.account_notice && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
                  {submittedResult.account_notice}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmitApplication} className="space-y-5 text-xs">
              {submitError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-700/50 text-rose-700 dark:text-rose-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                  {isDuplicateError && (
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitError(null);
                        setActiveTab('track');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold text-[11px]"
                    >
                      Open Application Status Tracker
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Course / Program <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.course_id}
                  onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                >
                  <option value="">-- Choose a course --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.is_available === false}>
                      {c.title} ({c.duration} · {formatTuition(c.price)})
                      {c.is_available === false ? ' [Closed]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Applicant Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Surname Firstname Othername"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="applicant@email.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="08012345678"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Date of Birth <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                  {computedAge !== null && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                      Calculated Age: <strong>{computedAge} years</strong>{' '}
                      {isMinor && '(Minor — Parent/Guardian Required)'}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Gender <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    State <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    LGA / LCDA <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.lga}
                    onChange={(e) => setForm({ ...form, lga: e.target.value })}
                    placeholder="e.g. Lekki LCDA"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Highest Qualification
                  </label>
                  <input
                    type="text"
                    value={form.qualification}
                    onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                    placeholder="SSCE / ND / HND / BSc"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Residential Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Street address, area, town"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Study Mode
                  </label>
                  <select
                    value={form.study_mode}
                    onChange={(e) => setForm({ ...form, study_mode: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="Physical (Lekki Centre)">Physical (Lekki Training Centre)</option>
                    <option value="Online Live">Online Live Cohort</option>
                    <option value="Hybrid">Hybrid (Physical + Online)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Preferred Schedule
                  </label>
                  <select
                    value={form.preferred_schedule}
                    onChange={(e) => setForm({ ...form, preferred_schedule: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="Weekday Morning">Weekday Morning (9AM – 1PM)</option>
                    <option value="Weekday Afternoon">Weekday Afternoon (2PM – 5PM)</option>
                    <option value="Weekend">Weekend Intensive (Saturday)</option>
                  </select>
                </div>
              </div>

              {/* Mandatory Under-18 Parent / Guardian Authorization Block */}
              {isMinor && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-600/50 p-5 space-y-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                        Under-18 Parent / Guardian Information (Required)
                      </h3>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        Because the applicant is under 18 years old ({computedAge} yrs), all four parent or legal guardian fields are mandatory for admission approval.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Parent / Guardian Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required={isMinor}
                        value={form.guardian_name}
                        onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                        placeholder="Parent or guardian full name"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Parent / Guardian Phone <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required={isMinor}
                        value={form.guardian_phone}
                        onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                        placeholder="08012345678"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Relationship to Applicant <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required={isMinor}
                        value={form.guardian_relationship}
                        onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })}
                        placeholder="Father / Mother / Legal Guardian"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Parent / Guardian Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required={isMinor}
                        value={form.guardian_address}
                        onChange={(e) => setForm({ ...form, guardian_address: e.target.value })}
                        placeholder="Residential address of guardian"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Optional Emergency Contact for Adults */}
              {!isMinor && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Emergency Contact Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={form.emergency_contact_name}
                      onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                      placeholder="Next of kin / emergency contact"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Emergency Contact Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      value={form.emergency_contact_phone}
                      onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
                      placeholder="08012345678"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {user && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      Passport Photograph (Optional — JPEG/PNG/WEBP, Max 2MB)
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {form.passport_url ? 'Passport photograph attached cleanly.' : 'Attach a clear passport photo for admission processing.'}
                    </p>
                  </div>
                  <label className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingFormPassport ? 'Uploading...' : form.passport_url ? 'Replace Photo' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUploadFormPassport}
                      disabled={uploadingFormPassport}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-bold text-xs sm:text-sm transition shadow-lg shadow-blue-700/20"
              >
                {submitting ? 'Submitting Admission Application...' : 'Submit Admission Application'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: APPLICATION TRACKER & STUDENT ID */}
      {activeTab === 'track' && (
        <div className="max-w-2xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Track Admission Status &amp; Student ID Card
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Enter your Application Reference (e.g. HTDA-APP-2026-XXXXX) and the email used during registration.
            </p>
          </div>

          <form onSubmit={handleTrackStatus} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <input
              type="text"
              required
              value={trackRef}
              onChange={(e) => setTrackRef(e.target.value)}
              placeholder="HTDA-APP-2026-XXXXX"
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono uppercase focus:outline-none focus:border-blue-600"
            />
            <input
              type="email"
              required
              value={trackEmail}
              onChange={(e) => setTrackEmail(e.target.value)}
              placeholder="Registered Email"
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={trackingLoading}
              className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-bold transition"
            >
              {trackingLoading ? 'Checking...' : 'Check Status'}
            </button>
          </form>

          {trackError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-700/50 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{trackError}</span>
            </div>
          )}

          {trackedApp && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {trackedApp.application_ref}
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {trackedApp.full_name}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    {trackedApp.course_title}
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-lg font-bold uppercase text-[11px] ${getStatusBadgeClasses(
                    trackedApp.status
                  )}`}
                >
                  {trackedApp.status.replace(/_/g, ' ')}
                </span>
              </div>

              {trackedApp.info_request_message && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/50 text-amber-900 dark:text-amber-200">
                  <strong>Admissions Request:</strong> {trackedApp.info_request_message}
                </div>
              )}

              {trackedApp.applicant_response && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200">
                  <strong>Your Submitted Response:</strong> {trackedApp.applicant_response}
                </div>
              )}

              {trackedApp.admin_notes && (
                <div className="text-slate-600 dark:text-slate-300">
                  <strong>Review Note:</strong> {trackedApp.admin_notes}
                </div>
              )}

              {/* Info Requested Applicant Response & Passport Upload */}
              {(trackedApp.status === 'information_requested' || trackedApp.status === 'info_requested') &&
                resubmitToken && (
                  <form
                    onSubmit={handleResubmitInfo}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-600/50 space-y-3"
                  >
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-amber-600" />
                      <span>Respond to Admissions Request</span>
                    </div>

                    {resubmitFeedback && (
                      <div
                        className={`p-2.5 rounded-lg text-[11px] ${
                          resubmitFeedback.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {resubmitFeedback.message}
                      </div>
                    )}

                    <textarea
                      rows={3}
                      value={resubmitMessage}
                      onChange={(e) => setResubmitMessage(e.target.value)}
                      placeholder="Provide requested clarifications or missing details..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer inline-flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingTrackerPassport
                            ? 'Uploading...'
                            : resubmitPassportUrl
                            ? 'Passport Attached (Replace)'
                            : 'Attach Passport Photo'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleTrackerPassportUpload}
                          disabled={uploadingTrackerPassport}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={resubmitting}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold"
                      >
                        {resubmitting ? 'Submitting...' : 'Submit Requested Details'}
                      </button>
                    </div>
                  </form>
                )}

              {trackedApp.status === 'approved' && !trackedStudent && (
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 space-y-2 text-sky-900 dark:text-sky-200">
                  <div className="font-bold">Admission Approved — Awaiting Enrollment Completion</div>
                  <p className="text-[11px] leading-relaxed">
                    Your admission offer has been approved! Sign in to your Customer Portal (or complete account activation from your invitation email) to verify enrollment prerequisites and activate your official Student ID.
                  </p>
                </div>
              )}

              {trackedStudent && trackedStudent.student_id && (
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold">
                      Official Issued Student ID
                    </div>
                    <div className="text-lg font-extrabold font-mono text-blue-900 dark:text-white">
                      {trackedStudent.student_id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openRealStudentIdCard(trackedStudent)}
                    className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-2 transition"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Open Student ID Card</span>
                  </button>
                </div>
              )}

              {/* Transition Audit Timeline */}
              {trackedTimeline.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                    <History className="w-3.5 h-3.5 text-blue-600" />
                    <span>Application History</span>
                  </div>
                  <div className="space-y-1.5">
                    {trackedTimeline.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                      >
                        <div>
                          <span className="font-bold capitalize text-slate-800 dark:text-slate-200">
                            {ev.action.replace(/_/g, ' ')}
                          </span>{' '}
                          <span className="text-slate-500">
                            ({(ev.to_status || '').replace(/_/g, ' ')})
                          </span>
                          {ev.notes && <p className="text-slate-600 dark:text-slate-400 mt-0.5">{ev.notes}</p>}
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">
                          {ev.created_at ? ev.created_at.slice(0, 16).replace('T', ' ') : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* COURSE SYLLABUS MODAL */}
      {syllabusCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                  {syllabusCourse.category || 'ICT Training'} &bull; {syllabusCourse.level}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {syllabusCourse.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSyllabusCourse(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500">Duration</div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {syllabusCourse.duration}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Modules</div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {syllabusCourse.modules_count} Units
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Tuition Fee</div>
                  <div className="font-bold text-blue-700 dark:text-blue-400">
                    {formatTuition(syllabusCourse.price)}
                  </div>
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Course Overview
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {syllabusCourse.description}
                </p>
              </div>

              {syllabusCourse.curriculum_outline && (
                <div>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Curriculum Outline
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 whitespace-pre-line">
                    {syllabusCourse.curriculum_outline}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSyllabusCourse(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Close
              </button>
              <button
                type="button"
                disabled={syllabusCourse.is_available === false}
                onClick={() => {
                  const id = syllabusCourse.id;
                  setSyllabusCourse(null);
                  handleApplyClick(id);
                }}
                className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold"
              >
                Apply for Admission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL QR STUDENT ID CARD MODAL */}
      {idCardStudent && (
        <StudentIdCardModal
          isOpen={Boolean(idCardStudent)}
          student={idCardStudent}
          academyEmail={academyEmail}
          academyAddress={academyAddress}
          onClose={() => setIdCardStudent(null)}
          onOpenVerifyPage={(sid) => {
            if (onNavigate) {
              onNavigate(`verify-student/${sid}`);
            } else {
              window.location.hash = `#verify-student/${encodeURIComponent(sid)}`;
            }
          }}
        />
      )}
    </div>
  );
};
