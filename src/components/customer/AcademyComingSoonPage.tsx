import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, Clock, BookOpen, CheckCircle2, Award, Users, 
  Bell, Sparkles, BookMarked, Eye, X, Check
} from 'lucide-react';
import { api } from '../../lib/api';
import { AcademyCourse, AcademySettings } from '../../types';

export function AcademyComingSoonPage() {
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<AcademyCourse | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');

  useEffect(() => {
    api.getCustomerAcademy().then(res => {
      if (res?.success) {
        setCourses(res.courses || []);
        setSettings(res.settings || null);
      }
    }).catch(err => {
      console.warn('Failed to load academy courses:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const handleEnrollWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail) return;
    setEnrolled(true);
    setTimeout(() => {
      setEnrolled(false);
      setWaitlistEmail('');
    }, 4000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-purple-950/70 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full">
              <Clock className="w-3.5 h-3.5" />
              <span>Module Status: Coming Soon • Phase 8 Staged Curriculum</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {settings?.academy_name || 'HambakTech Digital Agency Academy'}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {settings?.coming_soon_message || 'Professional training tracks, accredited certificates, and video masterclasses for telecom resellers and identity verification agents.'}
            </p>
          </div>

          {/* Waitlist Box */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 sm:w-80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Bell className="w-4 h-4 text-purple-400" />
              <span>Priority Enrollment Waitlist</span>
            </div>
            {enrolled ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>You're enrolled for early bird access!</span>
              </div>
            ) : (
              <form onSubmit={handleEnrollWaitlist} className="space-y-2">
                <input
                  type="email"
                  required
                  placeholder="Enter your student email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-purple-600/20"
                >
                  Join Academy Waitlist
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Curriculum Preview Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-400" />
            <span>Accredited Course Curriculum (Preview Only)</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">{courses.length} Tracks Staged</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-400 font-semibold bg-purple-500/10 px-2.5 py-0.5 rounded-full">
                    {course.level}
                  </span>
                  <span className="text-slate-400 font-mono">{course.duration}</span>
                </div>
                <h3 className="font-bold text-white text-base leading-snug">{course.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{course.description}</p>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Award className="w-4 h-4 text-purple-400" />
                  <span>{course.modules_count} Modules</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCourse(course)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg font-medium flex items-center gap-1.5 transition border border-slate-700"
                >
                  <Eye className="w-3.5 h-3.5 text-purple-400" />
                  <span>Syllabus</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Learning Perks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <Award className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-white">Accredited Certificate</p>
            <p className="text-slate-400 mt-0.5">
              Issued by {settings?.certificate_issuer || 'HambakTech Fintech Institute'} upon track completion.
            </p>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <Users className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-white">Agent Community</p>
            <p className="text-slate-400 mt-0.5">Exclusive Telegram & WhatsApp mastermind channels for verified learners.</p>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-white">Industry Faculty</p>
            <p className="text-slate-400 mt-0.5">
              Curated by {settings?.instructor_lead || 'HambakTech Operations Team'}.
            </p>
          </div>
        </div>
      </div>

      {/* Course Syllabus Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white truncate pr-4">{selectedCourse.title}</h3>
              <button onClick={() => setSelectedCourse(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Track Level:</span>
                <span className="text-purple-400 font-semibold">{selectedCourse.level}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Course Duration:</span>
                <span className="text-white font-mono">{selectedCourse.duration}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Total Curriculum Modules:</span>
                <span className="text-white font-mono">{selectedCourse.modules_count} comprehensive units</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400">
                  Coming Soon (Waitlist Open)
                </span>
              </div>
              <div className="pt-2">
                <span className="text-slate-400 block mb-1">Curriculum Outline:</span>
                <p className="text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
                  {selectedCourse.description}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedCourse(null)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition"
              >
                Close Syllabus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
