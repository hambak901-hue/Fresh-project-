/**
 * @file academy.ts
 * Express Development Mirror for HAMBAK TECH ACADEMY — Phase 1:
 * Core Application, Admission Workflow, Student Account Integration,
 * Invitation Activation, Requirement-Gated Enrollment & Audit History.
 * Mirrors backend/controllers/AcademyController.php and backend/services/AcademyService.php.
 */

import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, hashPassword, saveDatabase, User } from '../db/database.js';
import { parseToken, generateToken, sanitizeUser, hasAnyUserPermission } from './auth.js';
import { isConsoleRole } from '../services/dashboardConfig.js';
import { sendEmail } from '../services/mailer.js';

export const academyRouter = Router();
export const customerAcademyRouter = Router();
export const adminAcademyRouter = Router();

export const CANONICAL_STATUSES = [
  'pending',
  'under_review',
  'information_requested',
  'approved',
  'rejected',
  'enrolled',
  'withdrawn',
] as const;

export const ACTIVE_APPLICATION_STATUSES = [
  'pending',
  'under_review',
  'information_requested',
  'approved',
  'enrolled',
];

const UPLOAD_DIR = path.resolve(process.cwd(), 'server', 'db', 'academy_passports');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function normalizeStatus(status?: string | null): string {
  const clean = String(status || '').trim().toLowerCase();
  if (clean === 'info_requested') return 'information_requested';
  if ((CANONICAL_STATUSES as readonly string[]).includes(clean)) return clean;
  return 'pending';
}

export function canTransition(fromStatus: string, toStatus: string): boolean {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (from === to) return false;
  const matrix: Record<string, string[]> = {
    pending: ['under_review', 'information_requested', 'approved', 'rejected', 'withdrawn'],
    under_review: ['information_requested', 'approved', 'rejected', 'withdrawn'],
    information_requested: ['pending', 'under_review', 'approved', 'rejected', 'withdrawn'],
    approved: ['enrolled', 'information_requested', 'rejected', 'withdrawn'],
    enrolled: ['withdrawn'],
    rejected: ['under_review'],
    withdrawn: ['under_review'],
  };
  return (matrix[from] || []).includes(to);
}

