/**
 * @file AcademyManagement.tsx
 * Stage 2: HAMBAK TECH & SERVICES Digital Training Academy Admin Console.
 * Features 4 tabs:
 * 1. Courses (12 Official Tracks & CRUD with nullable fee, categories, schedule dates, ordering)
 * 2. Admissions Queue (Review, Approve -> issue HTDA/YYYY/0001, Request Info, Reject, Under-18 Guardian inspection)
 * 3. Enrolled Students Registry (Status & Completion Date management + QR Student ID Card modal)
 * 4. Academy Settings (Official identity, prefix, admissions open toggles & date window, phone lines)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  Plus,
  Trash2,
  Edit3,
  Settings,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  BookOpen,
  Clock,
  Users,
  BookMarked,
  ClipboardList,
  Search,
  Eye,
  X,
  QrCode,
  ShieldAlert,
  UserCheck,
  MessageSquareMore,
  XCircle,
  Calendar,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  AcademyApplication,
  AcademyCourse,
  AcademySettings,
  AcademyStudent,
} from '../../types';
import { StudentIdCardModal } from '../academy/StudentIdCardModal';

const DEFAULT_ACADEMY_SETTINGS: AcademySettings = {
  academy_name: 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY',
  short_name: 'HTDA',
  email: 'hambak901@gmail.com',
  contact_email: 'hambak901@gmail.com',
  mentor_email: 'hambak901@gmail.com',
  address: 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
  business_reg_number: 'BN 9284726',
  motto: 'Where Technology Meets Services',
  student_id_prefix: 'HTDA',
  certificate_prefix: 'HTDA-CERT',
  status: 'active',
  coming_soon: false,
  coming_soon_message:
    'Admissions are open for practical ICT, computer appreciation, web development, digital business, and mobile repair training tracks.',
  admission_open: true,
  enrollment_open: true,
  admission_start_date: '2026-01-01',
  admission_end_date: '2026-12-31',
  instructor_lead: 'HAMBAK TECH & SERVICES Faculty',
  certificate_issuer: 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY',
  allow_waitlist: true,
  whatsapp_number: '09155104724',
  business_phone: '08147837664',
  office_phone: '09127469686',
  banner_url: '',
};

type AdminAcademyTab = 'courses' | 'applications' | 'students' | 'settings';

function formatPriceLabel(price: number | null | undefined): string {
  if (price === null || price === undefined) return 'Contact Academy';
  if (Number(price) === 0) return 'Free / Scholarship';
  return `₦${Number(price).toLocaleString('en-NG')}`;
}

export const AcademyManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminAcademyTab>('courses');
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [applications, setApplications] = useState<AcademyApplication[]>([]);
  const [students, setStudents] = useState<AcademyStudent[]>([]);
  const [settings, setSettings] = useState<AcademySettings>(DEFAULT_ACADEMY_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);
  const [reviewingApp, setReviewingApp] = useState(false);
  const [updatingStudentId, setUpdatingStudentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [courseSearch, setCourseSearch] = useState('');
  const [courseCategoryFilter, setCourseCategoryFilter] = useState('ALL');
  const [appStatusFilter, setAppStatusFilter] = useState<string>('all');
  const [appSearch, setAppSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Course Modal
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AcademyCourse | null>(null);
  const [contactAcademyFee, setContactAcademyFee] = useState<boolean>(true);
  const [courseForm, setCourseForm] = useState({
    title: '',
    category: 'Foundational ICT',
    level: 'Beginner',
    duration: '6 Weeks',
    modules_count: 6,
    price: 0,
    description: '',
    curriculum_outline: '',
    is_available: true,
    admission_start_date: '2026-01-01',
    admission_end_date: '2026-12-31',
    display_order: 1,
    status: 'active' as 'draft' | 'enrolling' | 'active',
  });

  // Application Inspect / Review Modal
  const [selectedApp, setSelectedApp] = useState<AcademyApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [infoRequestMsg, setInfoRequestMsg] = useState('');

  // Student ID Card Modal + Edit Student Modal
  const [idCardStudent, setIdCardStudent] = useState<AcademyStudent | null>(null);
  const [editingStudent, setEditingStudent] = useState<AcademyStudent | null>(null);
  const [studentStatusForm, setStudentStatusForm] = useState<{
    academic_status: 'active' | 'graduated' | 'suspended' | 'withdrawn';
    completion_date: string;
    course_id: string;
  }>({
    academic_status: 'active',
    completion_date: '',
    course_id: '',
  });

  const loadAcademyData = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminAcademy();
      if (res.success) {
        setCourses(res.courses || []);
        setApplications(res.applications || []);
        setStudents(res.students || []);
        if (res.settings) {
          setSettings({ ...DEFAULT_ACADEMY_SETTINGS, ...res.settings });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load academy data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAcademyData();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    courses.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [courses]);

  const sortedFilteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    return [...courses]
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999))
      .filter((c) => {
        if (courseCategoryFilter !== 'ALL' && c.category !== courseCategoryFilter) return false;
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          (c.category || '').toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
        );
      });
  }, [courses, courseSearch, courseCategoryFilter]);

  const filteredApplications = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return applications.filter((a) => {
      if (appStatusFilter !== 'all' && a.status !== appStatusFilter) return false;
      if (!q) return true;
      return (
        a.full_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.application_ref.toLowerCase().includes(q) ||
        (a.course_title || '').toLowerCase().includes(q)
      );
    });
  }, [applications, appStatusFilter, appSearch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students.filter((s) => {
      if (!q) return true;
      return (
        s.student_id.toLowerCase().includes(q) ||
        s.full_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.course_title || '').toLowerCase().includes(q)
      );
    });
  }, [students, studentSearch]);

  const pendingCount = applications.filter((a) => a.status === 'pending' || a.status === 'info_requested').length;

  // Course CRUD handlers
  const handleOpenAddCourse = () => {
    setEditingCourse(null);
    setContactAcademyFee(true);
    setCourseForm({
      title: '',
      category: 'Foundational ICT',
      level: 'Beginner',
      duration: '6 Weeks',
      modules_count: 6,
      price: 0,
      description: '',
      curriculum_outline: '',
      is_available: true,
      admission_start_date: settings.admission_start_date || '2026-01-01',
      admission_end_date: settings.admission_end_date || '2026-12-31',
      display_order: courses.length + 1,
      status: 'active',
    });
    setIsCourseModalOpen(true);
  };

  const handleOpenEditCourse = (course: AcademyCourse) => {
    setEditingCourse(course);
    setContactAcademyFee(course.price === null || course.price === undefined);
    setCourseForm({
      title: course.title,
      category: course.category || 'Foundational ICT',
      level: course.level || 'Beginner',
      duration: course.duration || '6 Weeks',
      modules_count: course.modules_count || 6,
      price: course.price ?? 0,
      description: course.description || '',
      curriculum_outline: course.curriculum_outline || '',
      is_available: course.is_available !== false,
      admission_start_date: course.admission_start_date || '',
      admission_end_date: course.admission_end_date || '',
      display_order: course.display_order ?? 1,
      status: course.status || 'active',
    });
    setIsCourseModalOpen(true);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCourse(true);
    setFeedback(null);
    const payload = {
      ...courseForm,
      price: contactAcademyFee ? null : Number(courseForm.price),
      admission_start_date: courseForm.admission_start_date || null,
      admission_end_date: courseForm.admission_end_date || null,
    };
    try {
      if (editingCourse) {
        const res = await api.updateAdminAcademyCourse(editingCourse.id, payload);
        if (res.success) {
          setFeedback({ type: 'success', message: `Course "${courseForm.title}" updated.` });
          setIsCourseModalOpen(false);
          await loadAcademyData();
        }
      } else {
        const res = await api.createAdminAcademyCourse(payload);
        if (res.success) {
          setFeedback({ type: 'success', message: `Course "${courseForm.title}" created.` });
          setIsCourseModalOpen(false);
          await loadAcademyData();
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save course' });
    } finally {
      setSavingCourse(false);
    }
  };

  const handleToggleCourseAvailability = async (course: AcademyCourse) => {
    try {
      const nextAvailable = !(course.is_available !== false);
      const res = await api.updateAdminAcademyCourse(course.id, { is_available: nextAvailable });
      if (res.success) {
        setCourses((prev) =>
          prev.map((c) => (c.id === course.id ? { ...c, is_available: nextAvailable } : c))
        );
        setFeedback({
          type: 'success',
          message: `"${course.title}" marked as ${nextAvailable ? 'Available for Admission' : 'Closed / Unavailable'}.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update course availability' });
    }
  };

  const handleDeleteCourse = async (id: string, title: string) => {
    if (!window.confirm(`Delete course "${title}"?`)) return;
    try {
      const res = await api.deleteAdminAcademyCourse(id);
      if (res.success) {
        setFeedback({ type: 'success', message: `Course "${title}" removed.` });
        await loadAcademyData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete course' });
    }
  };

  // Application review handlers
  const handleInspectApplication = (app: AcademyApplication) => {
    setSelectedApp(app);
    setAdminNotes(app.admin_notes || '');
    setInfoRequestMsg(app.info_request_message || '');
  };

  const handleReviewAction = async (action: 'approve' | 'reject' | 'request_info') => {
    if (!selectedApp) return;
    if (action === 'request_info' && !infoRequestMsg.trim()) {
      setFeedback({ type: 'error', message: 'Please enter the details requested from the applicant.' });
      return;
    }
    setReviewingApp(true);
    setFeedback(null);
    try {
      const res = await api.reviewAcademyApplication(selectedApp.id, {
        action,
        admin_notes: adminNotes.trim() || undefined,
        info_request_message: action === 'request_info' ? infoRequestMsg.trim() : undefined,
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          message:
            action === 'approve' && res.student
              ? `Approved! Official Student ID issued: ${res.student.student_id}`
              : res.message || 'Application review saved.',
        });
        setSelectedApp(null);
        await loadAcademyData();
        if (action === 'approve' && res.student) {
          setIdCardStudent(res.student);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to process application review' });
    } finally {
      setReviewingApp(false);
    }
  };

  // Student record edit handlers
  const handleOpenEditStudent = (st: AcademyStudent) => {
    setEditingStudent(st);
    setStudentStatusForm({
      academic_status: st.academic_status || 'active',
      completion_date: st.completion_date ? st.completion_date.slice(0, 10) : '',
      course_id: st.course_id,
    });
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setUpdatingStudentId(editingStudent.id);
    setFeedback(null);
    try {
      const res = await api.updateAcademyStudent(editingStudent.id, {
        academic_status: studentStatusForm.academic_status,
        completion_date: studentStatusForm.completion_date || null,
        course_id: studentStatusForm.course_id || undefined,
      });
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Updated student ${editingStudent.student_id} (${studentStatusForm.academic_status}).`,
        });
        setEditingStudent(null);
        await loadAcademyData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update student record' });
    } finally {
      setUpdatingStudentId(null);
    }
  };

  // Academy Settings handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback(null);
    try {
      const res = await api.updateAdminAcademySettings(settings);
      if (res.success) {
        if (res.settings) setSettings({ ...DEFAULT_ACADEMY_SETTINGS, ...res.settings });
        setFeedback({ type: 'success', message: 'Academy settings saved and synced live.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update academy settings' });
    } finally {
      setSavingSettings(false);
    }
  };

  const openVerifyStudentRoute = (studentId: string) => {
    window.location.hash = `#verify-student/${encodeURIComponent(studentId)}`;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-1">
            <GraduationCap className="w-4 h-4" />
            <span>HAMBAK TECH &amp; SERVICES Digital Training Academy</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Academy Courses, Admissions &amp; Student Registry
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">
            Manage all official curriculum tracks, admission reviews (with Under-18 guardian verification), QR Student ID cards, and enrollment dates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAcademyData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between border text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-semibold">{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Training Courses</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{courses.length}</div>
          <div className="text-[11px] text-blue-700 dark:text-blue-400 font-medium mt-0.5">
            {courses.filter((c) => c.is_available !== false && c.status !== 'draft').length} available for admission
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Pending Admissions</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{pendingCount}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {applications.length} total applications received
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Enrolled Students</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{students.length}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {students.filter((s) => s.academic_status === 'active').length} active &bull;{' '}
            {students.filter((s) => s.academic_status === 'graduated').length} graduated
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Admission Window</div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-1.5">
            {settings.admission_open ? 'Admissions Open' : 'Closed / Pause'}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            {settings.admission_start_date || '2026-01-01'} → {settings.admission_end_date || '2026-12-31'}
          </div>
        </div>
      </div>

      {/* 4-Tab Bar */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { key: 'courses', label: `Courses (${courses.length})`, icon: BookOpen },
          { key: 'applications', label: `Admissions Queue (${pendingCount})`, icon: ClipboardList },
          { key: 'students', label: `Enrolled Students (${students.length})`, icon: Users },
          { key: 'settings', label: 'Academy Settings', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as AdminAcademyTab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                active
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: COURSES */}
      {activeTab === 'courses' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="Search courses by title or category..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <select
                value={courseCategoryFilter}
                onChange={(e) => setCourseCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenAddCourse}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Official Course</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="pb-3 pl-2">#</th>
                  <th className="pb-3">Course Title &amp; Category</th>
                  <th className="pb-3">Duration / Level</th>
                  <th className="pb-3">Admission Window</th>
                  <th className="pb-3 text-right">Tuition Fee</th>
                  <th className="pb-3 text-center">Availability</th>
                  <th className="pb-3 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sortedFilteredCourses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No matching courses found.
                    </td>
                  </tr>
                ) : (
                  sortedFilteredCourses.map((course) => {
                    const available = course.is_available !== false;
                    return (
                      <tr key={course.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pl-2 font-mono text-slate-500">{course.display_order ?? '-'}</td>
                        <td className="py-3">
                          <div className="font-bold text-slate-900 dark:text-white">{course.title}</div>
                          <div className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                            {course.category || 'ICT Training'} &bull; {course.modules_count} modules
                          </div>
                        </td>
                        <td className="py-3 text-slate-700 dark:text-slate-300">
                          <div className="flex items-center gap-1 font-medium">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{course.duration}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">{course.level}</span>
                        </td>
                        <td className="py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {course.admission_start_date && course.admission_end_date
                            ? `${course.admission_start_date} → ${course.admission_end_date}`
                            : 'Open Cohort'}
                        </td>
                        <td className="py-3 text-right font-semibold text-slate-900 dark:text-white">
                          <span
                            className={
                              course.price === null || course.price === undefined
                                ? 'text-amber-700 dark:text-amber-400 text-[11px]'
                                : 'font-mono'
                            }
                          >
                            {formatPriceLabel(course.price)}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleCourseAvailability(course)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                              available
                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {available ? 'Available' : 'Closed'}
                          </button>
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditCourse(course)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-white"
                              title="Edit Course"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCourse(course.id, course.title)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/20"
                              title="Delete Course"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ADMISSIONS QUEUE */}
      {activeTab === 'applications' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Search applicant name, email, or reference..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['all', 'pending', 'info_requested', 'approved', 'rejected'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setAppStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-colors ${
                    appStatusFilter === st
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="pb-3 pl-2">Reference</th>
                  <th className="pb-3">Applicant</th>
                  <th className="pb-3">Course Selected</th>
                  <th className="pb-3">Age / Guardian</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 pr-2 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredApplications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No admission applications match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredApplications.map((app) => {
                    const isMinor = Number(app.age_at_submission) < 18;
                    return (
                      <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pl-2 font-mono font-bold text-blue-700 dark:text-blue-400">
                          {app.application_ref}
                          {app.student_id && (
                            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                              {app.student_id}
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="font-bold text-slate-900 dark:text-white">{app.full_name}</div>
                          <div className="text-[11px] text-slate-500">
                            {app.email} &bull; {app.phone}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {app.course_title || app.course_id}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {app.study_mode} &bull; {app.preferred_schedule}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {app.age_at_submission} yrs
                            </span>
                            {isMinor && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                Under 18
                              </span>
                            )}
                          </div>
                          {app.guardian_name && (
                            <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              Guardian: {app.guardian_name} ({app.guardian_relationship})
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                              app.status === 'approved' || app.status === 'enrolled'
                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                : app.status === 'rejected'
                                ? 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300'
                                : app.status === 'info_requested'
                                ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                : 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300'
                            }`}
                          >
                            {app.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleInspectApplication(app)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-700 hover:text-white text-slate-700 dark:text-slate-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
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
      )}

      {/* TAB 3: ENROLLED STUDENTS REGISTRY */}
      {activeTab === 'students' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search Student ID (HTDA/...), name, or course..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredStudents.length} of {students.length} enrolled students
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="pb-3 pl-2">Student ID</th>
                  <th className="pb-3">Full Name &amp; Contact</th>
                  <th className="pb-3">Course Track</th>
                  <th className="pb-3">Enrolled / Completion</th>
                  <th className="pb-3">Academic Status</th>
                  <th className="pb-3 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No enrolled students yet. Approve an admission application to issue an official Student ID.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 pl-2 font-mono font-bold text-blue-700 dark:text-blue-400">
                        {st.student_id}
                      </td>
                      <td className="py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{st.full_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {st.email} &bull; {st.phone}
                        </div>
                      </td>
                      <td className="py-3 font-medium text-slate-800 dark:text-slate-200">
                        {st.course_title || st.course_id}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        <div>In: {st.enrollment_date ? st.enrollment_date.slice(0, 10) : '-'}</div>
                        <div>Out: {st.completion_date ? st.completion_date.slice(0, 10) : 'Ongoing'}</div>
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                            st.academic_status === 'active'
                              ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                              : st.academic_status === 'graduated'
                              ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300'
                              : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {st.academic_status}
                        </span>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIdCardStudent(st)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-[11px] font-bold inline-flex items-center gap-1"
                            title="View Printable QR Student ID Card"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>ID Card</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditStudent(st)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-white"
                            title="Update Student Status & Completion Date"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
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

      {/* TAB 4: ACADEMY SETTINGS */}
      {activeTab === 'settings' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <form onSubmit={handleSaveSettings} className="space-y-5 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Official Academy Name</label>
                <input
                  type="text"
                  value={settings.academy_name || ''}
                  onChange={(e) => setSettings({ ...settings, academy_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Academy Motto</label>
                <input
                  type="text"
                  value={settings.motto || ''}
                  onChange={(e) => setSettings({ ...settings, motto: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Academy Email</label>
                <input
                  type="email"
                  value={settings.email || settings.contact_email || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, email: e.target.value, contact_email: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Business Reg Number</label>
                <input
                  type="text"
                  value={settings.business_reg_number || ''}
                  onChange={(e) => setSettings({ ...settings, business_reg_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Student ID Prefix</label>
                <input
                  type="text"
                  value={settings.student_id_prefix || 'HTDA'}
                  onChange={(e) => setSettings({ ...settings, student_id_prefix: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Academy Training Address</label>
              <input
                type="text"
                value={settings.address || ''}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">WhatsApp Contact</label>
                <input
                  type="text"
                  value={settings.whatsapp_number || ''}
                  onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Business / Upline Contact</label>
                <input
                  type="text"
                  value={settings.business_phone || ''}
                  onChange={(e) => setSettings({ ...settings, business_phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Customer Service / Office</label>
                <input
                  type="text"
                  value={settings.office_phone || ''}
                  onChange={(e) => setSettings({ ...settings, office_phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Portal Status</label>
                <select
                  value={settings.status}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      status: e.target.value as any,
                      coming_soon: e.target.value === 'coming_soon',
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 font-semibold"
                >
                  <option value="active">Active (Live Admissions &amp; Courses)</option>
                  <option value="coming_soon">Coming Soon</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Admission Start Date</label>
                <input
                  type="date"
                  value={settings.admission_start_date || ''}
                  onChange={(e) => setSettings({ ...settings, admission_start_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Admission End Date</label>
                <input
                  type="date"
                  value={settings.admission_end_date || ''}
                  onChange={(e) => setSettings({ ...settings, admission_end_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Lead Faculty / Instructor</label>
                <input
                  type="text"
                  value={settings.instructor_lead || ''}
                  onChange={(e) => setSettings({ ...settings, instructor_lead: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Certificate Issuer Name</label>
                <input
                  type="text"
                  value={settings.certificate_issuer || ''}
                  onChange={(e) => setSettings({ ...settings, certificate_issuer: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Admission Banner / Notice Message</label>
              <textarea
                rows={2}
                value={settings.coming_soon_message || ''}
                onChange={(e) => setSettings({ ...settings, coming_soon_message: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.admission_open !== false}
                  onChange={(e) =>
                    setSettings({ ...settings, admission_open: e.target.checked, enrollment_open: e.target.checked })
                  }
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">Admissions Open Globally</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allow_waitlist !== false}
                  onChange={(e) => setSettings({ ...settings, allow_waitlist: e.target.checked })}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">Allow Next-Cohort Waitlist</span>
              </label>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-2 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'Saving Settings...' : 'Save Academy Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COURSE CREATE/EDIT MODAL */}
      {isCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 my-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <span>{editingCourse ? 'Edit Training Course' : 'Create Training Course'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCourseModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCourse} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Course Title</label>
                  <input
                    type="text"
                    required
                    value={courseForm.title}
                    onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Category</label>
                  <input
                    type="text"
                    required
                    value={courseForm.category}
                    onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
                    placeholder="e.g. Software Engineering"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Difficulty</label>
                  <select
                    value={courseForm.level}
                    onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Duration</label>
                  <input
                    type="text"
                    required
                    value={courseForm.duration}
                    onChange={(e) => setCourseForm({ ...courseForm, duration: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Modules</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={courseForm.modules_count}
                    onChange={(e) => setCourseForm({ ...courseForm, modules_count: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Order</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={courseForm.display_order}
                    onChange={(e) => setCourseForm({ ...courseForm, display_order: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={contactAcademyFee}
                      onChange={(e) => setContactAcademyFee(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                    />
                    <span>Fee: Contact Academy (Admin-Configured / Null)</span>
                  </label>
                  {!contactAcademyFee && (
                    <div>
                      <label className="block text-slate-500 mb-1">Tuition Amount (NGN ₦)</label>
                      <input
                        type="number"
                        min="0"
                        value={courseForm.price}
                        onChange={(e) => setCourseForm({ ...courseForm, price: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold">Status &amp; Availability</label>
                  <div className="flex items-center gap-3">
                    <select
                      value={courseForm.status}
                      onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value as any })}
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                    >
                      <option value="active">Active</option>
                      <option value="enrolling">Enrolling</option>
                      <option value="draft">Draft (Hidden)</option>
                    </select>
                    <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={courseForm.is_available}
                        onChange={(e) => setCourseForm({ ...courseForm, is_available: e.target.checked })}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>Available</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Admission Start Date</label>
                  <input
                    type="date"
                    value={courseForm.admission_start_date}
                    onChange={(e) => setCourseForm({ ...courseForm, admission_start_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Admission End Date</label>
                  <input
                    type="date"
                    value={courseForm.admission_end_date}
                    onChange={(e) => setCourseForm({ ...courseForm, admission_end_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Description</label>
                <textarea
                  rows={2}
                  required
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                  Curriculum Outline (Module topics, hands-on deliverables)
                </label>
                <textarea
                  rows={3}
                  value={courseForm.curriculum_outline}
                  onChange={(e) => setCourseForm({ ...courseForm, curriculum_outline: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCourseModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCourse}
                  className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold shadow-sm"
                >
                  {savingCourse ? 'Saving...' : editingCourse ? 'Update Course' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPLICATION REVIEW MODAL */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 my-6 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="font-mono font-bold text-blue-700 dark:text-blue-400">{selectedApp.application_ref}</div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{selectedApp.full_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApp(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-white uppercase text-[11px]">Applicant Details</div>
                <p><strong>Email:</strong> {selectedApp.email}</p>
                <p><strong>Phone:</strong> <span className="font-mono">{selectedApp.phone}</span></p>
                <p>
                  <strong>DOB / Age:</strong> <span className="font-mono">{selectedApp.date_of_birth}</span> ({selectedApp.age_at_submission} yrs)
                </p>
                <p><strong>Gender:</strong> {selectedApp.gender}</p>
                <p><strong>Address:</strong> {selectedApp.address}, {selectedApp.lga}, {selectedApp.state}</p>
                <p><strong>Qualification:</strong> {selectedApp.qualification || '-'}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-white uppercase text-[11px]">Enrollment &amp; Emergency</div>
                <p><strong>Course:</strong> {selectedApp.course_title || selectedApp.course_id}</p>
                <p><strong>Study Mode:</strong> {selectedApp.study_mode}</p>
                <p><strong>Schedule:</strong> {selectedApp.preferred_schedule}</p>
                <p>
                  <strong>Emergency Contact:</strong> {selectedApp.emergency_contact_name || '-'} (
                  <span className="font-mono">{selectedApp.emergency_contact_phone || '-'}</span>)
                </p>
                <p><strong>Current Status:</strong> <span className="uppercase font-bold">{selectedApp.status}</span></p>
                {selectedApp.student_id && (
                  <p>
                    <strong>Issued Student ID:</strong>{' '}
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{selectedApp.student_id}</span>
                  </p>
                )}
              </div>
            </div>

            {(Number(selectedApp.age_at_submission) < 18 || selectedApp.guardian_name) && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-1">
                <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Parent / Guardian Verification (Applicant Age: {selectedApp.age_at_submission})</span>
                </div>
                <p className="text-slate-700 dark:text-slate-200">
                  <strong>Name:</strong> {selectedApp.guardian_name || '-'} &bull;{' '}
                  <strong>Relationship:</strong> {selectedApp.guardian_relationship || '-'}
                </p>
                <p className="text-slate-700 dark:text-slate-200">
                  <strong>Guardian Phone:</strong> <span className="font-mono">{selectedApp.guardian_phone || '-'}</span> &bull;{' '}
                  <strong>Address:</strong> {selectedApp.guardian_address || '-'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Admin Review Notes</label>
                <textarea
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Optional internal / rejection reason notes..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">
                  Request Additional Info Message
                </label>
                <textarea
                  rows={2}
                  value={infoRequestMsg}
                  onChange={(e) => setInfoRequestMsg(e.target.value)}
                  placeholder="Specify missing documents or clarifications..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={reviewingApp}
                onClick={() => handleReviewAction('reject')}
                className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </button>
              <button
                type="button"
                disabled={reviewingApp}
                onClick={() => handleReviewAction('request_info')}
                className="px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5"
              >
                <MessageSquareMore className="w-4 h-4" />
                <span>Request Info</span>
              </button>
              <button
                type="button"
                disabled={reviewingApp}
                onClick={() => handleReviewAction('approve')}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                <UserCheck className="w-4 h-4" />
                <span>{reviewingApp ? 'Processing...' : 'Approve & Issue Student ID'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT STUDENT ACADEMIC STATUS MODAL */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="font-mono font-bold text-blue-700 dark:text-blue-400">{editingStudent.student_id}</div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{editingStudent.full_name}</h3>
              </div>
              <button type="button" onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Academic Status</label>
                <select
                  value={studentStatusForm.academic_status}
                  onChange={(e) =>
                    setStudentStatusForm({ ...studentStatusForm, academic_status: e.target.value as any })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="suspended">Suspended</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Course Track</label>
                <select
                  value={studentStatusForm.course_id}
                  onChange={(e) => setStudentStatusForm({ ...studentStatusForm, course_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Completion / Graduation Date (Optional)</span>
                </label>
                <input
                  type="date"
                  value={studentStatusForm.completion_date}
                  onChange={(e) => setStudentStatusForm({ ...studentStatusForm, completion_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingStudentId === editingStudent.id}
                  className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold"
                >
                  {updatingStudentId === editingStudent.id ? 'Saving...' : 'Update Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STUDENT ID CARD MODAL */}
      <StudentIdCardModal
        isOpen={Boolean(idCardStudent)}
        onClose={() => setIdCardStudent(null)}
        student={idCardStudent}
        academyName={settings.academy_name}
        academyEmail={settings.email || 'hambak901@gmail.com'}
        academyAddress={settings.address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria'}
        businessRegNumber={settings.business_reg_number || 'BN 9284726'}
        motto={settings.motto || 'Where Technology Meets Services'}
        onOpenVerifyPage={openVerifyStudentRoute}
      />
    </div>
  );
};
