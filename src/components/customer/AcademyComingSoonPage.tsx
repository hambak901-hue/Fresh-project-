/**
 * @file AcademyComingSoonPage.tsx
 * Live Customer Portal module for HAMBAK TECH & SERVICES Digital Training Academy (Phase 1).
 * Features:
 * - Official 12-course curriculum catalogue with search & syllabus preview
 * - Online admission application with optional passport photo upload, Under-18 guardian enforcement,
 *   and duplicate active application guard
 * - 7 canonical application statuses + immutable audit history timeline
 * - Applicant response & passport upload when info is requested
 * - Self-service enrollment completion (when approved & requirements met) or withdrawal
 * - Enrolled Student Hub & QR Student ID card access strictly gated by real enrollment records
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Mail,
  QrCode,
  ShieldAlert,
  FileCheck,
  Search,
  X,
  ArrowRight,
  RefreshCw,
  Upload,
  Clock,
  Lock,
  MessageSquareMore,
  Ban,
  CheckSquare,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  AcademyAccessSummary,
  AcademyApplication,
  AcademyCourse,
  AcademySettings,
  AcademyStudent,
} from '../../types';
import { StudentIdCardModal } from '../academy/StudentIdCardModal';

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

function getStatusBadge(status: string): { label: string; className: string } {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'pending':
      return {
        label: 'Pending Review',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
      };
    case 'under_review':
      return {
        label: 'Under Review',
        className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
      };
    case 'information_requested':
    case 'info_requested':
      return {
        label: 'Information Requested',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
      };
    case 'approved':
      return {
        label: 'Approved (Awaiting Enrollment)',
        className: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300',
      };
    case 'enrolled':
      return {
        label: 'Enrolled',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300',
      };
    case 'withdrawn':
      return {
        label: 'Withdrawn',
        className: 'bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300',
      };
    default:
      return {
        label: status.replace(/_/g, ' '),
        className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
  }
}

export function AcademyComingSoonPage() {
  const { user, refreshUser } = useAuth();
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [applications, setApplications] = useState<AcademyApplication[]>([]);
  const [enrollments, setEnrollments] = useState<AcademyStudent[]>([]);
  const [access, setAccess] = useState<AcademyAccessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'courses' | 'apply' | 'applications' | 'enrolled'>('courses');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<AcademyCourse | null>(null);
  const [idCardStudent, setIdCardStudent] = useState<AcademyStudent | null>(null);

  const [form, setForm] = useState({
    course_id: '',
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone_number || '',
    date_of_birth: user?.date_of_birth || user?.dob || '',
    gender: 'Male',
    address: user?.address || '',
    state: user?.state || 'Lagos',
    lga: user?.lga || 'Lekki LCDA',
    qualification: 'SSCE / Secondary',
    study_mode: 'Physical (Lekki Centre)',
    preferred_schedule: 'Weekday Morning',
    passport_url: '',
    guardian_name: '',
    guardian_phone: '',
    guardian_address: '',
    guardian_relationship: 'Parent',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });
  const [uploadingPassport, setUploadingPassport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<boolean>(false);
  const [successRef, setSuccessRef] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Per-application interaction state
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [responsePassports, setResponsePassports] = useState<Record<string, string>>({});
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [withdrawReasonDraft, setWithdrawReasonDraft] = useState<string>('');
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomerAcademy();
      if (res?.success) {
        const list = res.courses || [];
        setCourses(list);
        setSettings(res.settings || null);
        setApplications(res.applications || []);
        setEnrollments(res.students || []);
        setAccess(res.access || null);
        if (list.length > 0 && !form.course_id) {
          const avail = list.find((c) => c.is_available !== false) || list[0];
          setForm((prev) => ({ ...prev, course_id: avail.id }));
        }
      }
    } catch (err) {
      console.warn('Failed to load customer academy:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      lga: prev.lga || user.lga || 'Lekki LCDA',
    }));
  }, [user?.id]);

  const computedAge = computeAgeFromDob(form.date_of_birth);
  const isMinor = computedAge !== null && computedAge < 18;

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter(
      (c) =>
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q)
    );
  }, [courses, searchQuery]);

  const handleApplyForCourse = (courseId: string) => {
    setForm((prev) => ({ ...prev, course_id: courseId }));
    setErrorMsg(null);
    setDuplicateError(false);
    setSuccessRef(null);
    setTab('apply');
  };

  const handleUploadPassportForForm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Passport photo must be 2MB or smaller (JPEG, PNG, or WebP).');
      return;
    }
    setUploadingPassport(true);
    setErrorMsg(null);
    try {
      const res = await api.uploadAcademyPassport(file);
      if (res?.success && res.file_url) {
        setForm((prev) => ({ ...prev, passport_url: res.file_url }));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to upload passport photograph.');
    } finally {
      setUploadingPassport(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setDuplicateError(false);
    setSuccessRef(null);

    if (!form.course_id || !form.date_of_birth || computedAge === null) {
      setErrorMsg('Please select a course and valid date of birth.');
      return;
    }
    if (isMinor) {
      if (
        !form.guardian_name.trim() ||
        !form.guardian_phone.trim() ||
        !form.guardian_address.trim() ||
        !form.guardian_relationship.trim()
      ) {
        setErrorMsg(
          'Applicants under 18 years old must provide complete Parent/Guardian Name, Phone, Address, and Relationship.'
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await api.submitCustomerAcademyApplication({
        ...form,
        email: (form.email || user?.email || '').trim().toLowerCase(),
      });
      if (res?.success) {
        setSuccessRef(res.application_ref);
        await loadData();
        setTab('applications');
      } else {
        setErrorMsg('Unable to submit application.');
      }
    } catch (err: any) {
      const code = String(err?.payload?.code || '');
      if (err?.status === 409 || code === 'DUPLICATE_ACTIVE_APPLICATION') {
        setDuplicateError(true);
      }
      setErrorMsg(err?.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadResponsePassport = async (appId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setActionBanner({ type: 'error', message: 'Passport photo must be 2MB or smaller.' });
      return;
    }
    setRespondingId(appId);
    setActionBanner(null);
    try {
      const res = await api.uploadAcademyPassport(file, { application_id: appId });
      if (res?.success && res.file_url) {
        setResponsePassports((prev) => ({ ...prev, [appId]: res.file_url }));
        setActionBanner({ type: 'success', message: 'Passport photo uploaded. Submit your response below to attach it.' });
      }
    } catch (err: any) {
      setActionBanner({ type: 'error', message: err?.message || 'Passport upload failed.' });
    } finally {
      setRespondingId(null);
      e.target.value = '';
    }
  };

  const handleSubmitInfoResponse = async (appId: string) => {
    const msg = (responseDrafts[appId] || '').trim();
    const passportUrl = responsePassports[appId] || undefined;
    if (!msg && !passportUrl) {
      setActionBanner({ type: 'error', message: 'Please enter a response or attach an updated passport photograph.' });
      return;
    }
    setRespondingId(appId);
    setActionBanner(null);
    try {
      const res = await api.respondCustomerAcademyApplication(appId, {
        applicant_response: msg || undefined,
        passport_url: passportUrl,
      });
      if (res?.success) {
        setResponseDrafts((prev) => ({ ...prev, [appId]: '' }));
        setActionBanner({ type: 'success', message: res.message || 'Additional information submitted for review.' });
        await loadData();
      }
    } catch (err: any) {
      setActionBanner({ type: 'error', message: err?.message || 'Failed to submit response.' });
    } finally {
      setRespondingId(null);
    }
  };

  const handleCompleteEnrollment = async (appId: string) => {
    setEnrollingId(appId);
    setActionBanner(null);
    try {
      const res = await api.completeCustomerAcademyEnrollment(appId);
      if (res?.success) {
        setActionBanner({
          type: 'success',
          message: `Enrollment completed! Official Student ID issued: ${res.student?.student_id || 'Issued'}`,
        });
        await loadData();
        await refreshUser();
        if (res.student) {
          setIdCardStudent(res.student);
        }
        setTab('enrolled');
      }
    } catch (err: any) {
      setActionBanner({
        type: 'error',
        message: err?.message || 'Enrollment requirements are not yet complete.',
      });
    } finally {
      setEnrollingId(null);
    }
  };

  const handleWithdrawApplication = async (appId: string) => {
    setWithdrawingId(appId);
    setActionBanner(null);
    try {
      const res = await api.withdrawCustomerAcademyApplication(appId, withdrawReasonDraft.trim() || undefined);
      if (res?.success) {
        setConfirmWithdrawId(null);
        setWithdrawReasonDraft('');
        setActionBanner({ type: 'success', message: res.message || 'Application withdrawn.' });
        await loadData();
      }
    } catch (err: any) {
      setActionBanner({ type: 'error', message: err?.message || 'Unable to withdraw application.' });
    } finally {
      setWithdrawingId(null);
    }
  };

  const academyName = settings?.academy_name || 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY';
  const academyEmail = settings?.email || settings?.contact_email || 'hambak901@gmail.com';
  const academyAddress = settings?.address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';
  const activeOrGraduatedEnrollments = enrollments.filter(
    (s) => s.academic_status === 'active' || s.academic_status === 'graduated'
  );
  const canAccessStudentHub = Boolean(
    (access?.can_access_student_hub ?? activeOrGraduatedEnrollments.length > 0) &&
      activeOrGraduatedEnrollments.length > 0
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-semibold text-amber-300">
              {settings?.business_reg_number || 'BN 9284726'} &bull;{' '}
              {settings?.motto || 'Where Technology Meets Services'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{academyName}</h1>
            <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
              Browse all {courses.length || 12} official training tracks, submit online admission applications, respond to admissions reviews, complete enrollment, and download your QR-verified Student ID card.
            </p>
            <div className="flex flex-wrap gap-4 text-[11px] text-blue-100 pt-1">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-300" />
                {academyAddress}
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-amber-300" />
                {academyEmail}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="self-start lg:self-center px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'courses', label: `Courses (${courses.length})`, icon: BookOpen, locked: false },
            { id: 'apply', label: 'Apply Online', icon: GraduationCap, locked: false },
            { id: 'applications', label: `My Applications (${applications.length})`, icon: FileCheck, locked: false },
            {
              id: 'enrolled',
              label: `Student Hub & ID Cards (${activeOrGraduatedEnrollments.length})`,
              icon: canAccessStudentHub ? QrCode : Lock,
              locked: !canAccessStudentHub,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  tab === item.id
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {tab === 'courses' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search training tracks..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {successRef && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Admission application submitted! Reference: <strong className="font-mono">{successRef}</strong>
            </span>
          </div>
        </div>
      )}

      {actionBanner && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            actionBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-700/50 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{actionBanner.message}</span>
          </div>
          <button type="button" onClick={() => setActionBanner(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: COURSES */}
      {tab === 'courses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCourses.map((course) => (
            <div
              key={course.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
                    {course.category || 'ICT Training'}
                  </span>
                  <span className="font-mono">{course.duration}</span>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">{course.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {course.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    {course.modules_count} Modules &bull; {course.level}
                  </span>
                  <span className="font-bold font-mono text-blue-700 dark:text-amber-400">
                    {formatTuition(course.price)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCourse(course)}
                    className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                  >
                    Syllabus
                  </button>
                  <button
                    type="button"
                    disabled={course.is_available === false}
                    onClick={() => handleApplyForCourse(course.id)}
                    className="py-2 px-3 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <span>{course.is_available === false ? 'Closed' : 'Apply'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: APPLY ONLINE */}
      {tab === 'apply' && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 text-xs shadow-sm max-w-3xl"
        >
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Submit Academy Admission Application
          </h2>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-700/50 text-rose-700 dark:text-rose-300 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              {duplicateError && (
                <button
                  type="button"
                  onClick={() => setTab('applications')}
                  className="px-3 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold"
                >
                  View Existing Application
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Course Selection *
            </label>
            <select
              required
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id} disabled={c.is_available === false}>
                  {c.title} ({c.duration} · {formatTuition(c.price)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Date of Birth *
              </label>
              <input
                type="date"
                required
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
              {computedAge !== null && (
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Age: <strong>{computedAge} years</strong> {isMinor && '(Under 18 — Guardian Required)'}
                </span>
              )}
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                State *
              </label>
              <input
                type="text"
                required
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                LGA / LCDA *
              </label>
              <input
                type="text"
                required
                value={form.lga}
                onChange={(e) => setForm({ ...form, lga: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Residential Address *
            </label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Study Mode
              </label>
              <select
                value={form.study_mode}
                onChange={(e) => setForm({ ...form, study_mode: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Physical (Lekki Centre)">Physical (Lekki Centre)</option>
                <option value="Online Live">Online Live Cohort</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Preferred Schedule
              </label>
              <select
                value={form.preferred_schedule}
                onChange={(e) => setForm({ ...form, preferred_schedule: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                <option value="Weekday Morning">Weekday Morning</option>
                <option value="Weekday Afternoon">Weekday Afternoon</option>
                <option value="Weekend">Weekend</option>
              </select>
            </div>
          </div>

          {/* Passport Photograph Upload */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Passport Photograph (Recommended for Student ID Card)
              </div>
              <p className="text-[11px] text-slate-500">
                Upload a clear headshot (JPEG, PNG, or WebP, max 2MB). You can also upload later if requested.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {form.passport_url && (
                <img
                  src={form.passport_url}
                  alt="Uploaded passport"
                  className="w-12 h-12 rounded-xl object-cover border border-slate-300 dark:border-slate-700"
                />
              )}
              <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingPassport ? 'Uploading...' : form.passport_url ? 'Change Photo' : 'Upload Photo'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleUploadPassportForForm}
                  disabled={uploadingPassport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {isMinor && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-600/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
                <ShieldAlert className="w-4 h-4" />
                <span>Parent / Guardian Authorization Required (Applicant Age &lt; 18)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required={isMinor}
                  value={form.guardian_name}
                  onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                  placeholder="Parent/Guardian Full Name *"
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="tel"
                  required={isMinor}
                  value={form.guardian_phone}
                  onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                  placeholder="Parent/Guardian Phone *"
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required={isMinor}
                  value={form.guardian_relationship}
                  onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })}
                  placeholder="Relationship (e.g. Mother, Father) *"
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required={isMinor}
                  value={form.guardian_address}
                  onChange={(e) => setForm({ ...form, guardian_address: e.target.value })}
                  placeholder="Parent/Guardian Address *"
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || uploadingPassport}
            className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-bold transition"
          >
            {submitting ? 'Submitting Application...' : 'Submit Admission Application'}
          </button>
        </form>
      )}

      {/* TAB 3: MY APPLICATIONS */}
      {tab === 'applications' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              You have not submitted any Academy admission applications yet.
            </div>
          ) : (
            applications.map((app) => {
              const badge = getStatusBadge(app.status);
              const needsInfo =
                app.status === 'information_requested' || app.status === 'info_requested';
              const isApproved = app.status === 'approved';
              const isEnrolled = app.status === 'enrolled';
              const canWithdraw = [
                'pending',
                'under_review',
                'information_requested',
                'info_requested',
                'approved',
              ].includes(app.status);
              const reqs = app.enrollment_requirements;
              const timeline = app.timeline || [];
              const showTimeline = expandedTimelineId === app.id;

              return (
                <div
                  key={app.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-mono text-[11px] text-blue-700 dark:text-amber-400 font-bold">
                        {app.application_ref}
                      </div>
                      <div className="text-base font-bold text-slate-900 dark:text-white">
                        {app.course_title || app.course_id}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {app.study_mode} &bull; {app.preferred_schedule}
                      </div>
                      {app.admin_notes && (
                        <div className="text-slate-600 dark:text-slate-300 pt-1">
                          <strong>Admissions Note:</strong> {app.admin_notes}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:items-end gap-2">
                      <span className={`px-3 py-1 rounded-lg font-bold uppercase text-[10px] ${badge.className}`}>
                        {badge.label}
                      </span>
                      {(app.student_id || app.student?.student_id) && (
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          Student ID: {app.student_id || app.student?.student_id}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* INFORMATION REQUESTED: Applicant Response & Passport Upload */}
                  {needsInfo && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-600/40 space-y-3">
                      <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                        <MessageSquareMore className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold">Additional Information Requested by Admissions</div>
                          <p className="mt-0.5">{app.info_request_message || 'Please provide updated information or documents.'}</p>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={responseDrafts[app.id] ?? ''}
                        onChange={(e) => setResponseDrafts((prev) => ({ ...prev, [app.id]: e.target.value }))}
                        placeholder="Enter your clarification or additional details..."
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {responsePassports[app.id] ? 'Passport Attached (Change)' : 'Upload / Update Passport Photo'}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handleUploadResponsePassport(app.id, e)}
                            disabled={respondingId === app.id}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={respondingId === app.id}
                          onClick={() => handleSubmitInfoResponse(app.id)}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold disabled:opacity-50"
                        >
                          {respondingId === app.id ? 'Submitting...' : 'Submit Response'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* APPROVED: Enrollment Prerequisites & Self-Complete CTA */}
                  {isApproved && (
                    <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-600/40 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-teal-900 dark:text-teal-200">
                            Admission Approved — Ready for Enrollment
                          </div>
                          <p className="text-[11px] text-teal-800 dark:text-teal-300 mt-0.5">
                            Complete enrollment to receive your official HAMBAK Tech Digital Training Academy Student ID &amp; Student Hub access.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={enrollingId === app.id || (reqs ? !reqs.met : false)}
                          onClick={() => handleCompleteEnrollment(app.id)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 shrink-0"
                        >
                          <CheckSquare className="w-4 h-4" />
                          <span>{enrollingId === app.id ? 'Completing...' : 'Complete Enrollment'}</span>
                        </button>
                      </div>

                      {reqs && (
                        <div className="text-[11px] pt-2 border-t border-teal-200/80 dark:border-teal-800/60">
                          {reqs.met ? (
                            <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                              All enrollment prerequisites verified. Click &ldquo;Complete Enrollment&rdquo; to activate your Student ID.
                            </span>
                          ) : (
                            <div className="text-amber-800 dark:text-amber-300 space-y-1">
                              <div className="font-semibold">Pending Enrollment Prerequisites:</div>
                              <ul className="list-disc list-inside space-y-0.5">
                                {reqs.missing.map((item, idx) => (
                                  <li key={idx}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer Actions: ID Card (if enrolled), Timeline, Withdraw */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedTimelineId(showTimeline ? null : app.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{showTimeline ? 'Hide Timeline' : `History (${timeline.length})`}</span>
                      </button>

                      {isEnrolled && app.student && (
                        <button
                          type="button"
                          onClick={() => setIdCardStudent(app.student!)}
                          className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-1.5"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>View Student ID Card</span>
                        </button>
                      )}
                    </div>

                    {canWithdraw && confirmWithdrawId !== app.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmWithdrawId(app.id);
                          setWithdrawReasonDraft('');
                        }}
                        className="px-3 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold flex items-center gap-1"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Withdraw</span>
                      </button>
                    )}
                  </div>

                  {confirmWithdrawId === app.id && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-700/50 space-y-2">
                      <div className="font-bold text-rose-800 dark:text-rose-200">
                        Confirm Withdrawal of {app.application_ref}
                      </div>
                      <input
                        type="text"
                        value={withdrawReasonDraft}
                        onChange={(e) => setWithdrawReasonDraft(e.target.value)}
                        placeholder="Optional withdrawal reason..."
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-rose-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={withdrawingId === app.id}
                          onClick={() => handleWithdrawApplication(app.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        >
                          {withdrawingId === app.id ? 'Withdrawing...' : 'Confirm Withdraw'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmWithdrawId(null)}
                          className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {showTimeline && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="text-[11px] font-bold uppercase text-slate-500">Application Audit History</div>
                      {timeline.length === 0 ? (
                        <div className="text-slate-500">Application logged at {app.created_at}.</div>
                      ) : (
                        <div className="space-y-2">
                          {timeline.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-200/70 dark:border-slate-800/70 last:border-0 last:pb-0"
                            >
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white capitalize">
                                  {ev.to_status.replace(/_/g, ' ')}
                                </span>{' '}
                                <span className="text-slate-500">
                                  ({ev.action.replace(/_/g, ' ')}) &bull; by {ev.actor_name}
                                </span>
                                {ev.notes && (
                                  <div className="text-slate-600 dark:text-slate-400 mt-0.5">{ev.notes}</div>
                                )}
                              </div>
                              <div className="font-mono text-[10px] text-slate-500 shrink-0">
                                {new Date(ev.created_at).toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: ENROLLED STUDENTS & ID CARDS (Strictly Gated) */}
      {tab === 'enrolled' && (
        <div className="space-y-4">
          {!canAccessStudentHub ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3 text-xs text-slate-500">
              <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Student Hub &amp; Official ID Card Locked Until Enrollment
              </div>
              <p className="max-w-lg mx-auto leading-relaxed">
                {access?.has_approved_awaiting_enrollment
                  ? 'Your admission has been approved! Visit "My Applications" to verify your prerequisites and complete enrollment so your official Student ID Card can be generated.'
                  : 'QR-verified Student ID Cards and enrolled student services are activated only after an admission application is approved and officially enrolled.'}
              </p>
              <button
                type="button"
                onClick={() => setTab(access?.has_approved_awaiting_enrollment ? 'applications' : 'courses')}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold inline-flex items-center gap-1.5"
              >
                <span>{access?.has_approved_awaiting_enrollment ? 'Complete Enrollment Now' : 'Browse Courses'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            activeOrGraduatedEnrollments.map((st) => (
              <div
                key={st.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-sm"
              >
                <div className="space-y-1">
                  <div className="font-mono text-sm font-extrabold text-blue-700 dark:text-amber-400">
                    {st.student_id}
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {st.course_title || st.course_id}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 capitalize">
                    Status: <strong>{st.academic_status}</strong> &bull; Enrolled: {st.enrollment_date}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIdCardStudent(st)}
                  className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-2 transition self-start sm:self-center"
                >
                  <QrCode className="w-4 h-4" />
                  <span>View &amp; Print Student ID Card</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* SYLLABUS MODAL */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white pr-4">
                {selectedCourse.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedCourse(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div>
                <strong>Duration:</strong> {selectedCourse.duration} &bull;{' '}
                <strong>Tuition:</strong> {formatTuition(selectedCourse.price)}
              </div>
              <p className="leading-relaxed bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                {selectedCourse.description}
              </p>
              {selectedCourse.curriculum_outline && (
                <p className="leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  {selectedCourse.curriculum_outline}
                </p>
              )}
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedCourse(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Close
              </button>
              <button
                type="button"
                disabled={selectedCourse.is_available === false}
                onClick={() => {
                  const id = selectedCourse.id;
                  setSelectedCourse(null);
                  handleApplyForCourse(id);
                }}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
              >
                Apply Now
              </button>
            </div>
          </div>
        </div>
      )}

      {idCardStudent && (
        <StudentIdCardModal
          isOpen={Boolean(idCardStudent)}
          student={idCardStudent}
          academyEmail={academyEmail}
          academyAddress={academyAddress}
          onClose={() => setIdCardStudent(null)}
          onOpenVerifyPage={(sid) => {
            window.location.hash = `#verify-student/${encodeURIComponent(sid)}`;
          }}
        />
      )}
    </div>
  );
}