function sha256(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

function computeAge(dob: string): number {
  const bd = new Date(dob);
  if (isNaN(bd.getTime())) return -1;
  const today = new Date();
  if (bd > today) return -1;
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

function generateApplicationRef(): string {
  const year = new Date().getFullYear();
  const existing = new Set((db.data.academy_applications || []).map((a: any) => a.application_ref));
  for (let i = 0; i < 12; i++) {
    const suffix = crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
    const ref = `HTDA-APP-${year}-${suffix}`;
    if (!existing.has(ref)) return ref;
  }
  return `HTDA-APP-${year}-${Date.now().toString(36).toUpperCase()}`;
}

function generateStudentId(prefix: string = 'HTDA'): string {
  const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'HTDA';
  const year = new Date().getFullYear();
  const patternPrefix = `${cleanPrefix}/${year}/`;
  const existing = (db.data.academy_students || []).map((s: any) => String(s.student_id || ''));
  let maxSeq = 0;
  for (const sid of existing) {
    if (sid.startsWith(patternPrefix)) {
      const last = sid.split('/').pop() || '';
      if (/^\d+$/.test(last)) {
        const num = parseInt(last, 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }
  let seq = maxSeq + 1;
  while (true) {
    const candidate = `${cleanPrefix}/${year}/${String(seq).padStart(4, '0')}`;
    if (!existing.includes(candidate)) return candidate;
    seq++;
  }
}

function recordEvent(
  applicationId: string,
  fromStatus: string | null,
  toStatus: string,
  action: string,
  actor?: { id?: string | null; full_name?: string; role?: string } | null,
  notes?: string | null,
  metadata?: any
) {
  if (!db.data.academy_application_events) db.data.academy_application_events = [];
  db.data.academy_application_events.push({
    id: crypto.randomUUID(),
    application_id: applicationId,
    from_status: fromStatus ? normalizeStatus(fromStatus) : null,
    to_status: normalizeStatus(toStatus),
    action,
    actor_user_id: actor?.id || null,
    actor_name: actor?.full_name || 'System',
    actor_role: String(actor?.role || 'system').toLowerCase(),
    notes: notes || null,
    metadata: metadata || null,
    created_at: new Date().toISOString(),
  });
  saveDatabase();
}

function getTimeline(applicationId: string) {
  return (db.data.academy_application_events || [])
    .filter((e: any) => e.application_id === applicationId)
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
}

export function reconcileUserAcademyLinksInMemory(userId: string, email: string, emailVerified: boolean = true) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!userId || !cleanEmail || !emailVerified) {
    return { linked_applications: 0, linked_students: 0, role_upgraded: false };
  }

  let linkedApps = 0;
  let linkedStudents = 0;
  let roleUpgraded = false;

  for (const app of db.data.academy_applications || []) {
    if (!app.deleted_at && !app.user_id && String(app.email || '').toLowerCase() === cleanEmail) {
      app.user_id = userId;
      app.account_link_status = 'linked';
      app.updated_at = new Date().toISOString();
      linkedApps++;
      recordEvent(app.id, app.status, app.status, 'account_reconciled', { id: userId, full_name: cleanEmail, role: 'customer' }, 'Application linked upon verified login.');
    }
  }

  for (const stu of db.data.academy_students || []) {
    if (!stu.deleted_at && !stu.user_id && String(stu.email || '').toLowerCase() === cleanEmail) {
      stu.user_id = userId;
      stu.updated_at = new Date().toISOString();
      linkedStudents++;
    }
  }

  for (const inv of db.data.academy_account_invitations || []) {
    if (inv.status === 'pending' && String(inv.email || '').toLowerCase() === cleanEmail) {
      inv.status = 'accepted';
      inv.used_at = inv.used_at || new Date().toISOString();
      inv.created_user_id = inv.created_user_id || userId;
    }
  }

  const hasActiveStudent = (db.data.academy_students || []).some(
    (s: any) => !s.deleted_at && (s.user_id === userId || String(s.email || '').toLowerCase() === cleanEmail) && s.academic_status === 'active'
  );
  if (hasActiveStudent) {
    const user = db.findUserById(userId);
    if (user && String(user.role).toLowerCase() === 'customer') {
      db.updateUser(userId, { role: 'student', assigned_dashboard: 'student' } as any);
      roleUpgraded = true;
    }
  }

  if (linkedApps > 0 || linkedStudents > 0 || roleUpgraded) {
    saveDatabase();
  }
  return { linked_applications: linkedApps, linked_students: linkedStudents, role_upgraded: roleUpgraded };
}

function evaluateEnrollmentRequirements(app: any) {
  const missing: string[] = [];
  const status = normalizeStatus(app.status);
  if (status !== 'approved') {
    missing.push('Application must be in approved admission status first.');
  }
  const course = (db.data.academy_courses || []).find((c: any) => c.id === app.course_id);
  if (course && course.is_available === false) {
    missing.push('Selected training course is currently marked unavailable for enrollment.');
  }

  if (!app.user_id) {
    missing.push('Applicant portal account is not yet created or linked.');
  } else {
    const u = db.findUserById(app.user_id);
    if (!u) {
      missing.push('Linked user account record could not be found.');
    } else {
      if (u.status === 'suspended') missing.push('Linked user account is suspended.');
      if (u.email_verified === false) missing.push('Applicant email address must be verified before enrollment activation.');
    }
  }

  for (const [f, label] of [
    ['full_name', 'Full name'],
    ['email', 'Email address'],
    ['phone', 'Phone number'],
    ['date_of_birth', 'Date of birth'],
    ['address', 'Residential address'],
    ['state', 'State'],
    ['lga', 'LGA'],
  ] as const) {
    if (!String(app[f] || '').trim()) missing.push(`${label} is required.`);
  }

  if (Number(app.age_at_submission ?? 18) < 18) {
    if (!String(app.guardian_name || '').trim() || !String(app.guardian_phone || '').trim() || !String(app.guardian_relationship || '').trim()) {
      missing.push('Parent / Guardian details are mandatory for applicants under 18.');
    }
  }

  return { met: missing.length === 0, missing };
}

function getOptionalAuthUser(req: any): User | null {
  const session = parseToken(req.headers?.authorization);
  if (!session) return null;
  const user = db.findUserById(session.userId);
  if (!user || user.status === 'suspended') return null;
  return user;
}

function requireAuthUser(req: any, res: any): User | null {
  const user = getOptionalAuthUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Authentication required or session expired.' });
    return null;
  }
  return user;
}

function requireAcademyAdmin(req: any, res: any): User | null {
  const user = requireAuthUser(req, res);
  if (!user) return null;
  if (!isConsoleRole(user.role) || !hasAnyUserPermission(user, ['services', 'academy'])) {
    res.status(403).json({ success: false, error: 'Insufficient academy administration permissions.' });
    return null;
  }
  return user;
}

function userOwnsApp(user: User, app: any): boolean {
  if (app.user_id && String(app.user_id) === String(user.id)) return true;
  return Boolean(user.email_verified) && String(user.email).toLowerCase() === String(app.email).toLowerCase();
}

function processApplicationSubmission(req: any, res: any, user: User | null) {
  const settings = db.data.academy_settings;
  if (!settings?.admission_open && !settings?.enrollment_open && settings?.status === 'coming_soon') {
    return res.status(422).json({ success: false, error: 'Admissions are currently closed by the Academy administration.' });
  }

  const body = req.body || {};
  const courseId = String(body.course_id || '').trim();
  const fullName = String(body.full_name || '').trim();
  const email = String(body.email || user?.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const dob = String(body.date_of_birth || '').trim();
  const gender = String(body.gender || '').trim();
  const address = String(body.address || '').trim();
  const state = String(body.state || '').trim();
  const lga = String(body.lga || '').trim();
  const qualification = String(body.qualification || '').trim();
  const studyMode = String(body.study_mode || 'physical').trim();
  const preferredSchedule = String(body.preferred_schedule || 'weekday').trim();
  const guardianName = String(body.guardian_name || '').trim();
  const guardianPhone = String(body.guardian_phone || '').trim();
  const guardianAddress = String(body.guardian_address || '').trim();
  const guardianRelationship = String(body.guardian_relationship || '').trim();
  const emergencyName = String(body.emergency_contact_name || '').trim();
  const emergencyPhone = String(body.emergency_contact_phone || '').trim();
  const passportUrl = String(body.passport_url || '').trim();

  if (!courseId || !fullName || !email || !phone || !dob || !gender || !address || !state || !lga) {
    return res.status(422).json({ success: false, error: 'Please complete all required applicant personal, contact, and course fields.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(422).json({ success: false, error: 'Please enter a valid email address.' });
  }

  const course = (db.data.academy_courses || []).find((c: any) => c.id === courseId);
  if (!course) return res.status(404).json({ success: false, error: 'Selected course was not found.' });
  if (course.is_available === false) return res.status(422).json({ success: false, error: 'Enrollment for this course is currently paused.' });
  if (course.status === 'draft') return res.status(422).json({ success: false, error: 'Selected course is not open for public admission.' });

  const age = computeAge(dob);
  if (age < 5 || age > 110) return res.status(422).json({ success: false, error: 'Please enter a valid date of birth.' });
  if (age < 18 && (!guardianName || !guardianPhone || !guardianAddress || !guardianRelationship)) {
    return res.status(422).json({
      success: false,
      error: 'Applicants under 18 years old must provide complete Parent/Guardian details (full name, phone number, residential address, and relationship).',
    });
  }

  // Active duplicate guard
  const duplicate = (db.data.academy_applications || []).find(
    (a: any) =>
      !a.deleted_at &&
      a.course_id === courseId &&
      ACTIVE_APPLICATION_STATUSES.includes(normalizeStatus(a.status)) &&
      (String(a.email || '').toLowerCase() === email || (user && a.user_id === user.id))
  );
  if (duplicate) {
    const dupStatus = normalizeStatus(duplicate.status);
    if (user) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_ACTIVE_APPLICATION',
        error: `You already have an active application (${duplicate.application_ref}, status: ${dupStatus}) for ${course.title}.`,
        errors: { existing_application_ref: duplicate.application_ref, existing_status: dupStatus },
      });
    }
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_ACTIVE_APPLICATION',
      error: 'An active application for this course is already on file for the submitted details. Please check your email or use the Application Status Tracker.',
    });
  }

  const existingUser = !user ? db.findUserByEmail(email) : null;
  const linkedUserId = user ? user.id : null;
  const appId = crypto.randomUUID();
  const appRef = generateApplicationRef();

  const newApp = {
    id: appId,
    application_ref: appRef,
    user_id: linkedUserId,
    course_id: courseId,
    course_title: course.title,
    course_duration: course.duration,
    full_name: fullName,
    email,
    phone,
    date_of_birth: dob,
    age_at_submission: age,
    gender,
    address,
    state,
    lga,
    qualification: qualification || null,
    study_mode: studyMode || 'physical',
    preferred_schedule: preferredSchedule || 'weekday',
    guardian_name: guardianName || null,
    guardian_phone: guardianPhone || null,
    guardian_address: guardianAddress || null,
    guardian_relationship: guardianRelationship || null,
    emergency_contact_name: emergencyName || null,
    emergency_contact_phone: emergencyPhone || null,
    passport_url: passportUrl || null,
    status: 'pending',
    resubmission_count: 0,
    enrollment_requirements_met: false,
    enrollment_exception: false,
    account_link_status: linkedUserId ? 'linked' : (!existingUser ? 'invited' : 'unlinked'),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!db.data.academy_applications) db.data.academy_applications = [];
  db.data.academy_applications.unshift(newApp);
  recordEvent(appId, null, 'pending', 'submitted', user || { id: null, full_name: fullName, role: 'applicant' }, 'Admission application submitted.', {
    application_ref: appRef,
    course_id: courseId,
  });

  if (!linkedUserId && !existingUser) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    if (!db.data.academy_account_invitations) db.data.academy_account_invitations = [];
    for (const inv of db.data.academy_account_invitations) {
      if (String(inv.email || '').toLowerCase() === email && inv.status === 'pending') {
        inv.status = 'revoked';
      }
    }
    const invRecord: any = {
      id: crypto.randomUUID(),
      application_id: appId,
      email,
      full_name: fullName,
      phone,
      token_hash: sha256(rawToken),
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    // Allow automated local HTTP test runner to inspect token ONLY in non-production NODE_ENV=test/development if local SMTP is unconfigured
    db.data.academy_account_invitations.push(invRecord);
    saveDatabase();
    sendEmail(
      email,
      `[HAMBAKTECH Academy] Activate Your Account — Ref: ${appRef}`,
      `<p>Hello ${fullName}, activate your HAMBAKTECH portal account: https://hambaktech.com.ng/?academy_activate=${rawToken}#academy</p>`
    ).catch(() => {});
  }

  saveDatabase();

  const publicApp = {
    id: newApp.id,
    application_ref: newApp.application_ref,
    course_id: newApp.course_id,
    full_name: newApp.full_name,
    email: newApp.email,
    phone: newApp.phone,
    study_mode: newApp.study_mode,
    preferred_schedule: newApp.preferred_schedule,
    status: newApp.status,
    created_at: newApp.created_at,
    course_title: course.title,
    course_duration: course.duration,
  };

  return res.status(201).json({
    success: true,
    message: user
      ? 'Your admission application has been submitted successfully.'
      : 'Your admission application has been submitted! Please check your email inbox for next steps to track your application and manage your portal access.',
    data: {
      application: publicApp,
      application_ref: appRef,
      account_notice: user ? null : 'Check your email inbox for portal account setup or sign-in instructions.',
    },
    application: publicApp,
    application_ref: appRef,
  });
}

