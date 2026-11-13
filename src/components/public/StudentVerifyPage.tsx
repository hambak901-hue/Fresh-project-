/**
 * @file StudentVerifyPage.tsx
 * Public verification page (#verify-student & #verify-student/<student_id>).
 * Returns ONLY safe non-PII verification fields from GET /api/academy/verify.
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { StudentVerificationResult } from '../../types';
import { ShieldCheck, Search, CheckCircle2, AlertCircle, GraduationCap, Calendar, Clock, Building2, ArrowLeft } from 'lucide-react';

interface StudentVerifyPageProps {
  initialStudentId?: string;
  onNavigate?: (page: string) => void;
}

export const StudentVerifyPage: React.FC<StudentVerifyPageProps> = ({ initialStudentId = '', onNavigate }) => {
  const [studentIdInput, setStudentIdInput] = useState(initialStudentId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StudentVerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const performVerify = async (targetId: string) => {
    const clean = targetId.trim();
    if (!clean) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await api.verifyStudentById(clean);
      setResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to verify Student ID right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialStudentId) {
      setStudentIdInput(initialStudentId);
      performVerify(initialStudentId);
    }
  }, [initialStudentId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performVerify(studentIdInput);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      {onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate('academy')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Digital Training Academy</span>
        </button>
      )}

      {/* Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-4">
        <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
          <ShieldCheck className="w-4 h-4" />
          <span>HAMBAK TECH &amp; SERVICES DIGITAL TRAINING ACADEMY</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Student ID Credential Verification
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Enter an official Academy Student ID number (for example, <span className="font-mono font-semibold">HTDA/2026/0001</span>) or scan a Student ID QR code to verify enrollment and academic standing. Only safe public academic status fields are displayed.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              placeholder="Enter Student ID (e.g. HTDA/2026/0001)"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors shadow-sm"
          >
            {loading ? 'Verifying...' : 'Verify Student ID'}
          </button>
        </form>
      </div>

      {errorMsg && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-5 flex items-center gap-3 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {result && (
        <div
          className={`rounded-2xl border p-6 sm:p-8 space-y-6 shadow-sm ${
            result.valid
              ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-500/40'
              : 'bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-500/40'
          }`}
        >
          {result.valid ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Authentic Academy Credential
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{result.full_name}</h2>
                  </div>
                </div>
                <span className="self-start sm:self-auto px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 font-mono text-xs font-bold">
                  {result.student_id}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    <GraduationCap className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <span>Enrolled Program</span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">{result.course_title}</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Course Duration &amp; Status</span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm capitalize">
                    {result.course_duration} &bull;{' '}
                    <span className="text-emerald-700 dark:text-emerald-400">{result.academic_status}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    <Calendar className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <span>Enrollment Date</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white">
                    {result.enrollment_date ? result.enrollment_date.slice(0, 10) : '-'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    <Building2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span>Issuing Authority</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {result.academy?.name || 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY'} ({result.academy?.business_reg_number || 'BN 9284726'})
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm">Record Not Found</div>
                <p>{result.message || 'No matching student credential was found for that Student ID.'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
