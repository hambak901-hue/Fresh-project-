<?php
/**
 * @file AcademyService.php
 * HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY Service
 * Manages the 12 official courses, official academy defaults, age checks, and ID/Reference generators.
 */

declare(strict_types=1);

namespace HambakTech\Services;

use DateTimeImmutable;
use HambakTech\Core\Database;
use HambakTech\Core\Security;
use Throwable;

class AcademyService
{
    public const OFFICIAL_COURSES = [
        [
            'id' => 'htda_01',
            'title' => 'Basic ICT',
            'category' => 'Foundational Computing',
            'level' => 'Beginner',
            'duration' => '1 month',
            'modules_count' => 4,
            'price' => null,
            'description' => 'Essential computer literacy, operating systems, file management, internet safety, email communication, and everyday workplace productivity.',
            'curriculum_outline' => "Week 1: Computer Hardware, Windows & File Management\nWeek 2: Internet Navigation, Online Safety & Cloud Basics\nWeek 3: Email Etiquette, Digital Collaboration & Forms\nWeek 4: Practical Assessment & Digital Workplace Readiness",
            'is_available' => 1,
            'display_order' => 1,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_02',
            'title' => 'Microsoft Office Professional',
            'category' => 'Office Productivity',
            'level' => 'Beginner to Intermediate',
            'duration' => '1 month',
            'modules_count' => 4,
            'price' => null,
            'description' => 'Hands-on proficiency in Microsoft Word, Excel spreadsheets & formulas, PowerPoint presentations, and business document formatting.',
            'curriculum_outline' => "Week 1: Microsoft Word Business Reports & Mail Merge\nWeek 2: Microsoft Excel Formulas, Tables & Charts\nWeek 3: Microsoft PowerPoint Executive Slide Decks\nWeek 4: Office Workflow Project & Practical Evaluation",
            'is_available' => 1,
            'display_order' => 2,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_03',
            'title' => 'Graphic Design',
            'category' => 'Creative Design',
            'level' => 'Beginner to Pro',
            'duration' => '2 months',
            'modules_count' => 8,
            'price' => null,
            'description' => 'Comprehensive commercial brand identity, typography, layout composition, social media creatives, and print-ready production design.',
            'curriculum_outline' => "Modules 1-2: Design Principles, Color Theory & Typography\nModules 3-4: Brand Identity, Logo Systems & Print Layouts\nModules 5-6: Digital Marketing Flyers & Social Campaign Kits\nModules 7-8: Client Briefs, Print Prepress & Portfolio Review",
            'is_available' => 1,
            'display_order' => 3,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_04',
            'title' => 'Photoshop',
            'category' => 'Creative Design',
            'level' => 'Beginner to Intermediate',
            'duration' => '1 month',
            'modules_count' => 4,
            'price' => null,
            'description' => 'Focused Adobe Photoshop mastery covering photo retouching, background masking, compositing, colour grading, and digital flyers.',
            'curriculum_outline' => "Week 1: Workspace, Layers, Selections & Masking\nWeek 2: Portrait Retouching & Colour Correction\nWeek 3: Social Media Visuals & Product Mockups\nWeek 4: Commercial Manipulation Capstone Project",
            'is_available' => 1,
            'display_order' => 4,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_05',
            'title' => 'CorelDRAW',
            'category' => 'Creative Design',
            'level' => 'Beginner to Intermediate',
            'duration' => '1 month',
            'modules_count' => 4,
            'price' => null,
            'description' => 'Practical vector illustration and commercial print design using CorelDRAW for logos, banners, packaging, ID cards, and stationery.',
            'curriculum_outline' => "Week 1: Vector Tools, Bezier Curves & Shape Manipulation\nWeek 2: Typography, Logos & Corporate Stationery\nWeek 3: Large-Format Banners, Brochures & Packaging\nWeek 4: CMYK Separation, Bleeds & Print Output",
            'is_available' => 1,
            'display_order' => 5,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_06',
            'title' => 'Canva Design',
            'category' => 'Creative Design',
            'level' => 'Beginner',
            'duration' => '1 month',
            'modules_count' => 4,
            'price' => null,
            'description' => 'Fast-turnaround visual content creation in Canva for business flyers, pitch decks, social media carousels, and brand kits.',
            'curriculum_outline' => "Week 1: Brand Kits, Grids & Template Customization\nWeek 2: Business Flyers, Posters & Event Graphics\nWeek 3: Pitch Presentations, Reels & Carousel Posts\nWeek 4: Content Calendar Pack & Portfolio Showcase",
            'is_available' => 1,
            'display_order' => 6,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_07',
            'title' => 'UI/UX Design',
            'category' => 'Product & Interface Design',
            'level' => 'Intermediate',
            'duration' => '2 months',
            'modules_count' => 8,
            'price' => null,
            'description' => 'User research, wireframing, design systems, interactive prototyping, and mobile/web product design using modern tools such as Figma.',
            'curriculum_outline' => "Modules 1-2: UX Research, User Flows & Information Architecture\nModules 3-4: Low/High-Fidelity Wireframes & Grid Systems\nModules 5-6: Design Systems, Components & Accessibility\nModules 7-8: Interactive Prototypes & Developer Handoff",
            'is_available' => 1,
            'display_order' => 7,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_08',
            'title' => 'Frontend Web Development',
            'category' => 'Software Engineering',
            'level' => 'Beginner to Intermediate',
            'duration' => '3 months',
            'modules_count' => 12,
            'price' => null,
            'description' => 'Modern responsive website and web application engineering using HTML5, CSS3, Tailwind CSS, JavaScript, and React.',
            'curriculum_outline' => "Month 1: Semantic HTML5, Modern CSS3, Flexbox & Grid\nMonth 2: Responsive Tailwind CSS & JavaScript DOM Mastery\nMonth 3: React Components, State, API Integration & Deployment",
            'is_available' => 1,
            'display_order' => 8,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_09',
            'title' => 'Backend Development',
            'category' => 'Software Engineering',
            'level' => 'Intermediate',
            'duration' => '3 months',
            'modules_count' => 12,
            'price' => null,
            'description' => 'Server-side programming, relational database design with MySQL, REST API architecture, authentication, and secure production deployment.',
            'curriculum_outline' => "Month 1: Server Architecture, PHP / Node.js Fundamentals & Git\nMonth 2: MySQL Database Modelling, Queries & Security\nMonth 3: RESTful APIs, Auth Tokens, Payments & Live Hosting",
            'is_available' => 1,
            'display_order' => 9,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_10',
            'title' => 'Full Stack Development',
            'category' => 'Software Engineering',
            'level' => 'Comprehensive Career Track',
            'duration' => '6 months',
            'modules_count' => 24,
            'price' => null,
            'description' => 'End-to-end software engineering program spanning frontend interfaces, backend APIs, MySQL databases, security, and live product launch.',
            'curriculum_outline' => "Months 1-2: Web Foundations, UI Architecture & JavaScript\nMonths 3-4: React Engineering, Backend APIs & MySQL Design\nMonths 5-6: Authentication, Integrations, Testing & Capstone Launch",
            'is_available' => 1,
            'display_order' => 10,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_11',
            'title' => 'Programming (Python & JavaScript)',
            'category' => 'Programming',
            'level' => 'Beginner to Intermediate',
            'duration' => '3 months',
            'modules_count' => 12,
            'price' => null,
            'description' => 'Strong algorithmic problem-solving and software scripting foundations in Python and JavaScript for automation, web, and data workflows.',
            'curriculum_outline' => "Month 1: Programming Logic, Data Structures & Python Core\nMonth 2: Modern JavaScript, Functions, Async & APIs\nMonth 3: Automation Scripts, Mini Apps & Coding Assessments",
            'is_available' => 1,
            'display_order' => 11,
            'status' => 'enrolling',
        ],
        [
            'id' => 'htda_12',
            'title' => 'Data Analysis',
            'category' => 'Data & Analytics',
            'level' => 'Beginner to Intermediate',
            'duration' => '3 months',
            'modules_count' => 12,
            'price' => null,
            'description' => 'Business intelligence and analytical storytelling using Microsoft Excel, SQL, Power BI, and Python for data cleaning and dashboards.',
            'curriculum_outline' => "Month 1: Advanced Excel Analytics & Data Cleaning\nMonth 2: SQL Querying & Relational Business Reporting\nMonth 3: Power BI Dashboards, Python Basics & Capstone Report",
            'is_available' => 1,
            'display_order' => 12,
            'status' => 'enrolling',
        ],
    ];