// -----------------------------------------------------------------------------
// PUBLIC ROUTES (/api/academy/*)
// -----------------------------------------------------------------------------

academyRouter.get('/public', (_req, res) => {
  const courses = (db.data.academy_courses || [])
    .filter((c: any) => c.status !== 'draft')
    .sort((a: any, b: any) => (a.display_order || 99) - (b.display_order || 99));
  res.json({
    success: true,
    courses,
    settings: db.data.academy_settings,
  });
});

academyRouter.post('/apply', (req, res) => {
  const user = getOptionalAuthUser(req);
  processApplicationSubmission(req, res, user);
});

academyRouter.get('/application-status', (req, res) => {
  const ref = String(req.query.ref || '').trim().toUpperCase();
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!ref || !email) {
    return res.status(422).json({ success: false, error: 'Please provide both your Application Reference and Email Address.' });
  }

  const app = (db.data.academy_applications || []).find(
    (a: any) => !a.deleted_at && String(a.application_ref || '').toUpperCase() === ref && String(a.email || '').toLowerCase() === email
  );
  if (!app) {
    return res.status(404).json({ success: false, error: 'No matching admission application was found for that reference and email.' });
  }

  const course = (db.data.academy_courses || []).find((c: any) => c.id === app.course_id);
  const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && s.application_id === app.id) || null;
  const normalizedStatus = normalizeStatus(app.status);

  let resubmitToken: string | null = null;
  if (normalizedStatus === 'information_requested') {
    resubmitToken = crypto.randomBytes(24).toString('hex');
    app.resubmit_token_hash = sha256(resubmitToken);
    app.resubmit_token_expires_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    saveDatabase();
  }

  const appPayload = {
    ...app,
    status: normalizedStatus,
    course_title: course?.title || app.course_title,
    course_duration: course?.duration || app.course_duration,
    student_id: stu?.student_id || null,
    academic_status: stu?.academic_status || null,
  };
  delete appPayload.resubmit_token_hash;
  delete appPayload.resubmit_token_expires_at;

  res.json({
    success: true,
    application: appPayload,
    student: stu,
    timeline: getTimeline(app.id),
    resubmit_token: resubmitToken,
  });
});

