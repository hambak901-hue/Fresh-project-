/**
 * @file pdfReport.ts
 * Clean Verification Report Extraction & Authentic PDF Generator
 * Uses actual returned identity fields only (never fabricates fallback citizen data)
 * and renders a structured HAMBAKTECH Verification Report PDF when provider PDF is absent.
 */

import { jsPDF } from 'jspdf';

export interface NormalizedIdentityReport {
  firstName: string | null;
  middleName: string | null;
  surname: string | null;
  fullName: string | null;
  nin: string | null;
  bvn: string | null;
  isBvnReport: boolean;
  dateOfBirth: string | null;
  gender: string | null;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  lga: string | null;
  trackingId: string | null;
  enrollmentBank: string | null;
  enrollmentBranch: string | null;
  levelOfAccount: string | null;
  watchListed: string | null;
  maritalStatus: string | null;
  nameOnCard: string | null;
  registrationDate: string | null;
  photo: string | null;
  pdfBase64: string | null;
  pdfUrl: string | null;
  hasOriginalPdf: boolean;
  reference: string;
  verifiedAt: string;
  status: string;
  slipTypeName: string;
}

function cleanField(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

export function extractVerificationReport(record: any): NormalizedIdentityReport {
  const raw = record?.data || record?.result || record || {};
  const nested =
    raw?.user_data && typeof raw.user_data === 'object'
      ? { ...raw, ...raw.user_data }
      : raw?.data && typeof raw.data === 'object'
      ? { ...raw, ...raw.data }
      : raw;

  const firstName = cleanField(nested.firstname ?? nested.firstName ?? nested.first_name);
  const middleName = cleanField(nested.middlename ?? nested.middleName ?? nested.middle_name);
  const surname = cleanField(nested.surname ?? nested.lastName ?? nested.last_name ?? nested.lastname);
  const fullNameParts = [firstName, middleName, surname].filter(Boolean);
  const fullName =
    fullNameParts.length > 0
      ? fullNameParts.join(' ')
      : cleanField(nested.full_name ?? nested.fullName ?? nested.nameOnCard ?? nested.name_on_card);

  const serviceKeyLower = String(record?.service_key ?? '').toLowerCase();
  const typeLower = String(record?.type ?? '').toLowerCase();

  const nin = cleanField(
    nested.nin ??
      nested.NIN ??
      (serviceKeyLower.includes('nin') && !serviceKeyLower.includes('bvn') ? record?.search_value : null)
  );
  const bvn = cleanField(
    nested.bvn ??
      nested.BVN ??
      ((serviceKeyLower === 'bvn_v1' || serviceKeyLower === 'bvn_v2' || serviceKeyLower === 'bvn_v3')
        ? record?.search_value
        : null)
  );
  const isBvnReport = Boolean(
    bvn ||
      serviceKeyLower.startsWith('bvn') ||
      typeLower === 'bvn' ||
      typeLower.includes('bvn')
  );

  const dateOfBirth = cleanField(nested.birthdate ?? nested.dateOfBirth ?? nested.date_of_birth ?? nested.dob);
  const gender = cleanField(nested.gender ?? nested.sex);
  const phoneNumber = cleanField(
    nested.telephoneno ??
      nested.phone ??
      nested.phoneNumber ??
      nested.phoneNumber1 ??
      nested.phone_number ??
      nested.phone_number_1 ??
      (serviceKeyLower.includes('phone') || serviceKeyLower === 'bvn_retrieval' ? record?.search_value : null)
  );
  const email = cleanField(nested.email ?? nested.emailAddress);

  const address = cleanField(
    nested.address ??
      nested.residence_address ??
      nested.residential_address ??
      nested.residentialAddress ??
      nested.residence_AdressLine1
  );
  const state = cleanField(
    nested.residence_state ?? nested.stateOfResidence ?? nested.state ?? nested.stateOfOrigin
  );
  const lga = cleanField(
    nested.residence_lga ?? nested.lgaOfResidence ?? nested.lga ?? nested.lgaOfOrigin
  );
  const trackingId = cleanField(nested.tracking_id ?? nested.trackingId);

  const enrollmentBank = cleanField(nested.enrollment_bank ?? nested.enrollmentBank);
  const enrollmentBranch = cleanField(nested.enrollment_branch ?? nested.enrollmentBranch);
  const levelOfAccount = cleanField(nested.level_of_account ?? nested.levelOfAccount);
  const watchListed = cleanField(nested.watch_listed ?? nested.watchListed ?? nested.watchlisted);
  const maritalStatus = cleanField(nested.marital_status ?? nested.maritalStatus);
  const nameOnCard = cleanField(nested.name_on_card ?? nested.nameOnCard);
  const registrationDate = cleanField(nested.registration_date ?? nested.registrationDate);

  let photo = cleanField(nested.photo ?? nested.base64Image ?? nested.image ?? nested.avatar);
  if (photo) {
    const isUrlOrAsset =
      photo.startsWith('data:') ||
      photo.startsWith('http://') ||
      photo.startsWith('https://') ||
      photo.startsWith('/assets/') ||
      photo.startsWith('/uploads/');
    if (!isUrlOrAsset) {
      const mime = photo.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
      photo = `data:${mime};base64,${photo}`;
    }
  }

  const pdfBase64 = cleanField(
    nested.pdf_base64 ?? record?.pdf_base64 ?? record?.result?.pdf_base64 ?? record?.data?.pdf_base64
  );
  const pdfUrl = cleanField(
    nested.pdf_url ?? record?.pdf_url ?? record?.result?.pdf_url ?? record?.data?.pdf_url
  );
  const hasOriginalPdf = Boolean(pdfBase64 || pdfUrl || record?.has_original_pdf);

  const reference = cleanField(record?.reference ?? nested.reference) || 'N/A';
  const rawDate = cleanField(record?.verified_at ?? record?.created_at ?? nested.verified_at);
  const verifiedAt = rawDate
    ? new Date(rawDate).toLocaleString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleString('en-NG');

  const status = cleanField(record?.status) || 'VERIFIED';
  const slipTypeName =
    cleanField(record?.slip_name ?? record?.slip_type ?? nested.slip_type) ||
    (isBvnReport ? 'BVN Verification Report' : 'Standard Verification Report');

  return {
    firstName,
    middleName,
    surname,
    fullName,
    nin,
    bvn,
    isBvnReport,
    dateOfBirth,
    gender,
    phoneNumber,
    email,
    address,
    state,
    lga,
    trackingId,
    enrollmentBank,
    enrollmentBranch,
    levelOfAccount,
    watchListed,
    maritalStatus,
    nameOnCard,
    registrationDate,
    photo,
    pdfBase64,
    pdfUrl,
    hasOriginalPdf,
    reference,
    verifiedAt,
    status: status.toUpperCase(),
    slipTypeName,
  };
}

async function resolvePhotoForPdf(src: string | null): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' | 'WEBP' } | null> {
  if (!src) return null;
  if (src.startsWith('data:image/')) {
    const fmt = src.includes('image/png') ? 'PNG' : src.includes('image/webp') ? 'WEBP' : 'JPEG';
    return { dataUrl: src, format: fmt };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch(src, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Image read failed'));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl.startsWith('data:image/')) return null;
    const fmt = dataUrl.includes('image/png') ? 'PNG' : dataUrl.includes('image/webp') ? 'WEBP' : 'JPEG';
    return { dataUrl, format: fmt };
  } catch {
    return null;
  }
}

export async function downloadVerificationReportPdf(
  record: any,
  companyName: string = 'HAMBAK TECH & SERVICES'
): Promise<'original_provider_pdf' | 'generated_report_pdf'> {
  const report = extractVerificationReport(record);

  if (report.pdfUrl) {
    const a = document.createElement('a');
    a.href = report.pdfUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = `HAMBAKTECH_ORIGINAL_SLIP_${report.bvn || report.nin || report.reference}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return 'original_provider_pdf';
  }

  if (report.pdfBase64) {
    try {
      const cleanBase64 = report.pdfBase64.replace(/^data:application\/pdf;base64,/i, '').replace(/\s+/g, '');
      const byteCharacters = atob(cleanBase64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HAMBAKTECH_ORIGINAL_SLIP_${report.bvn || report.nin || report.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 2500);
      return 'original_provider_pdf';
    } catch (err) {
      console.warn('Original PDF decode failed, falling back to generated HAMBAKTECH report:', err);
    }
  }

  // Generate clean HAMBAKTECH Verification Report PDF using jsPDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName.toUpperCase(), 15, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(
    report.isBvnReport ? 'BANK VERIFICATION NUMBER (BVN) REPORT' : 'DIGITAL IDENTITY VERIFICATION REPORT',
    15,
    22
  );
  doc.setFontSize(8.5);
  doc.text(`Format: ${report.slipTypeName}   |   Status: ${report.status}`, 15, 28);

  y = 44;

  // Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(15, y, pageWidth - 30, 18, 2, 2, 'FD');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSACTION REFERENCE', 20, y + 6);
  doc.text('VERIFICATION DATE', 110, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(report.reference, 20, y + 13);
  doc.text(report.verifiedAt, 110, y + 13);

  y += 26;

  // Photograph (if returned as data URI or loadable URL)
  let textStartX = 15;
  const resolvedPhoto = await resolvePhotoForPdf(report.photo);
  if (resolvedPhoto) {
    try {
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(15, y, 36, 44, 2, 2, 'S');
      doc.addImage(resolvedPhoto.dataUrl, resolvedPhoto.format, 16, y + 1, 34, 42);
      textStartX = 58;
    } catch (imgErr) {
      console.warn('Could not embed photo into PDF:', imgErr);
    }
  }

  // Identity Fields (only actual returned fields)
  const rawFields: Array<[string, string | null]> = [
    ['First Name', report.firstName],
    ['Middle Name', report.middleName],
    ['Surname', report.surname],
    ['Bank Verification Number (BVN)', report.bvn],
    ['National Identity Number (NIN)', report.nin],
    ['Date of Birth', report.dateOfBirth],
    ['Gender', report.gender],
    ['Phone Number', report.phoneNumber],
    ['Email Address', report.email],
    ['Residential Address', [report.address, report.lga, report.state].filter(Boolean).join(', ') || null],
    ['Enrollment Bank', report.enrollmentBank],
    ['Enrollment Branch', report.enrollmentBranch],
    ['Account Level', report.levelOfAccount],
    ['Watchlisted', report.watchListed],
    ['Marital Status', report.maritalStatus],
    ['Name on Card', report.nameOnCard],
    ['Registration Date', report.registrationDate],
    ['Tracking Reference', report.trackingId],
  ];
  const fields = rawFields.filter((entry): entry is [string, string] => Boolean(entry[1]));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(report.isBvnReport ? 'Verified BVN Identity Summary' : 'Verified Identity Summary', textStartX, y + 4);
  let fieldY = y + 12;

  fields.forEach(([label, value], index) => {
    const startX = index < 4 ? textStartX : 15;
    if (index === 4 && textStartX > 15) {
      fieldY = Math.max(fieldY, y + 50);
    }
    if (fieldY > 250) {
      doc.addPage();
      fieldY = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), startX, fieldY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    const wrapped = doc.splitTextToSize(value, pageWidth - startX - 15);
    doc.text(wrapped, startX, fieldY + 5);
    fieldY += 5 + wrapped.length * 5 + 3;
  });

  // Verification Disclaimer Footer
  const footerY = 266;
  doc.setDrawColor(226, 232, 240);
  doc.line(15, footerY - 4, pageWidth - 15, footerY - 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('IMPORTANT NOTICE & VERIFICATION DISCLAIMER', 15, footerY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const authorityText = report.isBvnReport
    ? 'official banking credentials issued directly by the Central Bank of Nigeria (CBN) or NIBSS.'
    : 'an official government-issued ID card or certificate issued directly by the National Identity Management Commission (NIMC).';
  const disclaimer = doc.splitTextToSize(
    `This document is an automated verification report generated by ${companyName} based on authorized identity registry query results at the timestamp indicated above. It serves strictly as a digital verification record for business/KYC reference and does NOT replace ${authorityText}`,
    pageWidth - 30
  );
  doc.text(disclaimer, 15, footerY + 5);

  doc.save(`HAMBAKTECH_VERIFICATION_REPORT_${report.bvn || report.nin || report.reference}.pdf`);
  return 'generated_report_pdf';
}
