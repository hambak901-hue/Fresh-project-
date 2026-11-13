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
  dateOfBirth: string | null;
  gender: string | null;
  phoneNumber: string | null;
  address: string | null;
  state: string | null;
  lga: string | null;
  trackingId: string | null;
  photo: string | null;
  pdfBase64: string | null;
  pdfUrl: string | null;
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
  const nested = (raw?.user_data && typeof raw.user_data === 'object')
    ? { ...raw, ...raw.user_data }
    : raw;

  const firstName = cleanField(nested.firstname ?? nested.firstName ?? nested.first_name);
  const middleName = cleanField(nested.middlename ?? nested.middleName ?? nested.middle_name);
  const surname = cleanField(nested.surname ?? nested.lastName ?? nested.last_name ?? nested.lastname);
  const fullNameParts = [firstName, middleName, surname].filter(Boolean);
  const fullName = fullNameParts.length > 0
    ? fullNameParts.join(' ')
    : cleanField(nested.full_name ?? nested.fullName);

  const nin = cleanField(nested.nin ?? nested.NIN ?? (record?.service_key?.includes('nin') ? record?.search_value : null));
  const bvn = cleanField(nested.bvn ?? nested.BVN ?? (record?.service_key?.includes('bvn') ? record?.search_value : null));
  const dateOfBirth = cleanField(nested.birthdate ?? nested.dateOfBirth ?? nested.date_of_birth ?? nested.dob);
  const gender = cleanField(nested.gender ?? nested.sex);
  const phoneNumber = cleanField(
    nested.telephoneno ??
    nested.phone ??
    nested.phoneNumber ??
    nested.phone_number ??
    (record?.service_key?.includes('phone') ? record?.search_value : null)
  );

  const address = cleanField(
    nested.address ??
    nested.residence_address ??
    nested.residential_address ??
    nested.residence_AdressLine1
  );
  const state = cleanField(nested.residence_state ?? nested.state ?? nested.stateOfOrigin);
  const lga = cleanField(nested.residence_lga ?? nested.lga ?? nested.lgaOfOrigin);
  const trackingId = cleanField(nested.tracking_id ?? nested.trackingId);

  let photo = cleanField(nested.photo ?? nested.image ?? nested.avatar);
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

  const pdfBase64 = cleanField(nested.pdf_base64 ?? record?.pdf_base64 ?? record?.result?.pdf_base64);
  const pdfUrl = cleanField(nested.pdf_url ?? record?.pdf_url ?? record?.result?.pdf_url);

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
  const slipTypeName = cleanField(record?.slip_name ?? record?.slip_type ?? nested.slip_type) || 'Standard Verification Report';

  return {
    firstName,
    middleName,
    surname,
    fullName,
    nin,
    bvn,
    dateOfBirth,
    gender,
    phoneNumber,
    address,
    state,
    lga,
    trackingId,
    photo,
    pdfBase64,
    pdfUrl,
    reference,
    verifiedAt,
    status: status.toUpperCase(),
    slipTypeName,
  };
}

export async function downloadVerificationReportPdf(
  record: any,
  companyName: string = 'HAMBAK TECH & SERVICES'
): Promise<void> {
  const report = extractVerificationReport(record);

  // 1. Use provider-supplied Base64 PDF directly if returned
  if (report.pdfBase64) {
    try {
      const cleanBase64 = report.pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HAMBAKTECH_VERIFICATION_${report.nin || report.bvn || report.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch (err) {
      console.warn('Provider PDF decode failed, generating client PDF report:', err);
    }
  }

  // 2. Generate clean HAMBAKTECH Verification Report PDF using jsPDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName.toUpperCase(), 15, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text('DIGITAL IDENTITY VERIFICATION REPORT', 15, 22);
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

  // Photograph (if returned as data URI or loadable image)
  let textStartX = 15;
  if (report.photo && report.photo.startsWith('data:image/')) {
    try {
      const imgFormat = report.photo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(15, y, 36, 44, 2, 2, 'S');
      doc.addImage(report.photo, imgFormat, 16, y + 1, 34, 42);
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
    ['National Identity Number (NIN)', report.nin],
    ['Bank Verification Number (BVN)', report.bvn],
    ['Date of Birth', report.dateOfBirth],
    ['Gender', report.gender],
    ['Phone Number', report.phoneNumber],
    ['Residential Address', [report.address, report.lga, report.state].filter(Boolean).join(', ') || null],
    ['Tracking Reference', report.trackingId],
  ];
  const fields = rawFields.filter((entry): entry is [string, string] => Boolean(entry[1]));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Verified Identity Summary', textStartX, y + 4);
  let fieldY = y + 12;

  fields.forEach(([label, value], index) => {
    const startX = index < 4 ? textStartX : 15;
    if (index === 4 && textStartX > 15) {
      fieldY = Math.max(fieldY, y + 50);
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
  const disclaimer = doc.splitTextToSize(
    `This document is an automated verification report generated by ${companyName} based on authorized identity registry query results at the timestamp indicated above. It serves strictly as a digital verification record for business/KYC reference and does NOT replace an official government-issued ID card or certificate issued directly by the National Identity Management Commission (NIMC).`,
    pageWidth - 30
  );
  doc.text(disclaimer, 15, footerY + 5);

  doc.save(`HAMBAKTECH_NIN_REPORT_${report.nin || report.reference}.pdf`);
}
