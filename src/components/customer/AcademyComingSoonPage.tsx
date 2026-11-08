import React, { useState } from 'react';
import { GraduationCap, Clock, BookOpen, CheckCircle2, Award, Users, Bell, Sparkles } from 'lucide-react';

export function AcademyComingSoonPage() {
  const [enrolled, setEnrolled] = useState(false);

  const courses = [
    {
      title: 'Nigerian VTU Business Mastery & Automated Sells',
      modules: 8,
      duration: '4 Weeks',
      level: 'Beginner to Pro',
      summary: 'Learn how to generate ₦150k - ₦500k monthly reselling data, airtime, and utility tokens with zero upfront inventory.',
    },
    {
      title: 'NIMC Identity Verification Agent Licensing Course',
      modules: 12,
      duration: '6 Weeks',
      level: 'Professional',
      summary: 'Comprehensive compliance and software operating certification for authorized NIN and BVN slip enrollment centers.',
    },
    {
      title: 'Agency Banking & POS Terminal Fleet Operations',
      modules: 6,
      duration: '2 Weeks',
      level: 'Intermediate',
      summary: 'Managing cash-in cash-out (CICO), float balancing, Moniepoint settlement gateways, and dispute resolution.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Module Status: Coming Soon</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              HambakTech Fintech & Agency Academy
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Professional training tracks, accredited certificates, and video masterclasses for telecom resellers and identity verification agents.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnrolled(!enrolled)}
            className={`px-4 py-3 rounded-xl font-medium text-sm flex items-center gap-2 transition ${
              enrolled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
            }`}
          >
            {enrolled ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Enrolled in Priority Waitlist</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                <span>Join Early Bird Waitlist</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Curriculum Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>Accredited Course Curriculum</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">3 Tracks In Development</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {courses.map((course, idx) => (
            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                    {course.level}
                  </span>
                  <span className="text-slate-400 font-mono">{course.duration}</span>
                </div>
                <h3 className="font-bold text-white text-base leading-snug">{course.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{course.summary}</p>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>{course.modules} Interactive Modules</span>
                </div>
                <button
                  disabled
                  className="px-3 py-1.5 bg-slate-800 text-slate-400 text-xs rounded-lg cursor-not-allowed font-medium"
                >
                  Coming Soon
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Learning Perks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <Award className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-white">Digital Certificate</p>
            <p className="text-slate-400 mt-0.5">Shareable PDF & LinkedIn credential upon course completion.</p>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <Users className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-white">Agent Community</p>
            <p className="text-slate-400 mt-0.5">Exclusive Telegram and WhatsApp mastermind groups with top earners.</p>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-white">Direct Mentorship</p>
            <p className="text-slate-400 mt-0.5">Live bi-weekly Q&A webinars with HambakTech founders.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
