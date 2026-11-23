<?php
/**
 * @file AcademyController.php
 * HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY Controller (Phase 1)
 * Handles public course directory, privacy-preserving application & invitation activation,
 * canonical admission state-machine workflow, requirement-gated enrollment,
 * audit timeline events, student portal linking, and public QR verification.
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\SchemaSync;
use HambakTech\Core\Security;
use HambakTech\Services\AcademyService;
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Services\ReferralEngineService;
use Throwable;

class AcademyController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
        SchemaSync::syncAcademyPhase1Schema($this->db);
    }

    // -------------------------------------------------------------------------
    // PUBLIC ENDPOINTS
    // -------------------------------------------------------------------------

    /**
     * GET /api/academy/public
     */
    public function publicOverview(Request $request): void
    {
        AcademyService::ensureSeeded($this->db);
        $courses = $this->db->fetchAll(
            'SELECT id, title, category, level, duration, modules_count, price, description, curriculum_outline,
                    is_available, admission_start_date, admission_end_date, display_order, status
             FROM academy_courses
             WHERE status != "draft"
             ORDER BY display_order ASC, title ASC'
        );
        $courses = array_map([AcademyService::class, 'normalizeCourse'], $courses);
        $settings = AcademyService::getSettings($this->db);

        Response::success([
            'courses' => $courses,
            'settings' => $settings,
        ]);
    }

    /**
     * POST /api/academy/apply (Public visitor or authenticated user)
     */
    public function apply(Request $request): void
    {
        $user = Auth::user($request);
        $this->processApplication($request, $user);
    }

    /**
     * GET /api/academy/application-status?ref=...&email=...
     * Returns canonical status, audit timeline, and real linked student record ONLY if enrolled.
     */
    public function applicationStatus(Request $request): void
    {
        $ref = strtoupper(trim((string)$request->query('ref', '')));
        $email = strtolower(trim((string)$request->query('email', '')));

        if ($ref === '' || $email === '') {
            Response::error('Please provide both your Application Reference and Email Address.', 422);
        }

        $app = $this->db->fetchOne(
            'SELECT a.id, a.application_ref, a.course_id, a.full_name, a.email, a.phone,
                    a.date_of_birth, a.age_at_submission, a.gender, a.address, a.state, a.lga,
                    a.qualification, a.study_mode, a.preferred_schedule, a.passport_url,
                    a.status, a.admin_notes, a.info_request_message, a.applicant_response,
                    a.applicant_responded_at, a.resubmission_count, a.enrollment_requirements_met,
                    a.enrollment_exception, a.enrolled_at, a.withdrawn_at, a.withdrawal_reason,
                    a.created_at, a.reviewed_at, a.updated_at,
                    c.title AS course_title, c.duration AS course_duration, c.category AS course_category,
                    s.id AS linked_student_row_id, s.student_id, s.academic_status, s.enrollment_date,
                    s.completion_date, s.id_card_issued_at, s.photo_url AS student_photo_url, s.qr_token
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             LEFT JOIN academy_students s ON s.application_id = a.id AND s.deleted_at IS NULL
             WHERE UPPER(a.application_ref) = :ref
               AND LOWER(a.email) = :email
               AND a.deleted_at IS NULL
             LIMIT 1',
            ['ref' => $ref, 'email' => $email]
        );

        if (!$app) {
            Response::error('No matching admission application was found for that reference and email.', 404);
        }

        $app['status'] = AcademyService::normalizeApplicationStatus((string)$app['status']);
        $studentRecord = $this->buildRealStudentPayload($app);
        unset($app['linked_student_row_id'], $app['student_photo_url'], $app['qr_token']);

        // Only issue a scoped resubmission token when status requires applicant response
        $resubmitToken = null;
        if ($app['status'] === AcademyService::STATUS_INFO_REQUESTED) {
            $resubmitToken = bin2hex(random_bytes(24));
            try {
                $this->db->execute(
                    'UPDATE academy_applications
                     SET resubmit_token_hash = :th, resubmit_token_expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY)
                     WHERE id = :id',
                    ['th' => hash('sha256', $resubmitToken), 'id' => $app['id']]
                );
            } catch (Throwable) {
                $resubmitToken = null;
            }
        }

        $timeline = AcademyService::getApplicationTimeline($this->db, (string)$app['id']);

        Response::success([
            'application' => $app,
            'student' => $studentRecord,
            'timeline' => $timeline,
            'resubmit_token' => $resubmitToken,
        ]);
    }

    /**
     * GET /api/academy/invitations/validate?token=...
     * Public validation for single-use account activation invitation links.
     */
    public function validateInvitation(Request $request): void
    {
        $rawToken = trim((string)$request->query('token', ''));
        if ($rawToken === '' || strlen($rawToken) < 24) {
            Response::error('Invalid activation token.', 422);
        }

        $inv = $this->db->fetchOne(
            'SELECT i.*, a.application_ref, a.status AS application_status, c.title AS course_title
             FROM academy_account_invitations i
             LEFT JOIN academy_applications a ON a.id = i.application_id
             LEFT JOIN academy_courses c ON c.id = a.course_id
             WHERE i.token_hash = :th
             LIMIT 1',
            ['th' => hash('sha256', $rawToken)]
        );

        if (!$inv) {
            Response::error('This activation link is invalid or does not exist.', 404);
        }

        if ($inv['status'] !== 'pending') {
            Response::error('This activation invitation has already been used or revoked.', 410, ['status' => $inv['status']], 'INVITATION_USED');
        }

        if (strtotime((string)$inv['expires_at']) < time()) {
            $this->db->execute('UPDATE academy_account_invitations SET status = "expired" WHERE id = :id', ['id' => $inv['id']]);
            Response::error('This activation link has expired. Please request a fresh invitation or register with your email.', 410, ['expired' => true], 'INVITATION_EXPIRED');
        }

        $existingUser = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => strtolower((string)$inv['email'])]);

        Response::success([
            'valid' => true,
            'invitation' => [
                'email' => $inv['email'],
                'full_name' => $inv['full_name'],
                'phone' => $inv['phone'],
                'application_ref' => $inv['application_ref'],
                'application_status' => AcademyService::normalizeApplicationStatus((string)($inv['application_status'] ?? 'pending')),
                'course_title' => $inv['course_title'] ?? 'Academy Training Program',
                'expires_at' => $inv['expires_at'],
                'requires_existing_login' => (bool)$existingUser,
            ],
        ]);
    }

    /**
     * POST /api/academy/activate-account
     * Completes visitor account creation via hashed expiring token with applicant-chosen password.
     * Never uses plaintext temporary passwords; automatically reconciles matching academy records.
     */
    public function activateAccount(Request $request): void
    {
        $body = $request->getBody();
        $rawToken = trim((string)($body['token'] ?? ''));
        $password = (string)($body['password'] ?? '');
        $fullNameInput = trim((string)($body['full_name'] ?? ''));
        $phoneInput = trim((string)($body['phone'] ?? ''));

        if ($rawToken === '' || strlen($password) < 8) {
            Response::error('A valid activation token and a password of at least 8 characters are required.', 422);
        }

        $inv = $this->db->fetchOne(
            'SELECT * FROM academy_account_invitations WHERE token_hash = :th LIMIT 1',
            ['th' => hash('sha256', $rawToken)]
        );

        if (!$inv || $inv['status'] !== 'pending') {
            Response::error('This activation link is invalid or has already been used.', 400);
        }

        if (strtotime((string)$inv['expires_at']) < time()) {
            $this->db->execute('UPDATE academy_account_invitations SET status = "expired" WHERE id = :id', ['id' => $inv['id']]);
            Response::error('This activation link has expired.', 400, ['expired' => true], 'INVITATION_EXPIRED');
        }

        $email = strtolower(trim((string)$inv['email']));
        $existingUser = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email]);
        if ($existingUser) {
            Response::error('An account already exists for this email address. Please sign in with your password to automatically link your application.', 409, ['requires_login' => true], 'ACCOUNT_ALREADY_EXISTS');
        }

        $fullName = $fullNameInput !== '' ? $fullNameInput : (string)$inv['full_name'];
        $phone = $phoneInput !== '' ? $phoneInput : (string)($inv['phone'] ?? '');
        $phoneNormalized = ReferralEngineService::normalizePhone($phone);
        $userId = Security::generateUuid();
        $passwordHash = Security::hashPassword($password);
        $referralService = new ReferralEngineService($this->db);
        $referralCode = $referralService->generateUniqueCode();

        $this->db->withTransaction(function (Database $db) use ($userId, $email, $passwordHash, $fullName, $phone, $phoneNormalized, $referralCode, $inv) {
            try {
                $db->execute(
                    'INSERT INTO users (id, email, password_hash, full_name, phone_number, phone_normalized, role, assigned_dashboard, kyc_status, tier, referral_code, status, email_verified, email_verified_at, email_verification_required, created_at)
                     VALUES (:id, :email, :pass, :name, :phone, :pnorm, "customer", "customer", "unverified", 1, :ref, "active", 1, NOW(), 0, NOW())',
                    [
                        'id' => $userId,
                        'email' => $email,
                        'pass' => $passwordHash,
                        'name' => $fullName,
                        'phone' => $phone,
                        'pnorm' => $phoneNormalized ?: null,
                        'ref' => $referralCode,
                    ]
                );
            } catch (Throwable) {
                $db->execute(
                    'INSERT INTO users (id, email, password_hash, full_name, phone_number, role, assigned_dashboard, kyc_status, tier, referral_code, status, email_verified, email_verified_at, email_verification_required, created_at)
                     VALUES (:id, :email, :pass, :name, :phone, "customer", "customer", "unverified", 1, :ref, "active", 1, NOW(), 0, NOW())',
                    [
                        'id' => $userId,
                        'email' => $email,
                        'pass' => $passwordHash,
                        'name' => $fullName,
                        'phone' => $phone,
                        'ref' => $referralCode,
                    ]
                );
            }

            $db->execute(
                'INSERT INTO user_profiles (user_id, updated_at) VALUES (:uid, NOW()) ON DUPLICATE KEY UPDATE updated_at = NOW()',
                ['uid' => $userId]
            );
            $db->execute(
                'INSERT INTO wallets (id, user_id, balance, currency, status) VALUES (:wid, :uid, 0.00, "NGN", "active")',
                ['wid' => Security::generateUuid(), 'uid' => $userId]
            );

            $db->execute(
                'UPDATE academy_account_invitations SET status = "accepted", used_at = NOW(), created_user_id = :uid WHERE id = :id',
                ['uid' => $userId, 'id' => $inv['id']]
            );
        });

        AcademyService::reconcileUserAcademyLinks($this->db, $userId, $email, true);

        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, :title, :msg, "success", 0, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'title' => 'Portal Account Activated & Application Linked',
                    'msg' => 'Your HAMBAKTECH account is now active and linked to your Academy application.',
                ]
            );
        } catch (Throwable) {
        }

        FootprintService::record(
            'academy',
            'ACADEMY_ACCOUNT_ACTIVATED',
            ['id' => $userId, 'email' => $email, 'full_name' => $fullName],
            'academy_application',
            (string)$inv['application_id'],
            null,
            'successful',
            null,
            null,
            [],
            $request->getIp()
        );

        $freshUser = $this->db->fetchOne('SELECT * FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
        $jwtToken = Auth::generateToken($freshUser, $request);
        $safeUser = [
            'id' => $freshUser['id'],
            'email' => $freshUser['email'],
            'full_name' => $freshUser['full_name'],
            'phone_number' => $freshUser['phone_number'],
            'role' => $freshUser['role'],
            'assigned_dashboard' => $freshUser['assigned_dashboard'],
            'wallet_balance' => 0.0,
            'kyc_status' => $freshUser['kyc_status'],
            'kyc_level' => 1,
            'tier' => 1,
            'email_verified' => true,
            'email_verification_required' => false,
            'status' => $freshUser['status'],
            'referral_code' => $freshUser['referral_code'],
            'permissions' => [],
        ];

        Response::success([
            'user' => $safeUser,
            'token' => $jwtToken,
        ], 'Account activated and Academy application linked successfully.', 201);
    }

    /**
     * POST /api/academy/applications/:id/resubmit
     * Allows an applicant with a valid resubmit_token or verified owner session to respond to information_requested.
     */
    public function resubmitApplication(Request $request, array $params): void
    {
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();
        $user = Auth::user($request);

        $app = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title FROM academy_applications a LEFT JOIN academy_courses c ON c.id = a.course_id WHERE a.id = :id AND a.deleted_at IS NULL LIMIT 1',
            ['id' => $id]
        );
        if (!$app) {
            Response::error('Application not found.', 404);
        }

        $authorized = false;
        if ($user && $this->userOwnsApplication($user, $app)) {
            $authorized = true;
        } else {
            $resubmitToken = trim((string)($body['resubmit_token'] ?? ''));
            $email = strtolower(trim((string)($body['email'] ?? '')));
            if ($resubmitToken !== '' &&
                !empty($app['resubmit_token_hash']) &&
                hash_equals((string)$app['resubmit_token_hash'], hash('sha256', $resubmitToken)) &&
                (!empty($app['resubmit_token_expires_at']) && strtotime((string)$app['resubmit_token_expires_at']) >= time()) &&
                ($email === '' || $email === strtolower((string)$app['email']))) {
                $authorized = true;
            }
        }

        if (!$authorized) {
            Response::forbidden('Authorization required to resubmit this application.');
        }

        $this->executeApplicantResubmission($app, $body, $user ?: [
            'id' => null,
            'full_name' => $app['full_name'],
            'role' => 'applicant',
        ], $request->getIp());
    }

    /**
     * POST /api/academy/upload-passport
     * Restricted secure passport upload (image/jpeg, image/png, image/webp only, max 2MB).
     * Accessible to authenticated users or valid active resubmit_token holders.
     */
    public function uploadPassport(Request $request): void
    {
        $user = Auth::user($request);
        $resubmitToken = trim((string)($request->input('resubmit_token') ?? $_POST['resubmit_token'] ?? ''));
        $applicationId = trim((string)($request->input('application_id') ?? $_POST['application_id'] ?? ''));

        $authorizedApp = null;
        if (!$user) {
            if ($resubmitToken === '' || $applicationId === '') {
                Response::unauthorized('Please sign in or use an active information-request link to upload a passport photo.');
            }
            $authorizedApp = $this->db->fetchOne(
                'SELECT id, resubmit_token_hash, resubmit_token_expires_at FROM academy_applications WHERE id = :id AND deleted_at IS NULL LIMIT 1',
                ['id' => $applicationId]
            );
            if (
                !$authorizedApp ||
                empty($authorizedApp['resubmit_token_hash']) ||
                !hash_equals((string)$authorizedApp['resubmit_token_hash'], hash('sha256', $resubmitToken)) ||
                strtotime((string)$authorizedApp['resubmit_token_expires_at']) < time()
            ) {
                Response::forbidden('Invalid or expired upload authorization.');
            }
        }

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Valid passport image file is required.', 422);
        }

        $file = $_FILES['file'];
        if ((int)$file['size'] > 2 * 1024 * 1024) {
            Response::error('Passport photo must not exceed 2MB.', 422);
        }

        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        $allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
        if (!in_array($ext, $allowedExts, true)) {
            Response::error('Invalid image format. Allowed: JPG, PNG, WEBP.', 422);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!in_array($mime, $allowedMimes, true)) {
            Response::error('File content validation failed. Only authentic JPEG, PNG, or WEBP images are accepted.', 422);
        }

        $storageDir = dirname(__DIR__) . '/storage/uploads/academy';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
            @file_put_contents($storageDir . '/.htaccess', "Deny from all\n");
        }

        $storedName = 'htda_pass_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
        $destPath = $storageDir . DIRECTORY_SEPARATOR . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Failed to store passport image securely.', 500);
        }

        $fileUrl = '/api/academy/passport/' . $storedName;

        Response::success([
            'file_url' => $fileUrl,
            'file_name' => $storedName,
        ], 'Passport photo uploaded securely.');
    }

    /**
     * GET /api/academy/passport/:filename
     * Safe confined image serving handler.
     */
    public function servePassport(Request $request, array $params): void
    {
        $filename = basename((string)($params['filename'] ?? ''));
        if ($filename === '' || !preg_match('/^htda_pass_[0-9]+_[a-f0-9]+\.(jpg|png|webp)$/', $filename)) {
            Response::notFound('Passport image not found.');
        }

        $baseDir = realpath(dirname(__DIR__) . '/storage/uploads/academy');
        if ($baseDir === false) {
            Response::notFound('Passport storage directory unavailable.');
        }

        $targetPath = realpath($baseDir . DIRECTORY_SEPARATOR . $filename);
        if ($targetPath === false || !str_starts_with($targetPath, $baseDir . DIRECTORY_SEPARATOR) || !is_file($targetPath)) {
            Response::notFound('Passport image not found.');
        }

        $ext = strtolower(pathinfo($targetPath, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($targetPath));
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');
        readfile($targetPath);
        exit;
    }

    /**
     * GET /api/academy/verify/:student_id  or  GET /api/academy/verify?student_id=...
     * Public verification endpoint — exposes ONLY safe verification fields (ZERO PII).
     */
    public function verifyStudent(Request $request, array $params = []): void
    {
        $rawId = (string)($params['student_id'] ?? '');
        if ($rawId === '' && isset($params['p1'], $params['p2'], $params['p3'])) {
            $rawId = $params['p1'] . '/' . $params['p2'] . '/' . $params['p3'];
        }
        if ($rawId === '') {
            $rawId = (string)$request->query('student_id', '');
        }
        $studentId = strtoupper(trim(urldecode($rawId)));

        if ($studentId === '') {
            Response::error('Student ID is required for verification.', 422);
        }

        $student = $this->db->fetchOne(
            'SELECT s.student_id, s.full_name, s.academic_status, s.enrollment_date, s.completion_date,
                    s.id_card_issued_at, c.title AS course_title, c.duration AS course_duration
             FROM academy_students s
             LEFT JOIN academy_courses c ON c.id = s.course_id
             WHERE UPPER(s.student_id) = :sid AND s.deleted_at IS NULL
             LIMIT 1',
            ['sid' => $studentId]
        );

        $settings = AcademyService::getSettings($this->db);

        if (!$student) {
            Response::success([
                'valid' => false,
                'student_id' => $studentId,
                'message' => 'No registered student record matches this ID in the official Academy registry.',
                'academy' => [
                    'name' => $settings['academy_name'],
                    'email' => $settings['email'],
                    'address' => $settings['address'],
                    'business_reg_number' => $settings['business_reg_number'],
                    'motto' => $settings['motto'],
                ],
            ]);
        }

        Response::success([
            'valid' => true,
            'student_id' => $student['student_id'],
            'full_name' => $student['full_name'],
            'course_title' => $student['course_title'] ?? 'Digital Training Program',
            'course_duration' => $student['course_duration'] ?? '',
            'academic_status' => $student['academic_status'],
            'enrollment_date' => $student['enrollment_date'],
            'completion_date' => $student['completion_date'],
            'id_card_issued_at' => $student['id_card_issued_at'],
            'academy' => [
                'name' => $settings['academy_name'],
                'email' => $settings['email'],
                'address' => $settings['address'],
                'business_reg_number' => $settings['business_reg_number'],
                'motto' => $settings['motto'],
            ],
        ]);
    }

    // -------------------------------------------------------------------------
    // AUTHENTICATED CUSTOMER / STUDENT ENDPOINTS
    // -------------------------------------------------------------------------

    /**
     * GET /api/customer/academy
     */
    public function customerAcademy(Request $request): void
    {
        $user = Auth::requireAuth($request);
        AcademyService::ensureSeeded($this->db);

        // Reconcile unlinked records when customer has a verified email
        if (!empty($user['email_verified'])) {
            AcademyService::reconcileUserAcademyLinks($this->db, (string)$user['id'], (string)$user['email'], true);
        }

        $courses = $this->db->fetchAll(
            'SELECT * FROM academy_courses WHERE status != "draft" ORDER BY display_order ASC, title ASC'
        );
        $courses = array_map([AcademyService::class, 'normalizeCourse'], $courses);
        $settings = AcademyService::getSettings($this->db);

        $myApplications = [];
        try {
            $myApplications = $this->db->fetchAll(
                'SELECT a.*, c.title AS course_title, c.duration AS course_duration, c.category AS course_category, c.is_available AS course_is_available
                 FROM academy_applications a
                 LEFT JOIN academy_courses c ON c.id = a.course_id
                 WHERE (a.user_id = :uid OR (:ev = 1 AND LOWER(a.email) = :email))
                   AND a.deleted_at IS NULL
                 ORDER BY a.created_at DESC',
                [
                    'uid' => $user['id'],
                    'ev' => !empty($user['email_verified']) ? 1 : 0,
                    'email' => strtolower((string)$user['email']),
                ]
            );
        } catch (Throwable) {
        }

        $myStudents = [];
        try {
            $myStudents = $this->db->fetchAll(
                'SELECT s.*, c.title AS course_title, c.duration AS course_duration, c.category AS course_category
                 FROM academy_students s
                 LEFT JOIN academy_courses c ON c.id = s.course_id
                 WHERE (s.user_id = :uid OR (:ev = 1 AND LOWER(s.email) = :email))
                   AND s.deleted_at IS NULL
                 ORDER BY s.created_at DESC',
                [
                    'uid' => $user['id'],
                    'ev' => !empty($user['email_verified']) ? 1 : 0,
                    'email' => strtolower((string)$user['email']),
                ]
            );
        } catch (Throwable) {
        }

        $studentsByApp = [];
        foreach ($myStudents as $st) {
            if (!empty($st['application_id'])) {
                $studentsByApp[(string)$st['application_id']] = $st;
            }
        }

        foreach ($myApplications as &$app) {
            $app['status'] = AcademyService::normalizeApplicationStatus((string)$app['status']);
            $app['timeline'] = AcademyService::getApplicationTimeline($this->db, (string)$app['id']);
            $app['student'] = $studentsByApp[(string)$app['id']] ?? null;
            if ($app['status'] === AcademyService::STATUS_APPROVED) {
                $courseRow = !empty($app['course_id']) ? ['id' => $app['course_id'], 'is_available' => (bool)($app['course_is_available'] ?? true)] : null;
                $reqEval = AcademyService::evaluateEnrollmentRequirements($this->db, $app, $courseRow);
                $app['enrollment_requirements'] = [
                    'met' => $reqEval['met'],
                    'missing' => $reqEval['missing'],
                ];
            }
        }
        unset($app);

        $accessSummary = AcademyService::computeCustomerAccessSummary($user, $myApplications, $myStudents);

        Response::success([
            'courses' => $courses,
            'settings' => $settings,
            'applications' => $myApplications,
            'students' => $myStudents,
            'access' => $accessSummary,
        ]);
    }

    /**
     * POST /api/customer/academy/apply
     */
    public function customerApply(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $this->processApplication($request, $user);
    }

    /**
     * POST /api/customer/academy/applications/:id/respond
     */
    public function customerRespondApplication(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));

        $app = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title FROM academy_applications a LEFT JOIN academy_courses c ON c.id = a.course_id WHERE a.id = :id AND a.deleted_at IS NULL LIMIT 1',
            ['id' => $id]
        );
        if (!$app) {
            Response::error('Admission application not found.', 404);
        }
        if (!$this->userOwnsApplication($user, $app)) {
            Response::forbidden('You are not authorized to modify this application.');
        }

        $this->executeApplicantResubmission($app, $request->getBody(), $user, $request->getIp());
    }

    /**
     * POST /api/customer/academy/applications/:id/enroll
     * Completes Phase 1 enrollment ONLY if application is approved and all prerequisites are met.
     */
    public function customerCompleteEnrollment(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));

        $app = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title, c.is_available AS course_is_available
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             WHERE a.id = :id AND a.deleted_at IS NULL LIMIT 1',
            ['id' => $id]
        );
        if (!$app) {
            Response::error('Admission application not found.', 404);
        }
        if (!$this->userOwnsApplication($user, $app)) {
            Response::forbidden('You are not authorized to complete enrollment for this application.');
        }

        // Bind unlinked ownership if user's email is verified
        if (empty($app['user_id']) && !empty($user['email_verified'])) {
            $this->db->execute('UPDATE academy_applications SET user_id = :uid, account_link_status = "linked" WHERE id = :id', ['uid' => $user['id'], 'id' => $app['id']]);
            $app['user_id'] = $user['id'];
        }

        $result = $this->executeEnrollmentTransition($app, $user, false, null, $request->getIp());
        Response::success($result, "Enrollment completed! Your official Student ID is {$result['student']['student_id']}.");
    }

    /**
     * POST /api/customer/academy/applications/:id/withdraw
     */
    public function customerWithdrawApplication(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $reason = trim((string)$request->input('reason', 'Withdrawn by applicant'));

        $app = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title FROM academy_applications a LEFT JOIN academy_courses c ON c.id = a.course_id WHERE a.id = :id AND a.deleted_at IS NULL LIMIT 1',
            ['id' => $id]
        );
        if (!$app) {
            Response::error('Admission application not found.', 404);
        }
        if (!$this->userOwnsApplication($user, $app)) {
            Response::forbidden('You are not authorized to withdraw this application.');
        }

        $this->executeWithdrawal($app, $reason, $user, $request->getIp());
        Response::success(['status' => AcademyService::STATUS_WITHDRAWN], 'Application withdrawn successfully.');
    }

    /**
     * POST /api/customer/academy/upload-passport
     */
    public function customerUploadPassport(Request $request): void
    {
        Auth::requireAuth($request);
        $this->uploadPassport($request);
    }

    // -------------------------------------------------------------------------
    // SHARED APPLICATION & WORKFLOW HELPERS
    // -------------------------------------------------------------------------

    private function userOwnsApplication(array $user, array $app): bool
    {
        if (!empty($app['user_id']) && (string)$app['user_id'] === (string)$user['id']) {
            return true;
        }
        return !empty($user['email_verified']) && strtolower((string)$user['email']) === strtolower((string)$app['email']);
    }

    private function buildRealStudentPayload(array $appRow): ?array
    {
        $sid = trim((string)($appRow['student_id'] ?? ''));
        if ($sid === '' || empty($appRow['linked_student_row_id'])) {
            return null;
        }

        return [
            'id' => $appRow['linked_student_row_id'],
            'student_id' => $sid,
            'application_id' => $appRow['id'],
            'course_id' => $appRow['course_id'],
            'course_title' => $appRow['course_title'] ?? 'Digital Training Program',
            'course_duration' => $appRow['course_duration'] ?? '',
            'course_category' => $appRow['course_category'] ?? '',
            'full_name' => $appRow['full_name'],
            'email' => $appRow['email'],
            'phone' => $appRow['phone'] ?? '',
            'photo_url' => $appRow['student_photo_url'] ?: ($appRow['passport_url'] ?? null),
            'academic_status' => $appRow['academic_status'] ?? 'active',
            'enrollment_date' => $appRow['enrollment_date'] ?? $appRow['enrolled_at'] ?? $appRow['created_at'],
            'completion_date' => $appRow['completion_date'] ?? null,
            'id_card_issued_at' => $appRow['id_card_issued_at'] ?? null,
            'qr_token' => $appRow['qr_token'] ?? null,
        ];
    }

    private function processApplication(Request $request, ?array $user = null): void
    {
        AcademyService::ensureSeeded($this->db);
        $settings = AcademyService::getSettings($this->db);

        if (empty($settings['admission_open']) && empty($settings['enrollment_open'])) {
            Response::error('Admissions are currently closed by the Academy administration.', 422);
        }

        $body = $request->getBody();
        $courseId = trim((string)($body['course_id'] ?? ''));
        $fullName = trim((string)($body['full_name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? ($user['email'] ?? ''))));
        $phone = trim((string)($body['phone'] ?? ''));
        $dob = trim((string)($body['date_of_birth'] ?? ''));
        $gender = trim((string)($body['gender'] ?? ''));
        $address = trim((string)($body['address'] ?? ''));
        $state = trim((string)($body['state'] ?? ''));
        $lga = trim((string)($body['lga'] ?? ''));
        $qualification = trim((string)($body['qualification'] ?? ''));
        $studyMode = trim((string)($body['study_mode'] ?? 'physical'));
        $preferredSchedule = trim((string)($body['preferred_schedule'] ?? 'weekday'));

        $guardianName = trim((string)($body['guardian_name'] ?? ''));
        $guardianPhone = trim((string)($body['guardian_phone'] ?? ''));
        $guardianAddress = trim((string)($body['guardian_address'] ?? ''));
        $guardianRelationship = trim((string)($body['guardian_relationship'] ?? ''));

        $emergencyName = trim((string)($body['emergency_contact_name'] ?? ''));
        $emergencyPhone = trim((string)($body['emergency_contact_phone'] ?? ''));
        $passportUrl = trim((string)($body['passport_url'] ?? ''));

        if (
            $courseId === '' || $fullName === '' || $email === '' || $phone === '' ||
            $dob === '' || $gender === '' || $address === '' || $state === '' || $lga === ''
        ) {
            Response::error('Please complete all required applicant personal, contact, and course fields.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Please enter a valid email address.', 422);
        }

        $course = $this->db->fetchOne('SELECT * FROM academy_courses WHERE id = :id LIMIT 1', ['id' => $courseId]);
        if (!$course) {
            Response::error('Selected course was not found.', 404);
        }
        if (isset($course['is_available']) && !(bool)$course['is_available']) {
            Response::error('Enrollment for this course is currently paused.', 422);
        }
        if (($course['status'] ?? 'draft') === 'draft') {
            Response::error('Selected course is not open for public admission.', 422);
        }

        $today = date('Y-m-d');
        if (!empty($course['admission_start_date']) && $today < $course['admission_start_date']) {
            Response::error("Admissions for {$course['title']} open on {$course['admission_start_date']}.", 422);
        }
        if (!empty($course['admission_end_date']) && $today > $course['admission_end_date']) {
            Response::error("Admissions window for {$course['title']} closed on {$course['admission_end_date']}.", 422);
        }

        $age = AcademyService::computeAge($dob);
        if ($age < 5 || $age > 110) {
            Response::error('Please enter a valid date of birth.', 422);
        }

        if ($age < 18) {
            if ($guardianName === '' || $guardianPhone === '' || $guardianAddress === '' || $guardianRelationship === '') {
                Response::error(
                    'Applicants under 18 years old must provide complete Parent/Guardian details (full name, phone number, residential address, and relationship).',
                    422
                );
            }
        }

        // Prevent duplicate active applications for the same course
        $duplicate = AcademyService::findActiveDuplicateApplication($this->db, $courseId, $email, $user['id'] ?? null);
        if ($duplicate) {
            $dupStatus = AcademyService::normalizeApplicationStatus((string)$duplicate['status']);
            if ($user) {
                Response::error(
                    "You already have an active application ({$duplicate['application_ref']}, status: {$dupStatus}) for {$course['title']}.",
                    409,
                    [
                        'existing_application_ref' => $duplicate['application_ref'],
                        'existing_status' => $dupStatus,
                    ],
                    'DUPLICATE_ACTIVE_APPLICATION'
                );
            }
            // Anti-enumeration on unauthenticated duplicate check
            Response::error(
                'An active application for this course is already on file for the submitted details. Please check your email or use the Application Status Tracker.',
                409,
                ['duplicate_detected' => true],
                'DUPLICATE_ACTIVE_APPLICATION'
            );
        }

        // Anti-enumeration Account Linking Rule:
        // - Authenticated customer/agent/staff: link immediately & preserve existing role/permissions.
        // - Public visitor: check users by email WITHOUT exposing account existence in public JSON.
        //   Do NOT link unauthenticated visitor directly to an existing user_id before login/email verification.
        $linkedUserId = $user['id'] ?? null;
        $existingEmailUser = null;
        if (!$linkedUserId) {
            try {
                $existingEmailUser = $this->db->fetchOne('SELECT id, full_name FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email]) ?: null;
            } catch (Throwable) {
            }
        }

        $id = Security::generateUuid();
        $appRef = AcademyService::generateApplicationRef($this->db);
        $accountLinkStatus = $linkedUserId ? 'linked' : 'unlinked';

        $this->db->execute(
            'INSERT INTO academy_applications
                (id, application_ref, user_id, course_id, full_name, email, phone, date_of_birth, age_at_submission,
                 gender, address, state, lga, qualification, study_mode, preferred_schedule,
                 guardian_name, guardian_phone, guardian_address, guardian_relationship,
                 emergency_contact_name, emergency_contact_phone, passport_url, status, account_link_status)
             VALUES
                (:id, :ref, :uid, :cid, :name, :email, :phone, :dob, :age,
                 :gender, :addr, :state, :lga, :qual, :mode, :sched,
                 :gname, :gphone, :gaddr, :grel,
                 :ename, :ephone, :purl, "pending", :als)',
            [
                'id' => $id,
                'ref' => $appRef,
                'uid' => $linkedUserId,
                'cid' => $courseId,
                'name' => $fullName,
                'email' => $email,
                'phone' => $phone,
                'dob' => $dob,
                'age' => $age,
                'gender' => $gender,
                'addr' => $address,
                'state' => $state,
                'lga' => $lga,
                'qual' => $qualification ?: null,
                'mode' => $studyMode ?: 'physical',
                'sched' => $preferredSchedule ?: 'weekday',
                'gname' => $guardianName ?: null,
                'gphone' => $guardianPhone ?: null,
                'gaddr' => $guardianAddress ?: null,
                'grel' => $guardianRelationship ?: null,
                'ename' => $emergencyName ?: null,
                'ephone' => $emergencyPhone ?: null,
                'purl' => $passportUrl ?: null,
                'als' => $accountLinkStatus,
            ]
        );

        AcademyService::recordEvent(
            $this->db,
            $id,
            null,
            AcademyService::STATUS_PENDING,
            'submitted',
            $user ?: ['id' => null, 'full_name' => $fullName, 'role' => 'applicant'],
            'Admission application submitted.',
            ['application_ref' => $appRef, 'course_id' => $courseId, 'study_mode' => $studyMode]
        );

        // If visitor has NO existing account, issue hashed 48h invitation email (NO plaintext password)
        if (!$linkedUserId && !$existingEmailUser) {
            AcademyService::issueAccountInvitation($this->db, $id, $email, $fullName, $phone, $appRef, (string)$course['title']);
        } elseif (!$linkedUserId && $existingEmailUser) {
            // Send neutral status email to existing account owner instructing sign-in to link
            try {
                $mail = new MailService();
                $mail->sendAcademyApplicationStatusEmail(
                    $email,
                    $fullName,
                    $appRef,
                    (string)$course['title'],
                    AcademyService::STATUS_PENDING,
                    'We have received your Academy application. Sign in to your existing HAMBAKTECH portal account with this email address to view and link your application automatically.'
                );
            } catch (Throwable) {
            }
        }

        if ($linkedUserId) {
            try {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, :title, :msg, "info", 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $linkedUserId,
                        'title' => 'Academy Admission Application Received',
                        'msg' => "Your application ({$appRef}) for {$course['title']} has been submitted for administrative review.",
                    ]
                );
            } catch (Throwable) {
            }
        }

        FootprintService::record(
            'academy',
            'ACADEMY_APPLICATION_SUBMITTED',
            $user ?: ['id' => null, 'email' => $email, 'full_name' => $fullName],
            'academy_application',
            $id,
            null,
            'pending',
            null,
            null,
            ['application_ref' => $appRef, 'course_id' => $courseId],
            $request->getIp()
        );

        $saved = $this->db->fetchOne(
            'SELECT a.id, a.application_ref, a.course_id, a.full_name, a.email, a.phone, a.study_mode,
                    a.preferred_schedule, a.status, a.created_at, c.title AS course_title, c.duration AS course_duration
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             WHERE a.id = :id',
            ['id' => $id]
        );

        // Strictly avoid leaking whether an unauthenticated email exists in `users`
        $responseMessage = $user
            ? 'Your admission application has been submitted successfully.'
            : 'Your admission application has been submitted! Please check your email inbox for next steps to track your application and manage your portal access.';

        Response::success([
            'application' => $saved,
            'application_ref' => $appRef,
            'account_notice' => $user ? null : 'Check your email inbox for portal account setup or sign-in instructions.',
        ], $responseMessage, 201);
    }

    private function executeApplicantResubmission(array $app, array $body, array $actor, string $ip): void
    {
        $currentStatus = AcademyService::normalizeApplicationStatus((string)$app['status']);
        if ($currentStatus !== AcademyService::STATUS_INFO_REQUESTED) {
            Response::error('Responses can only be submitted when an application has "information_requested" status.', 409);
        }

        $responseMessage = trim((string)($body['applicant_response'] ?? $body['response'] ?? $body['message'] ?? ''));
        if ($responseMessage === '') {
            Response::error('Please provide your response explaining the updated information or documents.', 422);
        }

        $phone = trim((string)($body['phone'] ?? $app['phone']));
        $address = trim((string)($body['address'] ?? $app['address']));
        $state = trim((string)($body['state'] ?? $app['state']));
        $lga = trim((string)($body['lga'] ?? $app['lga']));
        $qualification = trim((string)($body['qualification'] ?? ($app['qualification'] ?? '')));
        $studyMode = trim((string)($body['study_mode'] ?? ($app['study_mode'] ?? 'physical')));
        $preferredSchedule = trim((string)($body['preferred_schedule'] ?? ($app['preferred_schedule'] ?? 'weekday')));
        $guardianName = trim((string)($body['guardian_name'] ?? ($app['guardian_name'] ?? '')));
        $guardianPhone = trim((string)($body['guardian_phone'] ?? ($app['guardian_phone'] ?? '')));
        $guardianAddress = trim((string)($body['guardian_address'] ?? ($app['guardian_address'] ?? '')));
        $guardianRel = trim((string)($body['guardian_relationship'] ?? ($app['guardian_relationship'] ?? '')));
        $passportUrl = trim((string)($body['passport_url'] ?? ($app['passport_url'] ?? '')));

        if ((int)($app['age_at_submission'] ?? 18) < 18) {
            if ($guardianName === '' || $guardianPhone === '' || $guardianAddress === '' || $guardianRel === '') {
                Response::error('Complete Parent/Guardian details remain required for applicants under 18.', 422);
            }
        }

        $nextStatus = AcademyService::STATUS_UNDER_REVIEW;
        $nextCount = (int)($app['resubmission_count'] ?? 0) + 1;

        $this->db->execute(
            'UPDATE academy_applications
             SET status = :st,
                 applicant_response = :resp,
                 applicant_responded_at = NOW(),
                 resubmission_count = :rc,
                 resubmit_token_hash = NULL,
                 resubmit_token_expires_at = NULL,
                 phone = :phone,
                 address = :addr,
                 state = :state,
                 lga = :lga,
                 qualification = :qual,
                 study_mode = :mode,
                 preferred_schedule = :sched,
                 guardian_name = :gname,
                 guardian_phone = :gphone,
                 guardian_address = :gaddr,
                 guardian_relationship = :grel,
                 passport_url = :purl,
                 updated_at = NOW()
             WHERE id = :id',
            [
                'st' => $nextStatus,
                'resp' => $responseMessage,
                'rc' => $nextCount,
                'phone' => $phone,
                'addr' => $address,
                'state' => $state,
                'lga' => $lga,
                'qual' => $qualification ?: null,
                'mode' => $studyMode ?: 'physical',
                'sched' => $preferredSchedule ?: 'weekday',
                'gname' => $guardianName ?: null,
                'gphone' => $guardianPhone ?: null,
                'gaddr' => $guardianAddress ?: null,
                'grel' => $guardianRel ?: null,
                'purl' => $passportUrl ?: null,
                'id' => $app['id'],
            ]
        );

        AcademyService::recordEvent(
            $this->db,
            (string)$app['id'],
            $currentStatus,
            $nextStatus,
            'applicant_resubmitted',
            $actor,
            $responseMessage,
            ['resubmission_count' => $nextCount]
        );

        try {
            $admins = $this->db->fetchAll('SELECT id FROM users WHERE role IN ("superadmin", "admin", "manager") AND status = "active"');
            foreach ($admins as $adm) {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                     VALUES (:id, :uid, :title, :msg, "info", 0, "#admin", NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $adm['id'],
                        'title' => "Academy Applicant Responded: {$app['application_ref']}",
                        'msg' => "{$app['full_name']} submitted requested details for {$app['course_title']} and is ready for review.",
                    ]
                );
            }
        } catch (Throwable) {
        }

        FootprintService::record('academy', 'ACADEMY_APPLICATION_RESUBMITTED', $actor, 'academy_application', (string)$app['id'], null, $nextStatus, null, null, ['resubmission_count' => $nextCount], $ip);

        $updated = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title, c.duration AS course_duration FROM academy_applications a LEFT JOIN academy_courses c ON c.id = a.course_id WHERE a.id = :id',
            ['id' => $app['id']]
        );
        Response::success([
            'application' => $updated,
            'timeline' => AcademyService::getApplicationTimeline($this->db, (string)$app['id']),
        ], 'Your response and updated details have been submitted for admissions review.');
    }

    private function executeEnrollmentTransition(
        array $app,
        array $actor,
        bool $allowException,
        ?string $exceptionReason,
        string $ip
    ): array {
        $currentStatus = AcademyService::normalizeApplicationStatus((string)$app['status']);
        if (!AcademyService::canTransition($currentStatus, AcademyService::STATUS_ENROLLED)) {
            Response::error("Cannot complete enrollment from current status ({$currentStatus}). Application must be approved first.", 409);
        }

        $courseRow = !empty($app['course_id']) ? $this->db->fetchOne('SELECT * FROM academy_courses WHERE id = :id LIMIT 1', ['id' => $app['course_id']]) : null;
        $eval = AcademyService::evaluateEnrollmentRequirements($this->db, $app, $courseRow);

        $usedException = false;
        if (!$eval['met']) {
            if ($allowException) {
                $cleanReason = trim((string)$exceptionReason);
                if (strlen($cleanReason) < 8) {
                    Response::error('Enrollment exception requires an explicit administrative reason (at least 8 characters).', 422);
                }
                $usedException = true;
            } else {
                Response::error(
                    'Enrollment requirements are not yet satisfied: ' . implode(' ', $eval['missing']),
                    422,
                    ['missing_requirements' => $eval['missing']],
                    'ENROLLMENT_REQUIREMENTS_NOT_MET'
                );
            }
        }

        $settings = AcademyService::getSettings($this->db);
        $prefix = (string)($settings['student_id_prefix'] ?? 'HTDA');

        $student = $this->db->withTransaction(function (Database $db) use ($app, $actor, $eval, $usedException, $exceptionReason, $prefix) {
            $db->execute(
                'UPDATE academy_applications
                 SET status = "enrolled",
                     enrollment_requirements_met = :erm,
                     enrollment_exception = :ex,
                     enrollment_exception_reason = :exr,
                     enrollment_exception_by = :exb,
                     enrolled_at = NOW(),
                     enrolled_by = :eby,
                     updated_at = NOW()
                 WHERE id = :id',
                [
                    'erm' => $eval['met'] ? 1 : 0,
                    'ex' => $usedException ? 1 : 0,
                    'exr' => $usedException ? trim((string)$exceptionReason) : null,
                    'exb' => $usedException ? ($actor['id'] ?? null) : null,
                    'eby' => $actor['id'] ?? null,
                    'id' => $app['id'],
                ]
            );

            $existingStudent = $db->fetchOne('SELECT * FROM academy_students WHERE application_id = :aid AND deleted_at IS NULL LIMIT 1', ['aid' => $app['id']]);
            if ($existingStudent) {
                $db->execute(
                    'UPDATE academy_students
                     SET academic_status = "active",
                         user_id = COALESCE(user_id, :uid),
                         withdrawn_at = NULL,
                         withdrawal_reason = NULL,
                         updated_at = NOW()
                     WHERE id = :id',
                    ['uid' => $app['user_id'] ?: null, 'id' => $existingStudent['id']]
                );
                $studentRow = $db->fetchOne('SELECT * FROM academy_students WHERE id = :id', ['id' => $existingStudent['id']]);
            } else {
                $studentId = AcademyService::generateStudentId($db, $prefix);
                $studentRowId = Security::generateUuid();
                $qrToken = bin2hex(random_bytes(16));
                $db->execute(
                    'INSERT INTO academy_students
                        (id, student_id, application_id, user_id, course_id, full_name, email, phone, photo_url,
                         enrollment_date, academic_status, id_card_issued_at, qr_token)
                     VALUES
                        (:id, :sid, :aid, :uid, :cid, :name, :email, :phone, :photo, CURDATE(), "active", NOW(), :qr)',
                    [
                        'id' => $studentRowId,
                        'sid' => $studentId,
                        'aid' => $app['id'],
                        'uid' => $app['user_id'] ?: null,
                        'cid' => $app['course_id'],
                        'name' => $app['full_name'],
                        'email' => $app['email'],
                        'phone' => $app['phone'],
                        'photo' => $app['passport_url'] ?: null,
                        'qr' => $qrToken,
                    ]
                );
                $studentRow = $db->fetchOne('SELECT * FROM academy_students WHERE id = :id', ['id' => $studentRowId]);
            }

            // Safely upgrade ONLY customer -> student (preserve agent, staff, manager, support, admin, superadmin)
            if (!empty($app['user_id'])) {
                $u = $db->fetchOne('SELECT role FROM users WHERE id = :id LIMIT 1', ['id' => $app['user_id']]);
                if ($u && strtolower((string)$u['role']) === 'customer') {
                    $db->execute(
                        'UPDATE users SET role = "student", assigned_dashboard = "student", updated_at = NOW() WHERE id = :id AND role = "customer"',
                        ['id' => $app['user_id']]
                    );
                }
            }

            return $studentRow;
        });

        AcademyService::recordEvent(
            $this->db,
            (string)$app['id'],
            $currentStatus,
            AcademyService::STATUS_ENROLLED,
            $usedException ? 'enrolled_with_exception' : 'enrolled',
            $actor,
            $usedException ? "Enrolled with exception override: {$exceptionReason}" : "Official enrollment completed. Student ID: {$student['student_id']}.",
            ['student_id' => $student['student_id'], 'exception_used' => $usedException]
        );

        if (!empty($app['user_id'])) {
            try {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, :title, :msg, "success", 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $app['user_id'],
                        'title' => 'Academy Enrollment Confirmed',
                        'msg' => "Welcome to {$app['course_title']}! Your official Student ID {$student['student_id']} and Student Hub access are now active.",
                    ]
                );
            } catch (Throwable) {
            }
        }

        try {
            $mail = new MailService();
            $mail->sendAcademyApplicationStatusEmail(
                (string)$app['email'],
                (string)$app['full_name'],
                (string)$app['application_ref'],
                (string)($app['course_title'] ?? 'Academy Program'),
                AcademyService::STATUS_ENROLLED,
                'Your enrollment is complete! Sign in to your HAMBAKTECH Student Hub to view your digital Student ID card and program details.',
                (string)$student['student_id']
            );
        } catch (Throwable) {
        }

        FootprintService::record('academy', 'ACADEMY_ENROLLMENT_COMPLETED', $actor, 'academy_student', (string)$student['id'], null, 'enrolled', null, null, ['student_id' => $student['student_id'], 'exception' => $usedException], $ip);

        return [
            'status' => AcademyService::STATUS_ENROLLED,
            'student' => $student,
            'timeline' => AcademyService::getApplicationTimeline($this->db, (string)$app['id']),
        ];
    }

    private function executeWithdrawal(array $app, string $reason, array $actor, string $ip): void
    {
        $currentStatus = AcademyService::normalizeApplicationStatus((string)$app['status']);
        if (!AcademyService::canTransition($currentStatus, AcademyService::STATUS_WITHDRAWN)) {
            Response::error("Application cannot be withdrawn from current status ({$currentStatus}).", 409);
        }

        $cleanReason = trim($reason) !== '' ? trim($reason) : 'Withdrawn upon request.';

        $this->db->withTransaction(function (Database $db) use ($app, $cleanReason) {
            $db->execute(
                'UPDATE academy_applications
                 SET status = "withdrawn", withdrawn_at = NOW(), withdrawal_reason = :reason, updated_at = NOW()
                 WHERE id = :id',
                ['reason' => $cleanReason, 'id' => $app['id']]
            );

            $student = $db->fetchOne('SELECT id FROM academy_students WHERE application_id = :aid AND deleted_at IS NULL LIMIT 1', ['aid' => $app['id']]);
            if ($student) {
                $db->execute(
                    'UPDATE academy_students
                     SET academic_status = "withdrawn", withdrawn_at = NOW(), withdrawal_reason = :reason, updated_at = NOW()
                     WHERE id = :id',
                    ['reason' => $cleanReason, 'id' => $student['id']]
                );
            }

            if (!empty($app['user_id'])) {
                $otherActive = $db->fetchOne(
                    'SELECT id FROM academy_students WHERE user_id = :uid AND academic_status = "active" AND deleted_at IS NULL LIMIT 1',
                    ['uid' => $app['user_id']]
                );
                if (!$otherActive) {
                    $db->execute(
                        'UPDATE users SET role = "customer", assigned_dashboard = "customer", updated_at = NOW()
                         WHERE id = :uid AND role = "student"',
                        ['uid' => $app['user_id']]
                    );
                }
            }
        });

        AcademyService::recordEvent(
            $this->db,
            (string)$app['id'],
            $currentStatus,
            AcademyService::STATUS_WITHDRAWN,
            'withdrawn',
            $actor,
            $cleanReason
        );

        if (!empty($app['user_id'])) {
            try {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, :title, :msg, "warning", 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $app['user_id'],
                        'title' => 'Academy Application / Enrollment Withdrawn',
                        'msg' => "Your application ({$app['application_ref']}) for {$app['course_title']} has been marked as withdrawn.",
                    ]
                );
            } catch (Throwable) {
            }
        }

        FootprintService::record('academy', 'ACADEMY_APPLICATION_WITHDRAWN', $actor, 'academy_application', (string)$app['id'], null, 'withdrawn', null, null, ['reason' => $cleanReason], $ip);
    }

    // -------------------------------------------------------------------------
    // ADMIN ENDPOINTS (ALL REQUIRE 'services' OR 'academy' PERMISSION)
    // -------------------------------------------------------------------------

    /**
     * GET /api/admin/academy
     */
    public function adminOverview(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        AcademyService::ensureSeeded($this->db);

        $courses = $this->db->fetchAll('SELECT * FROM academy_courses ORDER BY display_order ASC, title ASC');
        $courses = array_map([AcademyService::class, 'normalizeCourse'], $courses);
        $settings = AcademyService::getSettings($this->db);

        $applications = [];
        try {
            $applications = $this->db->fetchAll(
                'SELECT a.*, c.title AS course_title, c.duration AS course_duration, c.is_available AS course_is_available,
                        s.id AS linked_student_row_id, s.student_id, s.academic_status, s.enrollment_date, s.completion_date,
                        s.id_card_issued_at, s.photo_url AS student_photo_url, s.qr_token,
                        u.role AS linked_user_role, u.email_verified AS linked_user_verified
                 FROM academy_applications a
                 LEFT JOIN academy_courses c ON c.id = a.course_id
                 LEFT JOIN academy_students s ON s.application_id = a.id AND s.deleted_at IS NULL
                 LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.deleted_at IS NULL
                 ORDER BY a.created_at DESC'
            );
            foreach ($applications as &$app) {
                $app['status'] = AcademyService::normalizeApplicationStatus((string)$app['status']);
                $app['student'] = $this->buildRealStudentPayload($app);
                unset($app['linked_student_row_id'], $app['student_photo_url'], $app['qr_token']);
                if ($app['status'] === AcademyService::STATUS_APPROVED) {
                    $courseRow = !empty($app['course_id']) ? ['id' => $app['course_id'], 'is_available' => (bool)($app['course_is_available'] ?? true)] : null;
                    $eval = AcademyService::evaluateEnrollmentRequirements($this->db, $app, $courseRow);
                    $app['enrollment_requirements'] = ['met' => $eval['met'], 'missing' => $eval['missing']];
                }
            }
            unset($app);
        } catch (Throwable) {
        }

        $students = [];
        try {
            $students = $this->db->fetchAll(
                'SELECT s.*, c.title AS course_title, c.duration AS course_duration
                 FROM academy_students s
                 LEFT JOIN academy_courses c ON c.id = s.course_id
                 WHERE s.deleted_at IS NULL
                 ORDER BY s.created_at DESC'
            );
        } catch (Throwable) {
        }

        Response::success([
            'courses' => $courses,
            'settings' => $settings,
            'applications' => $applications,
            'students' => $students,
        ]);
    }

    /**
     * GET /api/admin/academy/applications/:id
     */
    public function applicationDetail(Request $request, array $params): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        $id = trim((string)($params['id'] ?? ''));

        $app = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title, c.duration AS course_duration, c.is_available AS course_is_available,
                    s.id AS linked_student_row_id, s.student_id, s.academic_status, s.enrollment_date,
                    s.completion_date, s.id_card_issued_at, s.photo_url AS student_photo_url, s.qr_token,
                    u.role AS linked_user_role, u.email_verified AS linked_user_verified, u.full_name AS linked_user_name
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             LEFT JOIN academy_students s ON s.application_id = a.id AND s.deleted_at IS NULL
             LEFT JOIN users u ON u.id = a.user_id
             WHERE a.id = :id AND a.deleted_at IS NULL
             LIMIT 1',
            ['id' => $id]
        );

        if (!$app) {
            Response::error('Admission application not found.', 404);
        }

        $app['status'] = AcademyService::normalizeApplicationStatus((string)$app['status']);
        $student = $this->buildRealStudentPayload($app);
        unset($app['linked_student_row_id'], $app['student_photo_url'], $app['qr_token']);

        $courseRow = !empty($app['course_id']) ? ['id' => $app['course_id'], 'is_available' => (bool)($app['course_is_available'] ?? true)] : null;
        $eval = AcademyService::evaluateEnrollmentRequirements($this->db, $app, $courseRow);
        $timeline = AcademyService::getApplicationTimeline($this->db, $id);

        Response::success([
            'application' => $app,
            'student' => $student,
            'timeline' => $timeline,
            'enrollment_requirements' => [
                'met' => $eval['met'],
                'missing' => $eval['missing'],
            ],
        ]);
    }

    /**
     * GET /api/admin/academy/settings
     */
    public function getSettings(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        Response::success(['settings' => AcademyService::getSettings($this->db)]);
    }

    /**
     * PUT /api/admin/academy/settings
     */
    public function updateSettings(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        $body = $request->getBody();
        $merged = array_merge(AcademyService::getSettings($this->db), $body);

        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES ("set_academy_config", "academy_settings", :val, "academy", "HAMBAKTECH Digital Training Academy settings", NOW())
             ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
            [
                'val' => json_encode($merged),
                'val2' => json_encode($merged),
            ]
        );

        Response::success(['settings' => $merged], 'Academy settings saved successfully.');
    }

    /**
     * POST|PUT /api/admin/academy/course(/:id)
     */
    public function saveCourse(Request $request, array $params = []): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        $body = $request->getBody();
        $id = $params['id'] ?? (string)($body['id'] ?? '');
        if ($id === '') {
            $id = 'htda_' . strtolower(bin2hex(random_bytes(4)));
        }

        $priceVal = null;
        if (array_key_exists('price', $body) && $body['price'] !== '' && $body['price'] !== null) {
            $priceVal = (float)$body['price'];
        }

        $existing = $this->db->fetchOne('SELECT * FROM academy_courses WHERE id = :id', ['id' => $id]);

        if ($existing) {
            $this->db->execute(
                'UPDATE academy_courses SET
                    title = :title,
                    category = :category,
                    level = :level,
                    duration = :duration,
                    modules_count = :modules_count,
                    price = :price,
                    description = :description,
                    curriculum_outline = :curriculum_outline,
                    is_available = :is_available,
                    admission_start_date = :admission_start_date,
                    admission_end_date = :admission_end_date,
                    display_order = :display_order,
                    status = :status,
                    updated_at = NOW()
                 WHERE id = :id',
                [
                    'id' => $id,
                    'title' => trim((string)($body['title'] ?? $existing['title'])),
                    'category' => trim((string)($body['category'] ?? ($existing['category'] ?? 'Digital Skills'))),
                    'level' => trim((string)($body['level'] ?? $existing['level'])),
                    'duration' => trim((string)($body['duration'] ?? $existing['duration'])),
                    'modules_count' => (int)($body['modules_count'] ?? $existing['modules_count']),
                    'price' => array_key_exists('price', $body) ? $priceVal : $existing['price'],
                    'description' => (string)($body['description'] ?? $existing['description']),
                    'curriculum_outline' => array_key_exists('curriculum_outline', $body) ? ($body['curriculum_outline'] ?: null) : $existing['curriculum_outline'],
                    'is_available' => isset($body['is_available']) ? ((bool)$body['is_available'] ? 1 : 0) : (int)($existing['is_available'] ?? 1),
                    'admission_start_date' => array_key_exists('admission_start_date', $body) ? ($body['admission_start_date'] ?: null) : $existing['admission_start_date'],
                    'admission_end_date' => array_key_exists('admission_end_date', $body) ? ($body['admission_end_date'] ?: null) : $existing['admission_end_date'],
                    'display_order' => (int)($body['display_order'] ?? ($existing['display_order'] ?? 1)),
                    'status' => (string)($body['status'] ?? $existing['status']),
                ]
            );
        } else {
            $this->db->execute(
                'INSERT INTO academy_courses
                    (id, title, category, level, duration, modules_count, price, description, curriculum_outline,
                     is_available, admission_start_date, admission_end_date, display_order, status)
                 VALUES
                    (:id, :title, :category, :level, :duration, :modules_count, :price, :description, :curriculum_outline,
                     :is_available, :admission_start_date, :admission_end_date, :display_order, :status)',
                [
                    'id' => $id,
                    'title' => trim((string)($body['title'] ?? 'New Course')),
                    'category' => trim((string)($body['category'] ?? 'Digital Skills')),
                    'level' => trim((string)($body['level'] ?? 'Beginner')),
                    'duration' => trim((string)($body['duration'] ?? '1 month')),
                    'modules_count' => (int)($body['modules_count'] ?? 4),
                    'price' => $priceVal,
                    'description' => (string)($body['description'] ?? ''),
                    'curriculum_outline' => !empty($body['curriculum_outline']) ? (string)$body['curriculum_outline'] : null,
                    'is_available' => isset($body['is_available']) ? ((bool)$body['is_available'] ? 1 : 0) : 1,
                    'admission_start_date' => !empty($body['admission_start_date']) ? (string)$body['admission_start_date'] : null,
                    'admission_end_date' => !empty($body['admission_end_date']) ? (string)$body['admission_end_date'] : null,
                    'display_order' => (int)($body['display_order'] ?? 13),
                    'status' => (string)($body['status'] ?? 'enrolling'),
                ]
            );
        }

        $row = $this->db->fetchOne('SELECT * FROM academy_courses WHERE id = :id', ['id' => $id]);
        Response::success(['course' => AcademyService::normalizeCourse($row)], 'Academy course saved.');
    }

    /**
     * DELETE /api/admin/academy/course/:id
     */
    public function deleteCourse(Request $request, array $params): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        $id = $params['id'] ?? '';
        $inUse = $this->db->fetchOne(
            'SELECT id FROM academy_applications WHERE course_id = :id AND deleted_at IS NULL LIMIT 1',
            ['id' => $id]
        );
        if ($inUse) {
            Response::error('Cannot delete a course that has existing applications. Pause availability instead.', 409);
        }
        $this->db->execute('DELETE FROM academy_courses WHERE id = :id', ['id' => $id]);
        Response::success(null, 'Academy course deleted.');
    }

    /**
     * GET /api/admin/academy/applications
     */
    public function applications(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        $rows = $this->db->fetchAll(
            'SELECT a.*, c.title AS course_title, c.duration AS course_duration, c.is_available AS course_is_available,
                    s.id AS linked_student_row_id, s.student_id, s.academic_status, s.enrollment_date,
                    u.role AS linked_user_role, u.email_verified AS linked_user_verified
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             LEFT JOIN academy_students s ON s.application_id = a.id AND s.deleted_at IS NULL
             LEFT JOIN users u ON u.id = a.user_id
             WHERE a.deleted_at IS NULL
             ORDER BY a.created_at DESC'
        );
        foreach ($rows as &$r) {
            $r['status'] = AcademyService::normalizeApplicationStatus((string)$r['status']);
            $r['student'] = $this->buildRealStudentPayload($r);
            unset($r['linked_student_row_id']);
        }
        Response::success(['applications' => $rows]);
    }

    /**
     * POST /api/admin/academy/applications/:id/review
     * Supports Phase 1 state machine actions:
     *   start_review, request_info, approve, reject, enroll, withdraw, reconcile
     * CRITICAL: "approve" transitions ONLY to "approved" and NEVER issues active Student ID or enrollment!
     */
    public function reviewApplication(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'academy']);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->getBody();
        $action = strtolower(trim((string)($body['action'] ?? '')));
        $adminNotes = trim((string)($body['admin_notes'] ?? ''));
        $infoMessage = trim((string)($body['info_request_message'] ?? ''));
        $approveException = !empty($body['approve_exception']);
        $exceptionReason = trim((string)($body['exception_reason'] ?? ''));

        $app = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title, c.is_available AS course_is_available
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             WHERE a.id = :id AND a.deleted_at IS NULL LIMIT 1',
            ['id' => $id]
        );
        if (!$app) {
            Response::error('Admission application not found.', 404);
        }

        $currentStatus = AcademyService::normalizeApplicationStatus((string)$app['status']);
        $reviewer = $admin['full_name'] ?? ($admin['email'] ?? 'Administrator');

        // Reconcile linked user by email on demand
        if ($action === 'reconcile') {
            $u = $this->db->fetchOne('SELECT id, email, email_verified FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => strtolower((string)$app['email'])]);
            if (!$u) {
                AcademyService::issueAccountInvitation(
                    $this->db,
                    (string)$app['id'],
                    (string)$app['email'],
                    (string)$app['full_name'],
                    (string)$app['phone'],
                    (string)$app['application_ref'],
                    (string)($app['course_title'] ?? 'Academy Program')
                );
                Response::success(['linked' => false, 'invited' => true], 'No user account found yet. A fresh 48-hour activation invitation has been sent.');
            }
            $res = AcademyService::reconcileUserAcademyLinks($this->db, (string)$u['id'], (string)$u['email'], !empty($u['email_verified']));
            Response::success(['linked' => !empty($u['email_verified']), 'reconciled' => $res], !empty($u['email_verified']) ? 'Application linked to verified account.' : 'User account found, waiting for email verification.');
        }

        if ($action === 'start_review') {
            if (!AcademyService::canTransition($currentStatus, AcademyService::STATUS_UNDER_REVIEW)) {
                Response::error("Cannot move application from {$currentStatus} to under_review.", 409);
            }
            $this->db->execute(
                'UPDATE academy_applications SET status = "under_review", admin_notes = COALESCE(:notes, admin_notes), reviewed_by = :rev, reviewed_at = NOW(), updated_at = NOW() WHERE id = :id',
                ['notes' => $adminNotes ?: null, 'rev' => $reviewer, 'id' => $id]
            );
            AcademyService::recordEvent($this->db, $id, $currentStatus, AcademyService::STATUS_UNDER_REVIEW, 'review_started', $admin, $adminNotes ?: 'Admissions review started.');
            $this->notifyApplicantStatus($app, AcademyService::STATUS_UNDER_REVIEW, 'Your application is now actively under admissions review.');
            Response::success([
                'status' => AcademyService::STATUS_UNDER_REVIEW,
                'timeline' => AcademyService::getApplicationTimeline($this->db, $id),
            ], 'Application marked as Under Review.');
        }

        if ($action === 'request_info') {
            if ($infoMessage === '') {
                Response::error('Please specify what additional information or correction is required from the applicant.', 422);
            }
            if (!AcademyService::canTransition($currentStatus, AcademyService::STATUS_INFO_REQUESTED)) {
                Response::error("Cannot request additional information from status ({$currentStatus}).", 409);
            }
            $this->db->execute(
                'UPDATE academy_applications
                 SET status = "information_requested", info_request_message = :msg, admin_notes = :notes, reviewed_by = :rev, reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = :id',
                ['msg' => $infoMessage, 'notes' => $adminNotes ?: null, 'rev' => $reviewer, 'id' => $id]
            );
            AcademyService::recordEvent($this->db, $id, $currentStatus, AcademyService::STATUS_INFO_REQUESTED, 'information_requested', $admin, $infoMessage);
            $this->notifyApplicantStatus($app, AcademyService::STATUS_INFO_REQUESTED, $infoMessage);
            Response::success([
                'status' => AcademyService::STATUS_INFO_REQUESTED,
                'timeline' => AcademyService::getApplicationTimeline($this->db, $id),
            ], 'Additional information requested from applicant.');
        }

        if ($action === 'approve') {
            if (!AcademyService::canTransition($currentStatus, AcademyService::STATUS_APPROVED)) {
                Response::error("Cannot approve application from status ({$currentStatus}).", 409);
            }
            // IMPORTANT PHASE 1 RULE: Approval stops strictly at "approved" and DOES NOT create student record / auto-enroll!
            $this->db->execute(
                'UPDATE academy_applications
                 SET status = "approved", admin_notes = :notes, reviewed_by = :rev, reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = :id',
                ['notes' => $adminNotes ?: null, 'rev' => $reviewer, 'id' => $id]
            );

            AcademyService::recordEvent(
                $this->db,
                $id,
                $currentStatus,
                AcademyService::STATUS_APPROVED,
                'admission_approved',
                $admin,
                $adminNotes ?: 'Admission approved (pending enrollment completion).'
            );

            $this->notifyApplicantStatus(
                $app,
                AcademyService::STATUS_APPROVED,
                'Congratulations! Your admission application has been approved. Please complete your final enrollment step in the portal to receive your Student ID.'
            );

            FootprintService::record('academy', 'ACADEMY_ADMISSION_APPROVED', $admin, 'academy_application', $id, null, 'approved', null, null, ['application_ref' => $app['application_ref']], $request->getIp());

            Response::success([
                'status' => AcademyService::STATUS_APPROVED,
                'timeline' => AcademyService::getApplicationTimeline($this->db, $id),
            ], 'Admission approved. Enrollment and Student ID remain gated until enrollment completion.');
        }

        if ($action === 'enroll') {
            $result = $this->executeEnrollmentTransition($app, $admin, $approveException, $exceptionReason, $request->getIp());
            Response::success($result, "Enrollment completed! Official Student ID {$result['student']['student_id']} issued.");
        }

        if ($action === 'reject') {
            if (!AcademyService::canTransition($currentStatus, AcademyService::STATUS_REJECTED)) {
                Response::error("Cannot reject application from status ({$currentStatus}).", 409);
            }
            $this->db->execute(
                'UPDATE academy_applications SET status = "rejected", admin_notes = :notes, reviewed_by = :rev, reviewed_at = NOW(), updated_at = NOW() WHERE id = :id',
                ['notes' => $adminNotes ?: null, 'rev' => $reviewer, 'id' => $id]
            );
            AcademyService::recordEvent($this->db, $id, $currentStatus, AcademyService::STATUS_REJECTED, 'rejected', $admin, $adminNotes ?: 'Application not approved.');
            $this->notifyApplicantStatus($app, AcademyService::STATUS_REJECTED, $adminNotes ?: 'We regret to inform you that your application was not approved at this time.');
            FootprintService::record('academy', 'ACADEMY_APPLICATION_REJECTED', $admin, 'academy_application', $id, null, 'rejected', null, null, ['application_ref' => $app['application_ref']], $request->getIp());
            Response::success([
                'status' => AcademyService::STATUS_REJECTED,
                'timeline' => AcademyService::getApplicationTimeline($this->db, $id),
            ], 'Application marked as rejected.');
        }

        if ($action === 'withdraw') {
            $reason = trim((string)($body['withdrawal_reason'] ?? $adminNotes ?: 'Withdrawn by admissions administrator.'));
            $this->executeWithdrawal($app, $reason, $admin, $request->getIp());
            Response::success([
                'status' => AcademyService::STATUS_WITHDRAWN,
                'timeline' => AcademyService::getApplicationTimeline($this->db, $id),
            ], 'Application / enrollment marked as withdrawn.');
        }

        Response::error('Invalid review action specified.', 422);
    }

    private function notifyApplicantStatus(array $app, string $newStatus, string $message): void
    {
        if (!empty($app['user_id'])) {
            try {
                $notifType = match ($newStatus) {
                    AcademyService::STATUS_APPROVED, AcademyService::STATUS_ENROLLED => 'success',
                    AcademyService::STATUS_INFO_REQUESTED, AcademyService::STATUS_WITHDRAWN => 'warning',
                    default => 'info',
                };
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, :title, :msg, :tp, 0, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $app['user_id'],
                        'title' => 'Academy Application Update: ' . ucwords(str_replace('_', ' ', $newStatus)),
                        'msg' => $message . " (Ref: {$app['application_ref']})",
                        'tp' => $notifType,
                    ]
                );
            } catch (Throwable) {
            }
        }

        try {
            $mail = new MailService();
            $mail->sendAcademyApplicationStatusEmail(
                (string)$app['email'],
                (string)$app['full_name'],
                (string)$app['application_ref'],
                (string)($app['course_title'] ?? 'Academy Training Program'),
                $newStatus,
                $message
            );
        } catch (Throwable) {
        }
    }

    /**
     * GET /api/admin/academy/students
     */
    public function students(Request $request): void
    {
        Auth::requireAnyPermission($request, ['services', 'academy']);
        $rows = $this->db->fetchAll(
            'SELECT s.*, c.title AS course_title, c.duration AS course_duration
             FROM academy_students s
             LEFT JOIN academy_courses c ON c.id = s.course_id
             WHERE s.deleted_at IS NULL
             ORDER BY s.created_at DESC'
        );
        Response::success(['students' => $rows]);
    }

    /**
     * PUT /api/admin/academy/students/:id
     */
    public function updateStudent(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'academy']);
        $id = $params['id'] ?? '';
        $body = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM academy_students WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
        if (!$existing) {
            Response::error('Enrolled student record not found.', 404);
        }

        $status = (string)($body['academic_status'] ?? $existing['academic_status']);
        if (!in_array($status, ['active', 'graduated', 'suspended', 'withdrawn'], true)) {
            Response::error('Invalid academic status.', 422);
        }

        $completionDate = array_key_exists('completion_date', $body)
            ? ($body['completion_date'] ?: null)
            : ($status === 'graduated' && empty($existing['completion_date']) ? date('Y-m-d') : $existing['completion_date']);

        $this->db->execute(
            'UPDATE academy_students SET
                academic_status = :st,
                completion_date = :cdate,
                course_id = :cid,
                withdrawn_at = CASE WHEN :st2 = "withdrawn" THEN COALESCE(withdrawn_at, NOW()) ELSE NULL END,
                updated_at = NOW()
             WHERE id = :id',
            [
                'st' => $status,
                'st2' => $status,
                'cdate' => $completionDate,
                'cid' => (string)($body['course_id'] ?? $existing['course_id']),
                'id' => $id,
            ]
        );

        if ($status === 'withdrawn' && !empty($existing['application_id'])) {
            $this->db->execute(
                'UPDATE academy_applications SET status = "withdrawn", withdrawn_at = COALESCE(withdrawn_at, NOW()) WHERE id = :aid AND status = "enrolled"',
                ['aid' => $existing['application_id']]
            );
            AcademyService::recordEvent($this->db, (string)$existing['application_id'], AcademyService::STATUS_ENROLLED, AcademyService::STATUS_WITHDRAWN, 'student_withdrawn', $admin, 'Student academic status updated to withdrawn.');
        }

        $updated = $this->db->fetchOne(
            'SELECT s.*, c.title AS course_title, c.duration AS course_duration
             FROM academy_students s
             LEFT JOIN academy_courses c ON c.id = s.course_id
             WHERE s.id = :id',
            ['id' => $id]
        );

        Response::success(['student' => $updated], 'Student academic record updated.');
    }

    /**
     * DELETE /api/admin/academy/applications/:id
     * Soft-deletes non-protected records while preserving HTDA/2026/0001 and HTDA/2026/0002 unconditionally.
     */
    public function deleteApplication(Request $request, array $params): void
    {
        $admin = Auth::requireAnyPermission($request, ['services', 'academy']);
        $id = $params['id'] ?? '';

        $linkedStudent = $this->db->fetchOne('SELECT student_id FROM academy_students WHERE application_id = :id LIMIT 1', ['id' => $id]);
        if ($linkedStudent && in_array(strtoupper((string)$linkedStudent['student_id']), ['HTDA/2026/0001', 'HTDA/2026/0002'], true)) {
            Response::forbidden("Protected production student record {$linkedStudent['student_id']} cannot be deleted.");
        }

        $this->db->execute('UPDATE academy_students SET deleted_at = NOW() WHERE application_id = :id', ['id' => $id]);
        $this->db->execute('UPDATE academy_applications SET deleted_at = NOW() WHERE id = :id', ['id' => $id]);
        AcademyService::recordEvent($this->db, $id, null, AcademyService::STATUS_WITHDRAWN, 'soft_deleted', $admin, 'Application soft-deleted by administrator.');

        Response::success(null, 'Academy application archived safely.');
    }
}