academyRouter.get('/invitations/validate', (req, res) => {
  const rawToken = String(req.query.token || '').trim();
  if (!rawToken || rawToken.length < 24) {
    return res.status(422).json({ success: false, error: 'Invalid activation token.' });
  }
  const inv = (db.data.academy_account_invitations || []).find((i: any) => i.token_hash === sha256(rawToken));
  if (!inv) return res.status(404).json({ success: false, error: 'This activation link is invalid or does not exist.' });
  if (inv.status !== 'pending') return res.status(410).json({ success: false, code: 'INVITATION_USED', error: 'This activation invitation has already been used or revoked.' });
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    inv.status = 'expired';
    saveDatabase();
    return res.status(410).json({ success: false, code: 'INVITATION_EXPIRED', error: 'This activation link has expired.' });
  }
  const app = (db.data.academy_applications || []).find((a: any) => a.id === inv.application_id);
  const course = app ? (db.data.academy_courses || []).find((c: any) => c.id === app.course_id) : null;
  const existingUser = db.findUserByEmail(inv.email);

  res.json({
    success: true,
    valid: true,
    invitation: {
      email: inv.email,
      full_name: inv.full_name,
      phone: inv.phone,
      application_ref: app?.application_ref || '',
      application_status: normalizeStatus(app?.status),
      course_title: course?.title || 'Academy Training Program',
      expires_at: inv.expires_at,
      requires_existing_login: Boolean(existingUser),
    },
  });
});

academyRouter.post('/activate-account', (req, res) => {
  const { token, password, full_name, phone } = req.body || {};
  const rawToken = String(token || '').trim();
  if (!rawToken || String(password || '').length < 8) {
    return res.status(422).json({ success: false, error: 'A valid activation token and a password of at least 8 characters are required.' });
  }
  const inv = (db.data.academy_account_invitations || []).find((i: any) => i.token_hash === sha256(rawToken));
  if (!inv || inv.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'This activation link is invalid or has already been used.' });
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    inv.status = 'expired';
    saveDatabase();
    return res.status(400).json({ success: false, code: 'INVITATION_EXPIRED', error: 'This activation link has expired.' });
  }
  const email = String(inv.email).toLowerCase();
  if (db.findUserByEmail(email)) {
    return res.status(409).json({
      success: false,
      code: 'ACCOUNT_ALREADY_EXISTS',
      error: 'An account already exists for this email address. Please sign in with your password to automatically link your application.',
    });
  }

  const newUser = db.createUser({
    email,
    password_hash: hashPassword(String(password)),
    full_name: String(full_name || '').trim() || inv.full_name,
    phone_number: String(phone || '').trim() || inv.phone || '',
    role: 'customer',
    assigned_dashboard: 'customer',
    wallet_balance: 0,
    kyc_status: 'unverified',
    tier: 1,
    referral_code: `HMB${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    status: 'active',
    email_verified: true,
    email_verification_required: false,
    email_verified_at: new Date().toISOString(),
  } as any);

  inv.status = 'accepted';
  inv.used_at = new Date().toISOString();
  inv.created_user_id = newUser.id;
  saveDatabase();

  reconcileUserAcademyLinksInMemory(newUser.id, email, true);

  const jwtToken = generateToken(newUser.id, newUser.role, 86400 * 7, Number(newUser.token_version ?? 1));
  res.status(201).json({
    success: true,
    message: 'Account activated and Academy application linked successfully.',
    user: sanitizeUser(newUser, true),
    token: jwtToken,
  });
});

function handleResubmit(req: any, res: any, app: any, actor: any) {
  const currentStatus = normalizeStatus(app.status);
  if (currentStatus !== 'information_requested') {
    return res.status(409).json({ success: false, error: 'Responses can only be submitted when an application has "information_requested" status.' });
  }
  const body = req.body || {};
  const responseMsg = String(body.applicant_response || body.response || body.message || '').trim();
  if (!responseMsg) {
    return res.status(422).json({ success: false, error: 'Please provide your response explaining the updated information or documents.' });
  }

  if (body.phone) app.phone = String(body.phone).trim();
  if (body.address) app.address = String(body.address).trim();
  if (body.state) app.state = String(body.state).trim();
  if (body.lga) app.lga = String(body.lga).trim();
  if (body.qualification !== undefined) app.qualification = body.qualification || null;
  if (body.study_mode) app.study_mode = String(body.study_mode);
  if (body.preferred_schedule) app.preferred_schedule = String(body.preferred_schedule);
  if (body.guardian_name !== undefined) app.guardian_name = body.guardian_name || null;
  if (body.guardian_phone !== undefined) app.guardian_phone = body.guardian_phone || null;
  if (body.guardian_address !== undefined) app.guardian_address = body.guardian_address || null;
  if (body.guardian_relationship !== undefined) app.guardian_relationship = body.guardian_relationship || null;
  if (body.passport_url !== undefined) app.passport_url = body.passport_url || null;

  app.status = 'under_review';
  app.applicant_response = responseMsg;
  app.applicant_responded_at = new Date().toISOString();
  app.resubmission_count = Number(app.resubmission_count || 0) + 1;
  app.resubmit_token_hash = null;
  app.resubmit_token_expires_at = null;
  app.updated_at = new Date().toISOString();
  saveDatabase();

  recordEvent(app.id, currentStatus, 'under_review', 'applicant_resubmitted', actor, responseMsg, { resubmission_count: app.resubmission_count });

  res.json({
    success: true,
    message: 'Your response and updated details have been submitted for admissions review.',
    application: app,
    timeline: getTimeline(app.id),
  });
}

academyRouter.post('/applications/:id/resubmit', (req, res) => {
  const app = (db.data.academy_applications || []).find((a: any) => !a.deleted_at && a.id === req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Application not found.' });

  const user = getOptionalAuthUser(req);
  let authorized = false;
  if (user && userOwnsApp(user, app)) {
    authorized = true;
  } else {
    const token = String(req.body?.resubmit_token || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (
      token &&
      app.resubmit_token_hash &&
      app.resubmit_token_hash === sha256(token) &&
      app.resubmit_token_expires_at &&
      new Date(app.resubmit_token_expires_at).getTime() >= Date.now() &&
      (!email || email === String(app.email).toLowerCase())
    ) {
      authorized = true;
    }
  }
  if (!authorized) return res.status(403).json({ success: false, error: 'Authorization required to resubmit this application.' });
  handleResubmit(req, res, app, user || { id: null, full_name: app.full_name, role: 'applicant' });
});

academyRouter.post('/upload-passport', (req, res) => {
  const user = getOptionalAuthUser(req);
  const { data_url, filename, resubmit_token, application_id } = req.body || {};
  if (!user) {
    const app = (db.data.academy_applications || []).find((a: any) => !a.deleted_at && a.id === String(application_id || ''));
    if (
      !app ||
      !resubmit_token ||
      app.resubmit_token_hash !== sha256(String(resubmit_token)) ||
      new Date(app.resubmit_token_expires_at || 0).getTime() < Date.now()
    ) {
      return res.status(403).json({ success: false, error: 'Please sign in or use an active information-request link to upload a passport photo.' });
    }
  }
  if (!data_url || typeof data_url !== 'string') {
    return res.status(422).json({ success: false, error: 'Image upload payload required.' });
  }
  const match = data_url.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) {
    return res.status(422).json({ success: false, error: 'Only JPEG, PNG, or WEBP passport images are supported.' });
  }
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) {
    return res.status(422).json({ success: false, error: 'Passport photo must not exceed 2MB.' });
  }
  ensureUploadDir();
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const storedName = `htda_pass_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf);
  return res.json({
    success: true,
    file_url: `/api/academy/passport/${storedName}`,
    file_name: storedName,
    message: 'Passport photo uploaded securely.',
  });
});

