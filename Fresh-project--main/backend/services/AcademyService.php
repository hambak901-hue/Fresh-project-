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

    public static function generateStudentId(Database $db, string $prefix = 'HTDA'): string
    {
        $cleanPrefix = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $prefix) ?: 'HTDA');
        $year = date('Y');
        $likePattern = "{$cleanPrefix}/{$year}/%";

        $row = $db->fetchOne(
            'SELECT COUNT(*) as total FROM academy_students WHERE student_id LIKE :pat',
            ['pat' => $likePattern]
        );
        $seq = (int)($row['total'] ?? 0) + 1;

        while (true) {
            $candidate = sprintf('%s/%s/%04d', $cleanPrefix, $year, $seq);
            $exists = $db->fetchOne('SELECT id FROM academy_students WHERE student_id = :sid', ['sid' => $candidate]);
            if (!$exists) {
                return $candidate;
            }
            $seq++;
        }
    }
}