    public static function getOfficialSettingsDefaults(): array
    {
        return [
            'academy_name' => 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY',
            'short_name' => 'HAMBAKTECH Digital Training Academy',
            'email' => 'hambak901@gmail.com',
            'mentor_email' => 'hambak901@gmail.com',
            'contact_email' => 'hambak901@gmail.com',
            'address' => 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
            'business_reg_number' => 'BN 9284726',
            'motto' => 'Where Technology Meets Services',
            'student_id_prefix' => 'HTDA',
            'certificate_prefix' => 'HTDA',
            'academy_enabled' => true,
            'coming_soon' => false,
            'enrollment_open' => true,
            'admission_open' => true,
            'status' => 'active',
            'admission_start_date' => '',
            'admission_end_date' => '',
            'instructor_lead' => 'HAMBAK TECH & SERVICES Faculty',
            'certificate_issuer' => 'HAMBAK TECH & SERVICES DIGITAL TRAINING ACADEMY',
            'whatsapp_number' => '09155104724',
            'business_phone' => '08147837664',
            'office_phone' => '09127469686',
            'banner_url' => '',
        ];
    }

    public static function getSettings(Database $db): array
    {
        $defaults = self::getOfficialSettingsDefaults();
        try {
            $row = $db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "academy_settings"');
            if ($row && !empty($row['setting_value'])) {
                $saved = json_decode((string)$row['setting_value'], true);
                if (is_array($saved)) {
                    // Clean up Stage 1 placeholder email if untouched
                    if (($saved['contact_email'] ?? '') === 'academy@hambaktech.com.ng') {
                        unset($saved['contact_email']);
                    }
                    if (($saved['mentor_email'] ?? '') === 'academy@hambaktech.com.ng') {
                        unset($saved['mentor_email']);
                    }
                    return array_merge($defaults, $saved);
                }
            }
        } catch (Throwable) {
        }
        return $defaults;
    }