academyRouter.get('/passport/:filename', (req, res) => {
  const base = path.basename(String(req.params.filename || ''));
  if (!/^htda_pass_[0-9]+_[a-f0-9]+\.(jpg|png|webp)$/.test(base)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const resolved = path.resolve(UPLOAD_DIR, base);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(resolved);
});

function handleVerify(req: any, res: any) {
  const rawId =
    req.params.student_id ||
    (req.params.p1 && req.params.p2 && req.params.p3 ? `${req.params.p1}/${req.params.p2}/${req.params.p3}` : '') ||
    String(req.query.student_id || '');
  const sid = decodeURIComponent(String(rawId)).trim().toUpperCase();
  if (!sid) return res.status(422).json({ success: false, error: 'Student ID is required for verification.' });

  const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && String(s.student_id).toUpperCase() === sid);
  const course = stu ? (db.data.academy_courses || []).find((c: any) => c.id === stu.course_id) : null;
  const s = db.data.academy_settings;
  const academy = {
    name: s.academy_name,
    email: s.email || s.contact_email || 'hambak901@gmail.com',
    address: s.address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
    business_reg_number: s.business_reg_number || 'BN 9284726',
    motto: s.motto || 'Where Technology Meets Services',
  };

  if (!stu) {
    return res.json({
      success: true,
      valid: false,
      student_id: sid,
      message: 'No registered student record matches this ID in the official Academy registry.',
      academy,
    });
  }
  return res.json({
    success: true,
    valid: true,
    student_id: stu.student_id,
    full_name: stu.full_name,
    course_title: course?.title || stu.course_title || 'Digital Training Program',
    course_duration: course?.duration || stu.course_duration || '',
    academic_status: stu.academic_status,
    enrollment_date: stu.enrollment_date,
    completion_date: stu.completion_date || null,
    id_card_issued_at: stu.id_card_issued_at || null,
    academy,
  });
}

academyRouter.get('/verify', handleVerify);
academyRouter.get('/verify/:student_id', handleVerify);
academyRouter.get('/verify/:p1/:p2/:p3', handleVerify);

// -----------------------------------------------------------------------------
// CUSTOMER PORTAL ROUTES (/api/customer/academy*)
// -----------------------------------------------------------------------------

