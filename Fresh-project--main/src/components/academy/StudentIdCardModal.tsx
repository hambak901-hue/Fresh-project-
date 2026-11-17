/**
 * @file StudentIdCardModal.tsx
 * Official printable & downloadable Student ID Card modal for HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY.
 * Generates scannable QR code linking to public verification route (#verify-student/<student_id>).
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, X, ShieldCheck, GraduationCap, MapPin, Mail, ExternalLink } from 'lucide-react';
import { AcademyStudent } from '../../types';
import { getInitialsAvatar } from '../../lib/avatar';

interface StudentIdCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: AcademyStudent | null;
  academyName?: string;
  academyEmail?: string;
  academyAddress?: string;
  businessRegNumber?: string;
  motto?: string;
  onOpenVerifyPage?: (studentId: string) => void;
}

export const StudentIdCardModal: React.FC<StudentIdCardModalProps> = ({
  isOpen,
  onClose,
  student,
  academyName = 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY',
  academyEmail = 'hambak901@gmail.com',
  academyAddress = 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
  businessRegNumber = 'BN 9284726',
  motto = 'Where Technology Meets Services',
  onOpenVerifyPage,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const verifyUrl = student
    ? `https://hambaktech.com.ng/#verify-student/${encodeURIComponent(student.student_id)}`
    : '';

  useEffect(() => {
    if (!isOpen || !student?.student_id) return;
    let active = true;
    QRCode.toDataURL(verifyUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [isOpen, student?.student_id, verifyUrl]);

  if (!isOpen || !student) return null;

  const avatarSrc = student.photo_url || getInitialsAvatar(student.full_name);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `HTDA-QR-${student.student_id.replace(/\//g, '-')}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-6">
        {/* Top Action Bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Official Academy Student ID Card</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{student.student_id}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenVerifyPage && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVerifyPage(student.student_id);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Verify Live</span>
              </button>
            )}
            {qrDataUrl && (
              <button
                type="button"
                onClick={handleDownloadQr}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download QR</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close Student ID Card"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Front & Back Cards */}
        <div className="p-6 sm:p-8 bg-slate-100 dark:bg-slate-950/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* FRONT FACE */}
            <div className="rounded-2xl overflow-hidden bg-white border-2 border-blue-700 shadow-lg flex flex-col justify-between text-slate-900">
              {/* Top Official Header */}
              <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-blue-900 text-white px-5 py-4 flex items-center gap-3 border-b-4 border-amber-500">
                <img
                  src="/logo.png"
                  alt="HAMBAKTECH Logo"
                  className="w-11 h-11 rounded-xl bg-white p-1 object-contain shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold tracking-wide leading-tight uppercase">
                    {academyName}
                  </div>
                  <div className="text-[10px] text-amber-300 font-semibold mt-0.5">
                    {motto} &bull; {businessRegNumber}
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 flex gap-4 items-center flex-1">
                <div className="shrink-0 flex flex-col items-center gap-1.5">
                  <img
                    src={avatarSrc}
                    alt={student.full_name}
                    className="w-24 h-28 rounded-xl object-cover border-2 border-blue-700 bg-slate-100"
                  />
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      student.academic_status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : student.academic_status === 'graduated'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {student.academic_status}
                  </span>
                </div>

                <div className="min-w-0 flex-1 space-y-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Student Name</div>
                    <div className="text-sm font-extrabold text-slate-900 truncate">{student.full_name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Student ID Number</div>
                    <div className="font-mono font-bold text-blue-700 text-xs">{student.student_id}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Program / Course</div>
                    <div className="font-bold text-slate-800 leading-snug">{student.course_title || 'Approved Track'}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <div className="text-[9px] uppercase text-slate-500 font-semibold">Duration</div>
                      <div className="font-semibold text-slate-800">{student.course_duration || 'Standard'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-slate-500 font-semibold">Enrolled</div>
                      <div className="font-mono font-semibold text-slate-800">
                        {student.enrollment_date ? student.enrollment_date.slice(0, 10) : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Front Footer Strip */}
              <div className="bg-slate-900 text-white px-5 py-2.5 flex items-center justify-between text-[10px]">
                <span className="font-semibold text-amber-400 uppercase tracking-wider">Official Student Identity</span>
                <span className="font-mono text-slate-300">Valid Digital Credential</span>
              </div>
            </div>

            {/* BACK FACE */}
            <div className="rounded-2xl overflow-hidden bg-white border-2 border-slate-300 shadow-lg flex flex-col justify-between text-slate-900 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-xs font-extrabold text-blue-800 uppercase tracking-wide">
                    Credential Verification
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    Scan the QR code to confirm student enrollment authenticity on the official portal.
                  </p>
                </div>
                <ShieldCheck className="w-6 h-6 text-blue-700 shrink-0" />
              </div>

              <div className="flex items-center gap-4">
                <div className="p-2 rounded-xl border border-slate-200 bg-white shrink-0">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt={`Verification QR for ${student.student_id}`} className="w-28 h-28" />
                  ) : (
                    <div className="w-28 h-28 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] text-slate-500">
                      Generating QR...
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-[11px] min-w-0">
                  <div className="flex items-start gap-1.5 text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
                    <span>{academyAddress}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Mail className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span className="font-mono">{academyEmail}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-[10px] font-mono text-blue-900 break-all">
                    {verifyUrl}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[10px] text-slate-600">
                <span>Property of HAMBAK TECH &amp; SERVICES ({businessRegNumber})</span>
                <span className="font-mono font-bold text-slate-800">
                  {student.id_card_issued_at ? `Issued ${student.id_card_issued_at.slice(0, 10)}` : 'Active'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