    public static function ensureSeeded(Database $db): void
    {
        // Remove Stage 1 placeholder fake courses cleanly if they exist and have no applications
        try {
            $db->execute('DELETE FROM academy_courses WHERE id IN ("crs_001", "crs_002", "crs_003")');
        } catch (Throwable) {
        }

        foreach (self::OFFICIAL_COURSES as $course) {
            try {
                $db->execute(
                    'INSERT IGNORE INTO academy_courses
                        (id, title, category, level, duration, modules_count, price, description, curriculum_outline, is_available, display_order, status)
                     VALUES
                        (:id, :title, :category, :level, :duration, :modules_count, :price, :description, :curriculum_outline, :is_available, :display_order, :status)',
                    $course
                );
            } catch (Throwable) {
            }
        }
    }

    public static function normalizeCourse(array $course): array
    {
        $course['modules_count'] = (int)($course['modules_count'] ?? 1);
        $course['price'] = ($course['price'] !== null && $course['price'] !== '') ? (float)$course['price'] : null;
        $course['is_available'] = isset($course['is_available']) ? (bool)$course['is_available'] : (($course['status'] ?? 'draft') !== 'draft');
        $course['display_order'] = (int)($course['display_order'] ?? 1);
        return $course;
    }

    public static function computeAge(string $dob): int
    {
        $birthDate = DateTimeImmutable::createFromFormat('Y-m-d', trim($dob));
        if (!$birthDate) {
            $ts = strtotime($dob);
            if ($ts === false) {
                return -1;
            }
            $birthDate = (new DateTimeImmutable())->setTimestamp($ts);
        }
        $today = new DateTimeImmutable('today');
        if ($birthDate > $today) {
            return -1;
        }
        return (int)$birthDate->diff($today)->y;
    }

    public const STATUS_PENDING = 'pending';
    public const STATUS_UNDER_REVIEW = 'under_review';
    public const STATUS_INFO_REQUESTED = 'information_requested';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_ENROLLED = 'enrolled';
    public const STATUS_WITHDRAWN = 'withdrawn';