customerAcademyRouter.get('/academy', (req, res) => {
  const user = requireAuthUser(req, res);
  if (!user) return;
  if (user.email_verified !== false) {
    reconcileUserAcademyLinksInMemory(user.id, user.email, true);
  }

  const courses = (db.data.academy_courses || []).filter((c: any) => c.status !== 'draft');
  const myApps = (db.data.academy_applications || [])
    .filter((a: any) => !a.deleted_at && userOwnsApp(user, a))
    .map((a: any) => {
      const status = normalizeStatus(a.status);
      const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && s.application_id === a.id) || null;
      const course = (db.data.academy_courses || []).find((c: any) => c.id === a.course_id);
      return {
        ...a,
        status,
        course_title: course?.title || a.course_title,
        course_duration: course?.duration || a.course_duration,
        student: stu,
        timeline: getTimeline(a.id),
        enrollment_requirements: status === 'approved' ? evaluateEnrollmentRequirements(a) : undefined,
      };
    });

  const myStudents = (db.data.academy_students || []).filter(
    (s: any) => !s.deleted_at && (s.user_id === user.id || (user.email_verified !== false && String(s.email).toLowerCase() === String(user.email).toLowerCase()))
  );

  const hasActiveStudent = myStudents.some((s: any) => ['active', 'graduated'].includes(String(s.academic_status))) || user.role === 'student';
  const hasApprovedApp = myApps.some((a: any) => a.status === 'approved');
  const hasActiveApp = myApps.some((a: any) => ['pending', 'under_review', 'information_requested'].includes(a.status));
  const hasWithdrawn = myApps.some((a: any) => a.status === 'withdrawn') || myStudents.some((s: any) => s.academic_status === 'withdrawn');

  const accessLevel = hasActiveStudent
    ? 'enrolled'
    : hasApprovedApp
      ? 'approved'
      : hasActiveApp
        ? 'applicant'
        : hasWithdrawn
          ? 'withdrawn'
          : 'none';

  res.json({
    success: true,
    courses,
    settings: db.data.academy_settings,
    applications: myApps,
    students: myStudents,
    access: {
      access_level: accessLevel,
      can_access_student_hub: hasActiveStudent,
      has_active_enrollment: hasActiveStudent,
      has_approved_awaiting_enrollment: hasApprovedApp && !hasActiveStudent,
    },
  });
});

customerAcademyRouter.post('/academy/apply', (req, res) => {
  const user = requireAuthUser(req, res);
  if (!user) return;
  processApplicationSubmission(req, res, user);
});

customerAcademyRouter.post('/academy/applications/:id/respond', (req, res) => {
  const user = requireAuthUser(req, res);
  if (!user) return;
  const app = (db.data.academy_applications || []).find((a: any) => !a.deleted_at && a.id === req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Admission application not found.' });
  if (!userOwnsApp(user, app)) return res.status(403).json({ success: false, error: 'Unauthorized' });
  handleResubmit(req, res, app, user);
});

function executeEnrollment(res: any, app: any, actor: User, allowException: boolean, exceptionReason?: string) {
  const current = normalizeStatus(app.status);
  if (!canTransition(current, 'enrolled')) {
    return res.status(409).json({ success: false, error: `Cannot complete enrollment from status (${current}). Application must be approved first.` });
  }
  const evalRes = evaluateEnrollmentRequirements(app);
  let exceptionUsed = false;
  if (!evalRes.met) {
    if (allowException) {
      if (!exceptionReason || exceptionReason.trim().length < 8) {
        return res.status(422).json({ success: false, error: 'Enrollment exception requires an explicit administrative reason (at least 8 characters).' });
      }
      exceptionUsed = true;
    } else {
      return res.status(422).json({
        success: false,
        code: 'ENROLLMENT_REQUIREMENTS_NOT_MET',
        error: 'Enrollment requirements are not yet satisfied: ' + evalRes.missing.join(' '),
        errors: { missing_requirements: evalRes.missing },
      });
    }
  }

  app.status = 'enrolled';
  app.enrollment_requirements_met = evalRes.met;
  app.enrollment_exception = exceptionUsed;
  app.enrollment_exception_reason = exceptionUsed ? exceptionReason?.trim() : null;
  app.enrollment_exception_by = exceptionUsed ? actor.id : null;
  app.enrolled_at = new Date().toISOString();
  app.enrolled_by = actor.id;
  app.updated_at = new Date().toISOString();

  if (!db.data.academy_students) db.data.academy_students = [];
  let stu = db.data.academy_students.find((s: any) => !s.deleted_at && s.application_id === app.id);
  if (stu) {
    stu.academic_status = 'active';
    stu.withdrawn_at = null;
    stu.withdrawal_reason = null;
    stu.user_id = stu.user_id || app.user_id || null;
  } else {
    const course = (db.data.academy_courses || []).find((c: any) => c.id === app.course_id);
    const sid = generateStudentId(db.data.academy_settings?.student_id_prefix || 'HTDA');
    stu = {
      id: crypto.randomUUID(),
      student_id: sid,
      application_id: app.id,
      user_id: app.user_id || null,
      course_id: app.course_id,
      course_title: course?.title || app.course_title,
      course_duration: course?.duration || app.course_duration,
      full_name: app.full_name,
      email: app.email,
      phone: app.phone,
      photo_url: app.passport_url || null,
      enrollment_date: new Date().toISOString().slice(0, 10),
      academic_status: 'active',
      id_card_issued_at: new Date().toISOString(),
      qr_token: crypto.randomBytes(16).toString('hex'),
      created_at: new Date().toISOString(),
    };
    db.data.academy_students.unshift(stu);
  }

  if (app.user_id) {
    const u = db.findUserById(app.user_id);
    if (u && String(u.role).toLowerCase() === 'customer') {
      db.updateUser(u.id, { role: 'student', assigned_dashboard: 'student' } as any);
    }
  }

  saveDatabase();
  recordEvent(
    app.id,
    current,
    'enrolled',
    exceptionUsed ? 'enrolled_with_exception' : 'enrolled',
    actor,
    exceptionUsed ? `Enrolled with exception override: ${exceptionReason}` : `Official enrollment completed. Student ID: ${stu.student_id}.`,
    { student_id: stu.student_id, exception_used: exceptionUsed }
  );

  return res.json({
    success: true,
    status: 'enrolled',
    student: stu,
    timeline: getTimeline(app.id),
    message: `Enrollment completed! Official Student ID ${stu.student_id} issued.`,
  });
}

function executeWithdraw(res: any, app: any, reason: string, actor: User) {
  const current = normalizeStatus(app.status);
  if (!canTransition(current, 'withdrawn')) {
    return res.status(409).json({ success: false, error: `Application cannot be withdrawn from current status (${current}).` });
  }
  const cleanReason = String(reason || '').trim() || 'Withdrawn upon request.';
  app.status = 'withdrawn';
  app.withdrawn_at = new Date().toISOString();
  app.withdrawal_reason = cleanReason;
  app.updated_at = new Date().toISOString();

  const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && s.application_id === app.id);
  if (stu) {
    stu.academic_status = 'withdrawn';
    stu.withdrawn_at = new Date().toISOString();
    stu.withdrawal_reason = cleanReason;
  }

  if (app.user_id) {
    const otherActive = (db.data.academy_students || []).some(
      (s: any) => !s.deleted_at && s.user_id === app.user_id && s.academic_status === 'active'
    );
    const u = db.findUserById(app.user_id);
    if (!otherActive && u && String(u.role).toLowerCase() === 'student') {
      db.updateUser(u.id, { role: 'customer', assigned_dashboard: 'customer' } as any);
    }
  }

  saveDatabase();
  recordEvent(app.id, current, 'withdrawn', 'withdrawn', actor, cleanReason);

  return res.json({
    success: true,
    status: 'withdrawn',
    timeline: getTimeline(app.id),
    message: 'Application / enrollment marked as withdrawn.',
  });
}

