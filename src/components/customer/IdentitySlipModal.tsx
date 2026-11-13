/**
 * @file IdentitySlipModal.tsx
 * Human-Readable Verification Report Viewer, Printer & PDF Exporter.
 * Displays strictly the actual identity fields returned by verification queries
 * (never fabricates fallback data), supports HAMBAKTECH branding, genuine PDF export,
 * and clean A4 print layout.
 */

import React, { useEffect, useState } from 'react';
import {
  Printer,
  Download,
  X,
  ShieldCheck,
  CheckCircle2,
  QrCode,
  Lock,
  Loader2,
  FileText,
} from 'lucide-react';
import { useCms } from '../../context/CmsContext';
import { downloadVerificationReportPdf, extractVerificationReport } from '../../lib/pdfReport';

interface IdentitySlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: any;
  slipType?: string;
}

export const IdentitySlipModal: React.FC<IdentitySlipModalProps> = ({
  isOpen,
  onClose,
  record,
}) => {
  const { branding } = useCms();
  const [downloading, setDownloading] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const report = record ? extractVerificationReport(record) : null;

  useEffect(() => {
    setPhotoLoadError(false);
  }, [isOpen, report?.photo, report?.reference]);

  if (!isOpen || !record || !report) return null;

  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadVerificationReportPdf(record, companyName);
    } finally {
      setDownloading(false);
    }
  };

  const detailFields: Array<{ label: string; value: string | null; mono?: boolean }> = [
    { label: 'First Name', value: report.firstName },
    { label: 'Middle Name', value: report.middleName },
    { label: 'Surname', value: report.surname },
    { label: 'Bank Verification Number (BVN)', value: report.bvn, mono: true },
    { label: 'National Identity Number (NIN)', value: report.nin, mono: true },
    { label: 'Date of Birth', value: report.dateOfBirth, mono: true },
    { label: 'Gender', value: report.gender },
    { label: 'Phone Number', value: report.phoneNumber, mono: true },
    { label: 'Email Address', value: report.email },
    { label: 'Address / Location', value: [report.address, report.lga, report.state].filter(Boolean).join(', ') || null },
    { label: 'Enrollment Bank', value: report.enrollmentBank },
    { label: 'Enrollment Branch', value: report.enrollmentBranch },
    { label: 'Account Level', value: report.levelOfAccount },
    { label: 'Watchlisted', value: report.watchListed },
    { label: 'Marital Status', value: report.maritalStatus },
    { label: 'Name on Card', value: report.nameOnCard },
    { label: 'Registration Date', value: report.registrationDate, mono: true },
    { label: 'Tracking Reference', value: report.trackingId, mono: true },
  ].filter(item => Boolean(item.value));

  return (
    <div className="print-modal-backdrop fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto print-only-area">
        {/* Top Control Bar */}
        <div className="no-print shrink-0 flex flex-wrap items-center justify-between gap-2 px-3.5 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wide truncate">
              {report.slipTypeName}
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-bold">
              {report.status}
            </span>
            <span
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                report.hasOriginalPdf
                  ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {report.hasOriginalPdf ? 'Original Document PDF' : 'Generated Report PDF'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold transition shadow-sm"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>
                {downloading
                  ? 'Preparing PDF...'
                  : report.hasOriginalPdf
                  ? 'Download Original PDF'
                  : 'Download Report PDF'}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
              aria-label="Close report"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Verification Report Body */}
        <div className="p-4 sm:p-8 space-y-6 overflow-y-auto flex-1">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
            {/* Report Brand Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 flex items-center justify-center border border-blue-600/20 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                    {companyName}
                  </h2>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    {report.isBvnReport ? 'Bank Verification Number (BVN) Report' : 'Digital Identity Verification Report'} &bull; {report.slipTypeName}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right text-[11px]">
                <div className="text-slate-500 dark:text-slate-400 uppercase font-semibold">Transaction Reference</div>
                <div className="font-mono font-bold text-slate-900 dark:text-white">{report.reference}</div>
              </div>
            </div>

            {/* Portrait + Key Identity Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
              {report.photo && !photoLoadError ? (
                <div className="sm:col-span-4 flex flex-col items-center gap-3">
                  <div className="w-32 h-40 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                    <img
                      src={report.photo}
                      alt={report.fullName || 'Verified Subject Photograph'}
                      className="w-full h-full object-cover"
                      onError={() => setPhotoLoadError(true)}
                    />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-bold">
                    Returned Portrait
                  </span>
                </div>
              ) : (
                <div className="sm:col-span-4 flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/50 text-center">
                  <FileText className="w-8 h-8 text-slate-400" />
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {photoLoadError ? 'Returned portrait image unavailable' : 'No portrait returned for this slip query'}
                  </span>
                </div>
              )}

              <div className="sm:col-span-8 space-y-4">
                {report.fullName && (
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                      Full Name
                    </span>
                    <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                      {report.fullName}
                    </h3>
                  </div>
                )}

                {detailFields.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {detailFields.map(field => (
                      <div
                        key={field.label}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                      >
                        <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                          {field.label}
                        </div>
                        <div
                          className={`text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 break-words ${
                            field.mono ? 'font-mono' : ''
                          }`}
                        >
                          {field.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                    Verification completed. Reference: <span className="font-mono font-bold">{report.reference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Metadata & Legal Disclaimer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Verification Timestamp: {report.verifiedAt}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  <QrCode className="w-3.5 h-3.5 text-slate-500" />
                  <span>Ref: {report.reference}</span>
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <strong>Verification Notice:</strong> This document is a {companyName} digital verification report generated from authorized query output at the timestamp above. It is provided strictly for legitimate KYC and identity confirmation records and does not replace {report.isBvnReport ? 'official banking credentials issued directly by CBN/NIBSS' : 'an official government-issued ID card issued directly by NIMC'}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
