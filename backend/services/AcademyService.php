<?php
declare(strict_types=1);

namespace Hambak\Services;

use Hambak\Core\Database;
use InvalidArgumentException;
use PDO;

/**
 * Digital Training Academy Service
 */
class AcademyService
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function getCourses(): array
    {
        $stmt = $this->db->getConnection()->query(
            'SELECT `id`, `code`, `title`, `title` AS `name`, `slug`, `category`,
                    `description`, `description` AS `shortDescription`, `description` AS `fullDescription`,
                    `durationMonths`, (`durationMonths` * 4) AS `durationWeeks`,
                    `tuitionFeeKobo`, 0 AS `registrationFeeKobo`,
                    `difficultyLevel`, `learningOutcomes`, `requirements`, `modulesJson`, `status`
             FROM `Course`
             WHERE `status` = \'published\'
             ORDER BY `title` ASC'
        );
        $courses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($courses as &$c) {
            $c['tuitionFeeKobo'] = (int)$c['tuitionFeeKobo'];
            $c['registrationFeeKobo'] = (int)$c['registrationFeeKobo'];
            $c['learningOutcomes'] = is_string($c['learningOutcomes']) ? json_decode($c['learningOutcomes'], true) : ($c['learningOutcomes'] ?? []);
            $c['requirements'] = is_string($c['requirements']) ? json_decode($c['requirements'], true) : ($c['requirements'] ?? []);
            $c['modulesJson'] = is_string($c['modulesJson']) ? json_decode($c['modulesJson'], true) : ($c['modulesJson'] ?? []);
        }

        return $courses;
    }

    public function submitApplication(array $data, ?string $userId = null): array
    {
        $fullName = trim($data['fullName'] ?? $data['applicantName'] ?? '');
        $email = strtolower(trim($data['email'] ?? $data['contactEmail'] ?? ''));
        $phoneNumber = trim($data['phoneNumber'] ?? $data['contactPhone'] ?? '');
        $courseId = trim($data['courseId'] ?? '');

        if (empty($fullName) || empty($email) || empty($courseId)) {
            throw new InvalidArgumentException('Full name, email, and target course are required');
        }

        $appId = 'adm-' . bin2hex(random_bytes(16));
        $appNumber = 'ADM-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $conn = $this->db->getConnection();

        if (!$userId) {
            $uStmt = $conn->prepare('SELECT `id` FROM `User` WHERE `email` = :email LIMIT 1');
            $uStmt->execute([':email' => $email]);
            $userId = $uStmt->fetchColumn();

            if (!$userId) {
                $userId = 'usr-' . bin2hex(random_bytes(16));
                $parts = explode(' ', $fullName, 2);
                $fn = $parts[0] ?? 'Applicant';
                $ln = $parts[1] ?? 'Student';
                $hash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
                $insUser = $conn->prepare(
                    'INSERT INTO `User` (`id`, `email`, `passwordHash`, `firstName`, `lastName`, `phoneNumber`, `status`, `twoFactorEnabled`, `emailVerified`, `phoneVerified`, `isActive`, `createdAt`, `updatedAt`)
                     VALUES (:id, :email, :hash, :fn, :ln, :phone, \'ACTIVE\', 0, 0, 0, 1, NOW(3), NOW(3))'
                );
                $insUser->execute([
                    ':id'    => $userId,
                    ':email' => $email,
                    ':hash'  => $hash,
                    ':fn'    => $fn,
                    ':ln'    => $ln,
                    ':phone' => $phoneNumber ?: '08000000000',
                ]);
            }
        }

        $stmt = $conn->prepare(
            'INSERT INTO `AcademyAdmissionApplication` (
                `id`, `applicationNumber`, `userId`, `courseId`, `fullName`, `email`, `phoneNumber`,
                `gender`, `dateOfBirth`, `residentialAddress`, `stateOfOrigin`, `lgaOfOrigin`,
                `highestQualification`, `institutionName`, `studyMode`, `preferredSchedule`,
                `emergencyContactName`, `emergencyPhone`, `referralSource`, `applicantSignature`,
                `status`, `createdAt`, `updatedAt`
            ) VALUES (
                :id, :appNum, :userId, :courseId, :fullName, :email, :phoneNumber,
                :gender, :dob, :address, :state, :lga,
                :qualification, :institution, :studyMode, :preferredSchedule,
                :emergencyName, :emergencyPhone, :referral, :signature,
                \'submitted\', NOW(3), NOW(3)
            )'
        );

        $stmt->execute([
            ':id'                => $appId,
            ':appNum'            => $appNumber,
            ':userId'            => $userId,
            ':courseId'          => $courseId,
            ':fullName'          => $fullName,
            ':email'             => $email,
            ':phoneNumber'       => $phoneNumber ?: '08000000000',
            ':gender'            => $data['gender'] ?? 'unspecified',
            ':dob'               => $data['dateOfBirth'] ?? '2000-01-01 00:00:00',
            ':address'           => $data['residentialAddress'] ?? 'Yola, Adamawa State',
            ':state'             => $data['stateOfOrigin'] ?? 'Adamawa',
            ':lga'               => $data['lgaOfOrigin'] ?? 'Yola North',
            ':qualification'     => $data['highestQualification'] ?? $data['educationLevel'] ?? 'Secondary School Certificate',
            ':institution'       => $data['institutionName'] ?? 'Hambak Academy',
            ':studyMode'         => $data['studyMode'] ?? 'hybrid',
            ':preferredSchedule' => $data['preferredSchedule'] ?? 'weekend',
            ':emergencyName'     => $data['emergencyContactName'] ?? $fullName,
            ':emergencyPhone'    => $data['emergencyPhone'] ?? ($phoneNumber ?: '08000000000'),
            ':referral'          => $data['referralSource'] ?? 'website',
            ':signature'         => $data['applicantSignature'] ?? $fullName,
        ]);

        return [
            'applicationId'     => $appId,
            'applicationNumber' => $appNumber,
            'status'            => 'submitted',
            'message'           => 'Admission application successfully submitted for review.',
        ];
    }
}