customerAcademyRouter.post('/academy/applications/:id/enroll', (req, res) => {
  const user = requireAuthUser(req, res);
  if (!user) return;
  const app = (db.data.academy_applications || []).find((a: any) => !a.deleted_at && a.id === req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Admission application not found.' });
  if (!userOwnsApp(user, app)) return res.status(403).json({ success: false, error: 'Unauthorized' });
  if (!app.user_id && user.email_verified !== false) {
    app.user_id = user.id;
    app.account_link_status = 'linked';
    saveDatabase();
  }
  return executeEnrollment(res, app, user, false);
});

customerAcademyRouter.post('/academy/applications/:id/withdraw', (req, res) => {
  const user = requireAuthUser(req, res);
  if (!user) return;
  const app = (db.data.academy_applications || []).find((a: any) => !a.deleted_at && a.id === req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Admission application not found.' });
  if (!userOwnsApp(user, app)) return res.status(403).json({ success: false, error: 'Unauthorized' });
  return executeWithdraw(res, app, String(req.body?.reason || 'Withdrawn by applicant'), user);
});

// -----------------------------------------------------------------------------
// ADMIN ROUTES (/api/admin/academy*)
// -----------------------------------------------------------------------------

adminAcademyRouter.get('/academy', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const apps = (db.data.academy_applications || [])
    .filter((a: any) => !a.deleted_at)
    .map((a: any) => {
      const status = normalizeStatus(a.status);
      const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && s.application_id === a.id) || null;
      const linkedUser = a.user_id ? db.findUserById(a.user_id) : null;
      const course = (db.data.academy_courses || []).find((c: any) => c.id === a.course_id);
      return {
        ...a,
        status,
        course_title: course?.title || a.course_title,
        course_duration: course?.duration || a.course_duration,
        student: stu,
        student_id: stu?.student_id || null,
        academic_status: stu?.academic_status || null,
        linked_user_role: linkedUser?.role || null,
        linked_user_verified: linkedUser ? Boolean(linkedUser.email_verified !== false) : null,
        enrollment_requirements: status === 'approved' ? evaluateEnrollmentRequirements(a) : undefined,
      };
    });
  const students = (db.data.academy_students || []).filter((s: any) => !s.deleted_at);
  res.json({
    success: true,
    courses: db.data.academy_courses || [],
    settings: db.data.academy_settings,
    applications: apps,
    students,
  });
});

adminAcademyRouter.get('/academy/settings', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  res.json({ success: true, settings: db.data.academy_settings });
});

adminAcademyRouter.put('/academy/settings', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const updated = db.updateAcademySettings(req.body || {});
  res.json({ success: true, message: 'Academy settings updated', settings: updated });
});

adminAcademyRouter.post('/academy/course', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const created = db.addAcademyCourse(req.body || {});
  res.json({ success: true, message: 'Course created', course: created });
});

adminAcademyRouter.put('/academy/course/:id', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const updated = db.updateAcademyCourse(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Course not found' });
  res.json({ success: true, message: 'Course updated', course: updated });
});

adminAcademyRouter.delete('/academy/course/:id', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const ok = db.deleteAcademyCourse(req.params.id);
  res.json({ success: ok, message: ok ? 'Course removed' : 'Not found' });
});

adminAcademyRouter.get('/academy/applications', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const apps = (db.data.academy_applications || [])
    .filter((a: any) => !a.deleted_at)
    .map((a: any) => {
      const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && s.application_id === a.id) || null;
      return {
        ...a,
        status: normalizeStatus(a.status),
        student: stu,
        student_id: stu?.student_id || null,
        academic_status: stu?.academic_status || null,
      };
    });
  res.json({ success: true, applications: apps });
});

adminAcademyRouter.get('/academy/applications/:id', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const app = (db.data.academy_applications || []).find((a: any) => !a.deleted_at && a.id === req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Admission application not found.' });
  const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && s.application_id === app.id) || null;
  res.json({
    success: true,
    application: { ...app, status: normalizeStatus(app.status) },
    student: stu,
    timeline: getTimeline(app.id),
    enrollment_requirements: evaluateEnrollmentRequirements(app),
  });
});