    public const CANONICAL_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_UNDER_REVIEW,
        self::STATUS_INFO_REQUESTED,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
        self::STATUS_ENROLLED,
        self::STATUS_WITHDRAWN,
    ];

    public const ACTIVE_APPLICATION_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_UNDER_REVIEW,
        self::STATUS_INFO_REQUESTED,
        self::STATUS_APPROVED,
        self::STATUS_ENROLLED,
    ];

    public static function normalizeApplicationStatus(?string $status): string
    {
        $clean = strtolower(trim((string)$status));
        if ($clean === 'info_requested') {
            return self::STATUS_INFO_REQUESTED;
        }
        if (in_array($clean, self::CANONICAL_STATUSES, true)) {
            return $clean;
        }
        return self::STATUS_PENDING;
    }

    public static function canTransition(string $fromStatus, string $toStatus): bool
    {
        $from = self::normalizeApplicationStatus($fromStatus);
        $to = self::normalizeApplicationStatus($toStatus);
        if ($from === $to) {
            return false;
        }

        $matrix = [
            self::STATUS_PENDING => [
                self::STATUS_UNDER_REVIEW,
                self::STATUS_INFO_REQUESTED,
                self::STATUS_APPROVED,
                self::STATUS_REJECTED,
                self::STATUS_WITHDRAWN,
            ],
            self::STATUS_UNDER_REVIEW => [
                self::STATUS_INFO_REQUESTED,
                self::STATUS_APPROVED,
                self::STATUS_REJECTED,
                self::STATUS_WITHDRAWN,
            ],
            self::STATUS_INFO_REQUESTED => [
                self::STATUS_PENDING,
                self::STATUS_UNDER_REVIEW,
                self::STATUS_APPROVED,
                self::STATUS_REJECTED,
                self::STATUS_WITHDRAWN,
            ],
            self::STATUS_APPROVED => [
                self::STATUS_ENROLLED,
                self::STATUS_INFO_REQUESTED,
                self::STATUS_REJECTED,
                self::STATUS_WITHDRAWN,
            ],
            self::STATUS_ENROLLED => [
                self::STATUS_WITHDRAWN,
            ],
            self::STATUS_REJECTED => [
                self::STATUS_UNDER_REVIEW,
            ],
            self::STATUS_WITHDRAWN => [
                self::STATUS_UNDER_REVIEW,
            ],
        ];

        return in_array($to, $matrix[$from] ?? [], true);
    }

    public static function generateApplicationRef(Database $db): string
    {
        $year = date('Y');
        for ($i = 0; $i < 10; $i++) {
            $suffix = strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
            $ref = "HTDA-APP-{$year}-{$suffix}";
            $exists = $db->fetchOne('SELECT id FROM academy_applications WHERE application_ref = :ref', ['ref' => $ref]);
            if (!$exists) {
                return $ref;
            }
        }
        return 'HTDA-APP-' . $year . '-' . strtoupper(substr(Security::generateUuid(), 0, 6));
    }

    /**
     * Generates a monotonically increasing HTDA/YYYY/NNNN ID using MAX numeric suffix parsing (safe against deleted/withdrawn rows).
     */
    public static function generateStudentId(Database $db, string $prefix = 'HTDA'): string
    {
        $cleanPrefix = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $prefix) ?: 'HTDA');
        $year = date('Y');
        $likePattern = "{$cleanPrefix}/{$year}/%";

        $rows = $db->fetchAll(
            'SELECT student_id FROM academy_students WHERE student_id LIKE :pat',
            ['pat' => $likePattern]
        );

        $maxSeq = 0;
        foreach ($rows as $r) {
            $sid = (string)($r['student_id'] ?? '');
            $parts = explode('/', $sid);
            $last = end($parts);
            if ($last !== false && ctype_digit($last)) {
                $num = (int)$last;
                if ($num > $maxSeq) {
                    $maxSeq = $num;
                }
            }
        }

        $seq = $maxSeq + 1;
        while (true) {
            $candidate = sprintf('%s/%s/%04d', $cleanPrefix, $year, $seq);
            $exists = $db->fetchOne('SELECT id FROM academy_students WHERE student_id = :sid', ['sid' => $candidate]);
            if (!$exists) {
                return $candidate;
            }
            $seq++;
        }
    }

    public static function findActiveDuplicateApplication(
        Database $db,
        string $courseId,
        string $email,
        ?string $userId = null
    ): ?array {
        $cleanEmail = strtolower(trim($email));
        $placeholders = implode(',', array_fill(0, count(self::ACTIVE_APPLICATION_STATUSES), '?'));
        $params = array_merge([$courseId, $cleanEmail], self::ACTIVE_APPLICATION_STATUSES);

        $sql = "SELECT id, application_ref, status, course_id, user_id, created_at
                FROM academy_applications
                WHERE course_id = ?
                  AND LOWER(email) = ?
                  AND deleted_at IS NULL
                  AND status IN ({$placeholders})
                ORDER BY created_at DESC LIMIT 1";

        $row = $db->fetchOne($sql, $params);
        if ($row) {
            return $row;
        }

        if ($userId !== null && $userId !== '') {
            $params2 = array_merge([$courseId, $userId], self::ACTIVE_APPLICATION_STATUSES);
            $sql2 = "SELECT id, application_ref, status, course_id, user_id, created_at
                     FROM academy_applications
                     WHERE course_id = ?
                       AND user_id = ?
                       AND deleted_at IS NULL
                       AND status IN ({$placeholders})
                     ORDER BY created_at DESC LIMIT 1";
            return $db->fetchOne($sql2, $params2) ?: null;
        }

        return null;
    }

    public static function recordEvent(
        Database $db,
        string $applicationId,
        ?string $fromStatus,
        string $toStatus,
        string $action,
        ?array $actor = null,
        ?string $notes = null,
        array $metadata = []
    ): void {
        try {
            $db->execute(
                'INSERT INTO academy_application_events
                 (id, application_id, from_status, to_status, action, actor_user_id, actor_name, actor_role, notes, metadata_json, created_at)
                 VALUES (:id, :app_id, :from_st, :to_st, :act, :actor_id, :actor_name, :actor_role, :notes, :meta, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'app_id' => $applicationId,
                    'from_st' => $fromStatus !== null ? self::normalizeApplicationStatus($fromStatus) : null,
                    'to_st' => self::normalizeApplicationStatus($toStatus),
                    'act' => $action,
                    'actor_id' => $actor['id'] ?? null,
                    'actor_name' => (string)($actor['full_name'] ?? $actor['name'] ?? 'System'),
                    'actor_role' => strtolower((string)($actor['role'] ?? 'system')),
                    'notes' => $notes,
                    'meta' => !empty($metadata) ? json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null,
                ]
            );
        } catch (Throwable $e) {
            Security::logPrivateError('AcademyEventLog', $e, ['application_id' => $applicationId, 'action' => $action]);
        }
    }

    public static function getApplicationTimeline(Database $db, string $applicationId): array
    {
        try {
            $rows = $db->fetchAll(
                'SELECT id, application_id, from_status, to_status, action, actor_user_id, actor_name, actor_role, notes, metadata_json, created_at
                 FROM academy_application_events
                 WHERE application_id = :id
                 ORDER BY created_at ASC, id ASC',
                ['id' => $applicationId]
            );
            foreach ($rows as &$r) {
                if (isset($r['metadata_json']) && is_string($r['metadata_json'])) {
                    $dec = json_decode($r['metadata_json'], true);
                    $r['metadata'] = is_array($dec) ? $dec : null;
                } else {
                    $r['metadata'] = null;
                }
                unset($r['metadata_json']);
            }
            return $rows;
        } catch (Throwable) {
            return [];
        }
    }

    /**
     * Issues a single-use, expiring (48h) hashed account invitation for an applicant without an account.
     * Never creates, stores, or emails plaintext passwords.
     */
    public static function issueAccountInvitation(
        Database $db,
        string $applicationId,
        string $email,
        string $fullName,
        string $phone,
        string $applicationRef,
        string $courseTitle
    ): array {
        $cleanEmail = strtolower(trim($email));
        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $invId = Security::generateUuid();

        try {
            $db->execute(
                'UPDATE academy_account_invitations SET status = "revoked" WHERE LOWER(email) = :email AND status = "pending"',
                ['email' => $cleanEmail]
            );
            $db->execute(
                'INSERT INTO academy_account_invitations
                 (id, application_id, email, full_name, phone, token_hash, expires_at, status, created_at)
                 VALUES (:id, :app_id, :email, :name, :phone, :th, DATE_ADD(NOW(), INTERVAL 48 HOUR), "pending", NOW())',
                [
                    'id' => $invId,
                    'app_id' => $applicationId,
                    'email' => $cleanEmail,
                    'name' => $fullName,
                    'phone' => $phone,
                    'th' => $tokenHash,
                ]
            );
            $db->execute(
                'UPDATE academy_applications SET account_link_status = "invited" WHERE id = :id AND (user_id IS NULL OR user_id = "")',
                ['id' => $applicationId]
            );
        } catch (Throwable $e) {
            Security::logPrivateError('AcademyIssueInviteDB', $e, ['application_id' => $applicationId]);
            return ['issued' => false, 'sent' => false];
        }

        $sent = false;
        try {
            $mail = new MailService();
            $res = $mail->sendAcademyAccountInvitation($cleanEmail, $fullName, $applicationRef, $courseTitle, $rawToken, 48);
            $sent = !empty($res['sent']);
        } catch (Throwable $e) {
            Security::logPrivateError('AcademyIssueInviteMail', $e, ['application_id' => $applicationId]);
        }

        return [
            'issued' => true,
            'sent' => $sent,
            'expires_hours' => 48,
        ];
    }

    /**
     * Reconciles unlinked academy_applications and academy_students rows to a verified user account by email.
     * Safely upgrades role='customer' -> 'student' ONLY if an active enrolled student record exists.
     * Preserves all non-customer roles (agent, support, staff, manager, admin, superadmin).
     */
    public static function reconcileUserAcademyLinks(
        Database $db,
        string $userId,
        string $email,
        bool $emailVerified = true
    ): array {
        $linkedApps = 0;
        $linkedStudents = 0;
        $roleUpgraded = false;
        $cleanEmail = strtolower(trim($email));

        if ($userId === '' || $cleanEmail === '' || !$emailVerified) {
            return ['linked_applications' => 0, 'linked_students' => 0, 'role_upgraded' => false];
        }

        try {
            $unlinkedApps = $db->fetchAll(
                'SELECT id, status FROM academy_applications WHERE LOWER(email) = :email AND (user_id IS NULL OR user_id = "") AND deleted_at IS NULL',
                ['email' => $cleanEmail]
            );
            if (!empty($unlinkedApps)) {
                $db->execute(
                    'UPDATE academy_applications
                     SET user_id = :uid, account_link_status = "linked", updated_at = NOW()
                     WHERE LOWER(email) = :email AND (user_id IS NULL OR user_id = "") AND deleted_at IS NULL',
                    ['uid' => $userId, 'email' => $cleanEmail]
                );
                $linkedApps = count($unlinkedApps);
                foreach ($unlinkedApps as $ua) {
                    self::recordEvent(
                        $db,
                        (string)$ua['id'],
                        (string)$ua['status'],
                        (string)$ua['status'],
                        'account_reconciled',
                        ['id' => $userId, 'full_name' => $cleanEmail, 'role' => 'customer'],
                        'Application automatically linked upon verified account authentication.'
                    );
                }
            }

            $unlinkedStudents = $db->fetchAll(
                'SELECT id FROM academy_students WHERE LOWER(email) = :email AND (user_id IS NULL OR user_id = "") AND deleted_at IS NULL',
                ['email' => $cleanEmail]
            );
            if (!empty($unlinkedStudents)) {
                $db->execute(
                    'UPDATE academy_students
                     SET user_id = :uid, updated_at = NOW()
                     WHERE LOWER(email) = :email AND (user_id IS NULL OR user_id = "") AND deleted_at IS NULL',
                    ['uid' => $userId, 'email' => $cleanEmail]
                );
                $linkedStudents = count($unlinkedStudents);
            }

            $db->execute(
                'UPDATE academy_account_invitations
                 SET status = "accepted", used_at = COALESCE(used_at, NOW()), created_user_id = COALESCE(created_user_id, :uid)
                 WHERE LOWER(email) = :email AND status = "pending"',
                ['uid' => $userId, 'email' => $cleanEmail]
            );

            // Promote customer -> student ONLY if an active enrolled academy_students record exists
            $activeStudent = $db->fetchOne(
                'SELECT id FROM academy_students WHERE (user_id = :uid OR LOWER(email) = :email) AND academic_status = "active" AND deleted_at IS NULL LIMIT 1',
                ['uid' => $userId, 'email' => $cleanEmail]
            );
            if ($activeStudent) {
                $userRow = $db->fetchOne('SELECT role, assigned_dashboard FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
                $currRole = strtolower((string)($userRow['role'] ?? 'customer'));
                if ($currRole === 'customer') {
                    $db->execute(
                        'UPDATE users SET role = "student", assigned_dashboard = "student", updated_at = NOW() WHERE id = :id AND role = "customer"',
                        ['id' => $userId]
                    );
                    $roleUpgraded = true;
                }
            }
        } catch (Throwable $e) {
            Security::logPrivateError('AcademyReconcileLinks', $e, ['user_id' => $userId]);
        }

        return [
            'linked_applications' => $linkedApps,
            'linked_students' => $linkedStudents,
            'role_upgraded' => $roleUpgraded,
        ];
    }

    /**
     * Evaluates whether an approved application satisfies all Phase 1 enrollment prerequisites.
     */
    public static function evaluateEnrollmentRequirements(Database $db, array $application, ?array $course = null): array
    {
        $missing = [];
        $status = self::normalizeApplicationStatus((string)($application['status'] ?? 'pending'));
        if ($status !== self::STATUS_APPROVED) {
            $missing[] = 'Application must be in approved admission status first.';
        }

        if ($course && empty($course['is_available'])) {
            $missing[] = 'Selected training course is currently marked unavailable for new enrollment.';
        }

        $user = null;
        $userId = trim((string)($application['user_id'] ?? ''));
        if ($userId === '') {
            $missing[] = 'Applicant portal account is not yet created or linked.';
        } else {
            $user = $db->fetchOne(
                'SELECT id, email, full_name, role, assigned_dashboard, status, email_verified FROM users WHERE id = :id LIMIT 1',
                ['id' => $userId]
            ) ?: null;
            if (!$user) {
                $missing[] = 'Linked user account record could not be found.';
            } else {
                if (($user['status'] ?? 'active') !== 'active') {
                    $missing[] = 'Linked user account is suspended or inactive.';
                }
                if (empty($user['email_verified'])) {
                    $missing[] = 'Applicant email address must be verified before enrollment activation.';
                }
            }
        }

        foreach ([
            'full_name' => 'Full name',
            'email' => 'Email address',
            'phone' => 'Phone number',
            'date_of_birth' => 'Date of birth',
            'address' => 'Residential address',
            'state' => 'State',
            'lga' => 'LGA',
        ] as $field => $label) {
            if (trim((string)($application[$field] ?? '')) === '') {
                $missing[] = "{$label} is required.";
            }
        }

        $age = (int)($application['age_at_submission'] ?? 18);
        if ($age < 18) {
            if (trim((string)($application['guardian_name'] ?? '')) === '' ||
                trim((string)($application['guardian_phone'] ?? '')) === '' ||
                trim((string)($application['guardian_relationship'] ?? '')) === '') {
                $missing[] = 'Parent / Guardian details are mandatory for applicants under 18.';
            }
        }

        return [
            'met' => empty($missing),
            'missing' => $missing,
            'user' => $user,
        ];
    }

    public static function computeCustomerAccessSummary(array $user, array $applications, array $students): array
    {
        $role = strtolower((string)($user['role'] ?? 'customer'));
        $hasActiveStudent = false;
        $hasWithdrawnStudent = false;
        foreach ($students as $st) {
            $ast = strtolower((string)($st['academic_status'] ?? ''));
            if (in_array($ast, ['active', 'graduated'], true)) {
                $hasActiveStudent = true;
            } elseif ($ast === 'withdrawn') {
                $hasWithdrawnStudent = true;
            }
        }

        $hasApprovedApp = false;
        $hasActiveApp = false;
        $hasWithdrawnApp = false;
        foreach ($applications as $app) {
            $st = self::normalizeApplicationStatus((string)($app['status'] ?? ''));
            if ($st === self::STATUS_ENROLLED) {
                $hasActiveStudent = true;
            } elseif ($st === self::STATUS_APPROVED) {
                $hasApprovedApp = true;
            } elseif (in_array($st, [self::STATUS_PENDING, self::STATUS_UNDER_REVIEW, self::STATUS_INFO_REQUESTED], true)) {
                $hasActiveApp = true;
            } elseif ($st === self::STATUS_WITHDRAWN) {
                $hasWithdrawnApp = true;
            }
        }

        $accessLevel = 'none';
        if ($hasActiveStudent || $role === 'student') {
            $accessLevel = 'enrolled';
        } elseif ($hasApprovedApp) {
            $accessLevel = 'approved';
        } elseif ($hasActiveApp) {
            $accessLevel = 'applicant';
        } elseif ($hasWithdrawnStudent || $hasWithdrawnApp) {
            $accessLevel = 'withdrawn';
        }

        return [
            'access_level' => $accessLevel,
            'can_access_student_hub' => $hasActiveStudent || $role === 'student',
            'has_active_enrollment' => $hasActiveStudent,
            'has_approved_awaiting_enrollment' => $hasApprovedApp && !$hasActiveStudent,
        ];
    }
}

