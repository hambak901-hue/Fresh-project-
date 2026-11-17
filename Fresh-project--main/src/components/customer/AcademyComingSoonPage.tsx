/**
 * @file AcademyComingSoonPage.tsx
 * Live Customer Portal module for HAMBAK TECH & SERVICES Digital Training Academy.
 * Preserves the exported component symbol while providing full Stage 2 functionality:
 * 12 official courses, online admission with Under-18 guardian enforcement,
 * personal applications history, and QR Student ID card access.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Calendar,
  MapPin,
  Mail,
  QrCode,
  ShieldAlert,
  FileCheck,
  Search,
  X,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { AcademyApplication, AcademyCourse, AcademySettings, AcademyStudent } from '../../types';
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

export function AcademyComingSoonPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [applications, setApplications] = useState<AcademyApplication[]>([]);
  const [enrollments, setEnrollments] = useState<AcademyStudent[]>([]);
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
    guardian_name: '',
    guardian_phone: '',
    guardian_address: '',
    guardian_relationship: 'Parent',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<string | null>(null);

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
    setSuccessRef(null);
    setTab('apply');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
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
      setErrorMsg(err?.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const academyName = settings?.academy_name || 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY';
  const academyEmail = settings?.email || settings?.contact_email || 'hambak901@gmail.com';
  const academyAddress = settings?.address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';

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
              Browse all {courses.length || 12} official training tracks, submit online admission applications, track approval status, and download your QR-verified Student ID card.
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
            { id: 'courses', label: `Courses (${courses.length})`, icon: BookOpen },
            { id: 'apply', label: 'Apply Online', icon: GraduationCap },
            { id: 'applications', label: `My Applications (${applications.length})`, icon: FileCheck },
            { id: 'enrolled', label: `Enrolled & ID Cards (${enrollments.length})`, icon: QrCode },
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
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-700/50 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
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
            disabled={submitting}
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
            applications.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-sm"
              >
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
                  {app.info_request_message && (
                    <div className="text-amber-700 dark:text-amber-300 pt-1">
                      Note: {app.info_request_message}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:items-end gap-2">
                  <span
                    className={`px-3 py-1 rounded-lg font-bold uppercase text-[10px] ${
                      app.status === 'approved' || app.status === 'enrolled'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : app.status === 'rejected'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                    }`}
                  >
                    {app.status}
                  </span>
                  {app.student_id && (
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                      ID: {app.student_id}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: ENROLLED STUDENTS & ID CARDS */}
      {tab === 'enrolled' && (
        <div className="space-y-4">
          {enrollments.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No active student enrollments yet. Once an application is approved by Admissions, your official QR Student ID Card will appear here.
            </div>
          ) : (
            enrollments.map((st) => (
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