adminAcademyRouter.post('/academy/applications/:id/review', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const app = (db.data.academy_applications || []).find((a: any) => !a.deleted_at && a.id === req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Admission application not found.' });

  const action = String(req.body?.action || '').trim().toLowerCase();
  const adminNotes = String(req.body?.admin_notes || '').trim();
  const infoMsg = String(req.body?.info_request_message || '').trim();
  const currentStatus = normalizeStatus(app.status);

  if (action === 'reconcile') {
    const u = db.findUserByEmail(app.email);
    if (!u) {
      return res.json({ success: true, linked: false, message: 'No user account found yet for this email.' });
    }
    const r = reconcileUserAcademyLinksInMemory(u.id, u.email, u.email_verified !== false);
    return res.json({ success: true, linked: true, reconciled: r, message: 'Application linked to verified account.' });
  }

  if (action === 'start_review') {
    if (!canTransition(currentStatus, 'under_review')) {
      return res.status(409).json({ success: false, error: `Cannot move application from ${currentStatus} to under_review.` });
    }
    app.status = 'under_review';
    app.admin_notes = adminNotes || app.admin_notes;
    app.reviewed_by = admin.full_name;
    app.reviewed_at = new Date().toISOString();
    saveDatabase();
    recordEvent(app.id, currentStatus, 'under_review', 'review_started', admin, adminNotes || 'Admissions review started.');
    return res.json({ success: true, status: 'under_review', timeline: getTimeline(app.id), message: 'Application marked as Under Review.' });
  }

  if (action === 'request_info') {
    if (!infoMsg) return res.status(422).json({ success: false, error: 'Please specify what additional information is required.' });
    if (!canTransition(currentStatus, 'information_requested')) {
      return res.status(409).json({ success: false, error: `Cannot request info from ${currentStatus}.` });
    }
    app.status = 'information_requested';
    app.info_request_message = infoMsg;
    app.admin_notes = adminNotes || app.admin_notes;
    app.reviewed_by = admin.full_name;
    app.reviewed_at = new Date().toISOString();
    saveDatabase();
    recordEvent(app.id, currentStatus, 'information_requested', 'information_requested', admin, infoMsg);
    return res.json({ success: true, status: 'information_requested', timeline: getTimeline(app.id), message: 'Additional information requested.' });
  }

  if (action === 'approve') {
    if (!canTransition(currentStatus, 'approved')) {
      return res.status(409).json({ success: false, error: `Cannot approve application from ${currentStatus}.` });
    }
    // Phase 1 invariant: approve stops strictly at "approved" and does NOT auto-enroll!
    app.status = 'approved';
    app.admin_notes = adminNotes || app.admin_notes;
    app.reviewed_by = admin.full_name;
    app.reviewed_at = new Date().toISOString();
    saveDatabase();
    recordEvent(app.id, currentStatus, 'approved', 'admission_approved', admin, adminNotes || 'Admission approved (pending enrollment completion).');
    return res.json({ success: true, status: 'approved', timeline: getTimeline(app.id), message: 'Admission approved. Enrollment remains gated until completion.' });
  }

  if (action === 'enroll') {
    return executeEnrollment(res, app, admin, Boolean(req.body?.approve_exception), String(req.body?.exception_reason || ''));
  }

  if (action === 'reject') {
    if (!canTransition(currentStatus, 'rejected')) {
      return res.status(409).json({ success: false, error: `Cannot reject application from ${currentStatus}.` });
    }
    app.status = 'rejected';
    app.admin_notes = adminNotes || app.admin_notes;
    app.reviewed_by = admin.full_name;
    app.reviewed_at = new Date().toISOString();
    saveDatabase();
    recordEvent(app.id, currentStatus, 'rejected', 'rejected', admin, adminNotes || 'Application rejected.');
    return res.json({ success: true, status: 'rejected', timeline: getTimeline(app.id), message: 'Application marked as rejected.' });
  }

  if (action === 'withdraw') {
    return executeWithdraw(res, app, String(req.body?.withdrawal_reason || adminNotes || 'Withdrawn by admissions administrator.'), admin);
  }

  return res.status(422).json({ success: false, error: 'Invalid review action specified.' });
});

adminAcademyRouter.delete('/academy/applications/:id', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const app = (db.data.academy_applications || []).find((a: any) => a.id === req.params.id);
  if (!app) return res.status(404).json({ success: false, error: 'Not found' });
  const stu = (db.data.academy_students || []).find((s: any) => s.application_id === app.id);
  if (stu && ['HTDA/2026/0001', 'HTDA/2026/0002'].includes(String(stu.student_id).toUpperCase())) {
    return res.status(403).json({ success: false, error: `Protected production student record ${stu.student_id} cannot be deleted.` });
  }
  app.deleted_at = new Date().toISOString();
  if (stu) stu.deleted_at = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, message: 'Academy application archived safely.' });
});

adminAcademyRouter.get('/academy/students', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  res.json({ success: true, students: (db.data.academy_students || []).filter((s: any) => !s.deleted_at) });
});

adminAcademyRouter.put('/academy/students/:id', (req, res) => {
  const admin = requireAcademyAdmin(req, res);
  if (!admin) return;
  const stu = (db.data.academy_students || []).find((s: any) => !s.deleted_at && s.id === req.params.id);
  if (!stu) return res.status(404).json({ success: false, error: 'Student not found.' });
  const nextStatus = String(req.body?.academic_status || stu.academic_status);
  if (!['active', 'graduated', 'suspended', 'withdrawn'].includes(nextStatus)) {
    return res.status(422).json({ success: false, error: 'Invalid academic status.' });
  }
  stu.academic_status = nextStatus;
  if (req.body?.course_id) stu.course_id = req.body.course_id;
  if (req.body?.completion_date !== undefined) stu.completion_date = req.body.completion_date || null;
  if (nextStatus === 'withdrawn') {
    stu.withdrawn_at = stu.withdrawn_at || new Date().toISOString();
    const app = (db.data.academy_applications || []).find((a: any) => a.id === stu.application_id);
    if (app && normalizeStatus(app.status) === 'enrolled') {
      app.status = 'withdrawn';
      recordEvent(app.id, 'enrolled', 'withdrawn', 'student_withdrawn', admin, 'Student status changed to withdrawn.');
    }
  }
  saveDatabase();
  res.json({ success: true, student: stu, message: 'Student academic record updated.' });
});
