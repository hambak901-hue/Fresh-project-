import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, Plus, Trash2, Edit3, Settings, ShieldAlert, CheckCircle2, 
  AlertCircle, RefreshCw, Save, BookOpen, Clock, Award, Users, BookMarked
} from 'lucide-react';
import { api } from '../../lib/api';
import { AcademyCourse, AcademySettings } from '../../types';

export const AcademyManagement: React.FC = () => {
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [settings, setSettings] = useState<AcademySettings>({
    academy_name: 'HambakTech Digital Agency Academy',
    status: 'coming_soon',
    coming_soon_message: 'Master VTU business operations, identity verification compliance, and digital agency scaling. Enrolling soon!',
    instructor_lead: 'HambakTech Operations & Legal Compliance Team',
    certificate_issuer: 'HambakTech Fintech Institute',
    allow_waitlist: true,
  });

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AcademyCourse | null>(null);
  const [courseForm, setCourseForm] = useState({
    title: '',
    level: 'Beginner',
    duration: '4 Weeks',
    modules_count: 6,
    price: 0,
    description: '',
    status: 'enrolling' as 'draft' | 'enrolling' | 'active'
  });

  const loadAcademyData = async () => {
    setLoading(true);
    try {
      const res = await api.getAcademyAdmin();
      if (res.success) {
        setCourses(res.courses || []);
        if (res.settings) {
          setSettings(res.settings);
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback(null);
    try {
      const res = await api.updateAcademySettings(settings);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Academy settings updated successfully' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update academy settings' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingCourse(null);
    setCourseForm({
      title: '',
      level: 'Beginner',
      duration: '4 Weeks',
      modules_count: 6,
      price: 0,
      description: '',
      status: 'enrolling'
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (course: AcademyCourse) => {
    setEditingCourse(course);
    setCourseForm({
      title: course.title,
      level: course.level,
      duration: course.duration,
      modules_count: course.modules_count,
      price: course.price,
      description: course.description,
      status: course.status
    });
    setIsModalOpen(true);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCourse(true);
    setFeedback(null);
    try {
      if (editingCourse) {
        const res = await api.updateAcademyCourse(editingCourse.id, courseForm);
        if (res.success) {
          setFeedback({ type: 'success', message: `Course "${courseForm.title}" updated` });
          setIsModalOpen(false);
          loadAcademyData();
        }
      } else {
        const res = await api.createAcademyCourse(courseForm);
        if (res.success) {
          setFeedback({ type: 'success', message: `Course "${courseForm.title}" created` });
          setIsModalOpen(false);
          loadAcademyData();
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save course' });
    } finally {
      setSavingCourse(false);
    }
  };

  const handleDeleteCourse = async (id: string, title: string) => {
    if (!window.confirm(`Delete course "${title}"?`)) return;
    try {
      const res = await api.deleteAcademyCourse(id);
      if (res.success) {
        setFeedback({ type: 'success', message: `Course "${title}" removed` });
        loadAcademyData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete course' });
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <GraduationCap className="w-3.5 h-3.5" />
            Phase 8 • Academy Management
          </div>
          <h2 className="text-2xl font-bold text-white">Digital Agency Academy</h2>
          <p className="text-slate-400 text-sm mt-1">
            Configure agent training curriculum, certifications, and Coming Soon stage settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAcademyData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh Academy"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl flex items-center justify-between border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ACADEMY SETTINGS CARD */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Academy Configuration & Stage Settings</h3>
            <p className="text-xs text-slate-400">Curriculum preview is live with waitlist pre-registration active</p>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Academy Title</label>
              <input
                type="text"
                value={settings.academy_name}
                onChange={(e) => setSettings({ ...settings, academy_name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Module Status</label>
              <select
                value={settings.status}
                onChange={(e) => setSettings({ ...settings, status: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500 font-medium"
              >
                <option value="coming_soon">Coming Soon (Waitlist & Syllabus Preview)</option>
                <option value="active">Active (Full Course Access)</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Coming Soon Announcement</label>
            <textarea
              rows={2}
              value={settings.coming_soon_message}
              onChange={(e) => setSettings({ ...settings, coming_soon_message: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Lead Instructor / Faculty</label>
              <input
                type="text"
                value={settings.instructor_lead}
                onChange={(e) => setSettings({ ...settings, instructor_lead: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Certificate Issuer</label>
              <input
                type="text"
                value={settings.certificate_issuer}
                onChange={(e) => setSettings({ ...settings, certificate_issuer: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allow_waitlist}
                  onChange={(e) => setSettings({ ...settings, allow_waitlist: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-0"
                />
                <span className="text-slate-300 font-medium">Accept Waitlist Registrations</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-2 transition-colors shadow-lg shadow-purple-600/20"
            >
              <Save className="w-4 h-4" />
              {savingSettings ? 'Saving Settings...' : 'Save Academy Settings'}
            </button>
          </div>
        </form>
      </div>

      {/* CURRICULUM COURSES TABLE */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Staged Training Tracks & Courses</h3>
              <p className="text-xs text-slate-400">{courses.length} courses planned for agent certification</p>
            </div>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-purple-600/20"
          >
            <Plus className="w-4 h-4" />
            Add Track / Course
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="pb-3 pl-2">Course Title</th>
                <th className="pb-3">Level</th>
                <th className="pb-3">Duration</th>
                <th className="pb-3 text-center">Modules</th>
                <th className="pb-3 text-right">Tuition</th>
                <th className="pb-3 text-center">Enrollment Status</th>
                <th className="pb-3 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {courses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No courses created yet.
                  </td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-2">
                      <div>
                        <p className="font-semibold text-white">{course.title}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{course.description}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        course.level === 'Beginner' ? 'bg-sky-500/10 text-sky-400' :
                        course.level === 'Intermediate' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-purple-500/10 text-purple-400'
                      }`}>
                        {course.level}
                      </span>
                    </td>
                    <td className="py-3 text-slate-300">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {course.duration}
                      </div>
                    </td>
                    <td className="py-3 text-center font-mono">
                      {course.modules_count} modules
                    </td>
                    <td className="py-3 text-right font-mono font-semibold text-white">
                      {course.price === 0 ? (
                        <span className="text-emerald-400 font-bold uppercase text-[10px]">Free Grant</span>
                      ) : (
                        `₦${course.price.toLocaleString()}`
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        course.status === 'enrolling'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : course.status === 'active'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {course.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEditModal(course)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                          title="Edit Course"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCourse(course.id, course.title)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete Course"
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

      {/* COURSE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-purple-400" />
                {editingCourse ? 'Edit Course / Track' : 'Create Course / Track'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCourse} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Course Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NIMC Verification Agent Masterclass"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Difficulty Level</label>
                  <select
                    value={courseForm.level}
                    onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Duration</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 3 Weeks"
                    value={courseForm.duration}
                    onChange={(e) => setCourseForm({ ...courseForm, duration: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Modules</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={courseForm.modules_count}
                    onChange={(e) => setCourseForm({ ...courseForm, modules_count: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Tuition (₦, 0 = Free)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={courseForm.price}
                    onChange={(e) => setCourseForm({ ...courseForm, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Enrollment Status</label>
                  <select
                    value={courseForm.status}
                    onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500 font-medium"
                  >
                    <option value="enrolling">Enrolling (Waitlist Open)</option>
                    <option value="active">Active (Ongoing)</option>
                    <option value="draft">Draft (Hidden)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Curriculum Overview & Syllabus</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Outline modules, learning objectives, practical exercises, and certification criteria..."
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCourse}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors shadow-lg shadow-purple-600/20"
                >
                  {savingCourse ? 'Saving...' : editingCourse ? 'Update Course' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
