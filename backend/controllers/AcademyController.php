<?php
/**
 * @file AcademyController.php
 * HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY Controller
 * Handles public course directory, admissions (with strict < 18 guardian enforcement),
 * admin review/student ID issuance, enrolled customer portal, and public QR verification.
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Services\AcademyService;
use Throwable;

class AcademyController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

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
     * POST /api/academy/apply (Public or authenticated customer)
     */
    public function apply(Request $request): void
    {
        $user = Auth::user($request);
        $this->processApplication($request, $user);
    }

    /**
     * GET /api/academy/application-status?ref=...&email=...
     */
    public function applicationStatus(Request $request): void
    {
        $ref = strtoupper(trim((string)$request->query('ref', '')));
        $email = strtolower(trim((string)$request->query('email', '')));

        if (empty($ref) || empty($email)) {
            Response::error('Please provide both your Application Reference and Email Address.', 422);
        }

        $app = $this->db->fetchOne(
            'SELECT a.id, a.application_ref, a.course_id, a.full_name, a.email, a.status, a.admin_notes,
                    a.info_request_message, a.study_mode, a.preferred_schedule, a.created_at, a.reviewed_at,
                    c.title AS course_title, c.duration AS course_duration,
                    s.student_id, s.academic_status, s.enrollment_date, s.completion_date, s.id_card_issued_at
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             LEFT JOIN academy_students s ON s.application_id = a.id
             WHERE UPPER(a.application_ref) = :ref AND LOWER(a.email) = :email
             LIMIT 1',
            ['ref' => $ref, 'email' => $email]
        );

        if (!$app) {
            Response::error('No matching admission application was found for that reference and email.', 404);
        }

        Response::success(['application' => $app]);
    }

    /**
     * GET /api/academy/verify/:student_id  or  GET /api/academy/verify?student_id=...
     * Public verification endpoint — exposes ONLY safe verification fields (ZERO PII).
     */
    public function verifyStudent(Request $request, array $params = []): void
    {
        $rawId = (string)($params['student_id'] ?? $request->query('student_id', ''));
        $studentId = strtoupper(trim(urldecode($rawId)));

        if (empty($studentId)) {
            Response::error('Student ID is required for verification.', 422);
        }

        $student = $this->db->fetchOne(
            'SELECT s.student_id, s.full_name, s.academic_status, s.enrollment_date, s.completion_date,
                    s.id_card_issued_at, c.title AS course_title, c.duration AS course_duration
             FROM academy_students s
             LEFT JOIN academy_courses c ON c.id = s.course_id
             WHERE UPPER(s.student_id) = :sid
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

    /**
     * GET /api/customer/academy
     */
    public function customerAcademy(Request $request): void
    {
        $user = Auth::requireAuth($request);
        AcademyService::ensureSeeded($this->db);

        $courses = $this->db->fetchAll(
            'SELECT * FROM academy_courses WHERE status != "draft" ORDER BY display_order ASC, title ASC'
        );
        $courses = array_map([AcademyService::class, 'normalizeCourse'], $courses);
        $settings = AcademyService::getSettings($this->db);

        $myApplications = [];
        try {
            $myApplications = $this->db->fetchAll(
                'SELECT a.*, c.title AS course_title, c.duration AS course_duration, c.category AS course_category
                 FROM academy_applications a
                 LEFT JOIN academy_courses c ON c.id = a.course_id
                 WHERE a.user_id = :uid OR LOWER(a.email) = :email
                 ORDER BY a.created_at DESC',
                ['uid' => $user['id'], 'email' => strtolower((string)$user['email'])]
            );
        } catch (Throwable) {
        }

        $myStudents = [];
        try {
            $myStudents = $this->db->fetchAll(
                'SELECT s.*, c.title AS course_title, c.duration AS course_duration, c.category AS course_category
                 FROM academy_students s
                 LEFT JOIN academy_courses c ON c.id = s.course_id
                 WHERE s.user_id = :uid OR LOWER(s.email) = :email
                 ORDER BY s.created_at DESC',
                ['uid' => $user['id'], 'email' => strtolower((string)$user['email'])]
            );
        } catch (Throwable) {
        }

        Response::success([
            'courses' => $courses,
            'settings' => $settings,
            'applications' => $myApplications,
            'students' => $myStudents,
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
     * Shared validated admission application submission
     */
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
            empty($courseId) || empty($fullName) || empty($email) || empty($phone) ||
            empty($dob) || empty($gender) || empty($address) || empty($state) || empty($lga)
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

        // Strict Under-18 Guardian Verification Rule
        if ($age < 18) {
            if (empty($guardianName) || empty($guardianPhone) || empty($guardianAddress) || empty($guardianRelationship)) {
                Response::error(
                    'Applicants under 18 years old must provide complete Parent/Guardian details (full name, phone number, residential address, and relationship).',
                    422
                );
            }
        }

        $linkedUserId = $user['id'] ?? null;
        if (!$linkedUserId) {
            try {
                $existingUser = $this->db->fetchOne('SELECT id FROM users WHERE LOWER(email) = :email LIMIT 1', ['email' => $email]);
                if ($existingUser) {
                    $linkedUserId = $existingUser['id'];
                }
            } catch (Throwable) {
            }
        }

        $id = Security::generateUuid();
        $appRef = AcademyService::generateApplicationRef($this->db);

        $this->db->execute(
            'INSERT INTO academy_applications
                (id, application_ref, user_id, course_id, full_name, email, phone, date_of_birth, age_at_submission,
                 gender, address, state, lga, qualification, study_mode, preferred_schedule,
                 guardian_name, guardian_phone, guardian_address, guardian_relationship,
                 emergency_contact_name, emergency_contact_phone, passport_url, status)
             VALUES
                (:id, :ref, :uid, :cid, :name, :email, :phone, :dob, :age,
                 :gender, :addr, :state, :lga, :qual, :mode, :sched,
                 :gname, :gphone, :gaddr, :grel,
                 :ename, :ephone, :purl, "pending")',
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
            ]
        );

        if ($linkedUserId) {
            try {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                     VALUES (:id, :uid, :title, :msg, "academy", 0, NOW())',
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

        $saved = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title, c.duration AS course_duration
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             WHERE a.id = :id',
            ['id' => $id]
        );

        Response::success([
            'application' => $saved,
            'application_ref' => $appRef,
        ], 'Your admission application has been submitted successfully.');
    }

    // -------------------------------------------------------------------------
    // ADMIN ENDPOINTS
    // -------------------------------------------------------------------------

    /**
     * GET /api/admin/academy
     */
    public function adminOverview(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        AcademyService::ensureSeeded($this->db);

        $courses = $this->db->fetchAll('SELECT * FROM academy_courses ORDER BY display_order ASC, title ASC');
        $courses = array_map([AcademyService::class, 'normalizeCourse'], $courses);
        $settings = AcademyService::getSettings($this->db);

        $applications = [];
        try {
            $applications = $this->db->fetchAll(
                'SELECT a.*, c.title AS course_title, c.duration AS course_duration,
                        s.student_id, s.academic_status
                 FROM academy_applications a
                 LEFT JOIN academy_courses c ON c.id = a.course_id
                 LEFT JOIN academy_students s ON s.application_id = a.id
                 ORDER BY a.created_at DESC'
            );
        } catch (Throwable) {
        }

        $students = [];
        try {
            $students = $this->db->fetchAll(
                'SELECT s.*, c.title AS course_title, c.duration AS course_duration
                 FROM academy_students s
                 LEFT JOIN academy_courses c ON c.id = s.course_id
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
     * GET /api/admin/academy/settings
     */
    public function getSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        Response::success(['settings' => AcademyService::getSettings($this->db)]);
    }

    /**
     * PUT /api/admin/academy/settings
     */
    public function updateSettings(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
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
        Auth::requireRole($request, ['admin', 'superadmin']);
        $body = $request->getBody();
        $id = $params['id'] ?? (string)($body['id'] ?? '');
        if (empty($id)) {
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
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM academy_courses WHERE id = :id', ['id' => $id]);
        Response::success(null, 'Academy course deleted.');
    }

    /**
     * GET /api/admin/academy/applications
     */
    public function applications(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $rows = $this->db->fetchAll(
            'SELECT a.*, c.title AS course_title, c.duration AS course_duration,
                    s.student_id, s.academic_status
             FROM academy_applications a
             LEFT JOIN academy_courses c ON c.id = a.course_id
             LEFT JOIN academy_students s ON s.application_id = a.id
             ORDER BY a.created_at DESC'
        );
        Response::success(['applications' => $rows]);
    }

    /**
     * POST /api/admin/academy/applications/:id/review
     */
    public function reviewApplication(Request $request, array $params): void
    {
        $admin = Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $body = $request->getBody();
        $action = strtolower(trim((string)($body['action'] ?? 'approve')));
        $adminNotes = trim((string)($body['admin_notes'] ?? ''));
        $infoMessage = trim((string)($body['info_request_message'] ?? ''));

        $app = $this->db->fetchOne(
            'SELECT a.*, c.title AS course_title FROM academy_applications a LEFT JOIN academy_courses c ON c.id = a.course_id WHERE a.id = :id',
            ['id' => $id]
        );
        if (!$app) {
            Response::error('Admission application not found.', 404);
        }

        $reviewer = $admin['full_name'] ?? ($admin['email'] ?? 'Administrator');
        $settings = AcademyService::getSettings($this->db);

        if ($action === 'approve') {
            $this->db->execute(
                'UPDATE academy_applications SET status = "approved", admin_notes = :notes, reviewed_by = :rev, reviewed_at = NOW() WHERE id = :id',
                ['notes' => $adminNotes ?: null, 'rev' => $reviewer, 'id' => $id]
            );

            $student = $this->db->fetchOne('SELECT * FROM academy_students WHERE application_id = :aid', ['aid' => $id]);
            if (!$student) {
                $prefix = (string)($settings['student_id_prefix'] ?? 'HTDA');
                $studentId = AcademyService::generateStudentId($this->db, $prefix);
                $studentRowId = Security::generateUuid();
                $qrToken = bin2hex(random_bytes(16));

                $this->db->execute(
                    'INSERT INTO academy_students
                        (id, student_id, application_id, user_id, course_id, full_name, email, phone, photo_url,
                         enrollment_date, academic_status, id_card_issued_at, qr_token)
                     VALUES
                        (:id, :sid, :aid, :uid, :cid, :name, :email, :phone, :photo, CURDATE(), "active", NOW(), :qr)',
                    [
                        'id' => $studentRowId,
                        'sid' => $studentId,
                        'aid' => $id,
                        'uid' => $app['user_id'] ?: null,
                        'cid' => $app['course_id'],
                        'name' => $app['full_name'],
                        'email' => $app['email'],
                        'phone' => $app['phone'],
                        'photo' => $app['passport_url'] ?: null,
                        'qr' => $qrToken,
                    ]
                );
                $student = $this->db->fetchOne('SELECT * FROM academy_students WHERE id = :id', ['id' => $studentRowId]);
            }

            if (!empty($app['user_id'])) {
                try {
                    $this->db->execute(
                        'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                         VALUES (:id, :uid, :title, :msg, "academy", 0, NOW())',
                        [
                            'id' => Security::generateUuid(),
                            'uid' => $app['user_id'],
                            'title' => 'Academy Admission Approved',
                            'msg' => "Congratulations! Your application ({$app['application_ref']}) for {$app['course_title']} is approved. Student ID: {$student['student_id']}.",
                        ]
                    );
                } catch (Throwable) {
                }
            }

            Response::success([
                'status' => 'approved',
                'student' => $student,
            ], "Application approved and Student ID {$student['student_id']} issued.");
        }

        if ($action === 'reject') {
            $this->db->execute(
                'UPDATE academy_applications SET status = "rejected", admin_notes = :notes, reviewed_by = :rev, reviewed_at = NOW() WHERE id = :id',
                ['notes' => $adminNotes ?: null, 'rev' => $reviewer, 'id' => $id]
            );
            Response::success(['status' => 'rejected'], 'Application marked as rejected.');
        }

        if ($action === 'request_info') {
            if (empty($infoMessage)) {
                Response::error('Please specify what additional information is required from the applicant.', 422);
            }
            $this->db->execute(
                'UPDATE academy_applications SET status = "info_requested", info_request_message = :msg, admin_notes = :notes, reviewed_by = :rev, reviewed_at = NOW() WHERE id = :id',
                ['msg' => $infoMessage, 'notes' => $adminNotes ?: null, 'rev' => $reviewer, 'id' => $id]
            );
            Response::success(['status' => 'info_requested'], 'Additional information requested from applicant.');
        }

        Response::error('Invalid review action specified.', 422);
    }

    /**
     * GET /api/admin/academy/students
     */
    public function students(Request $request): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $rows = $this->db->fetchAll(
            'SELECT s.*, c.title AS course_title, c.duration AS course_duration
             FROM academy_students s
             LEFT JOIN academy_courses c ON c.id = s.course_id
             ORDER BY s.created_at DESC'
        );
        Response::success(['students' => $rows]);
    }

    /**
     * PUT /api/admin/academy/students/:id
     */
    public function updateStudent(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $body = $request->getBody();

        $existing = $this->db->fetchOne('SELECT * FROM academy_students WHERE id = :id', ['id' => $id]);
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
                updated_at = NOW()
             WHERE id = :id',
            [
                'st' => $status,
                'cdate' => $completionDate,
                'cid' => (string)($body['course_id'] ?? $existing['course_id']),
                'id' => $id,
            ]
        );

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
     */
    public function deleteApplication(Request $request, array $params): void
    {
        Auth::requireRole($request, ['admin', 'superadmin']);
        $id = $params['id'] ?? '';
        $this->db->execute('DELETE FROM academy_students WHERE application_id = :id', ['id' => $id]);
        $this->db->execute('DELETE FROM academy_applications WHERE id = :id', ['id' => $id]);
        Response::success(null, 'Academy application and linked student record deleted.');
    }
}
