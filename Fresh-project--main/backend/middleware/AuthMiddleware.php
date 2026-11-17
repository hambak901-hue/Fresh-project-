<?php
declare(strict_types=1);

namespace Hambak\Middleware;

use Hambak\Core\Auth;
use Hambak\Core\Request;
use Hambak\Core\Response;

/**
 * Authentication and RBAC Authorization Middleware
 */
class AuthMiddleware
{
    private static ?array $currentUser = null;

    public static function getCurrentUser(): ?array
    {
        return self::$currentUser;
    }

    public static function requireAuth(Request $request): void
    {
        $auth = new Auth();
        $token = $request->getAuthToken();

        if (empty($token)) {
            Response::unauthorized('Authentication token or session cookie required');
        }

        $user = $auth->getUserFromToken($token);
        if (!$user) {
            Response::unauthorized('Invalid or expired session');
        }

        if ($user['status'] !== 'ACTIVE') {
            Response::forbidden('Your account is currently ' . strtolower($user['status']));
        }

        self::$currentUser = $user;
    }

    public static function requirePermission(string $action): callable
    {
        return function (Request $request) use ($action) {
            self::requireAuth($request);
            $user = self::$currentUser;

            $normalizedRoles = array_map(function ($r) {
                return strtoupper(str_replace(['-', ' '], '_', (string)$r));
            }, $user['roles'] ?? []);
            if (!empty($user['role'])) {
                $normalizedRoles[] = strtoupper(str_replace(['-', ' '], '_', (string)$user['role']));
            }

            // SUPER_ADMIN has global bypass
            if (in_array('SUPER_ADMIN', $normalizedRoles, true) || in_array('SUPERADMIN', $normalizedRoles, true)) {
                return;
            }

            if (!in_array($action, $user['permissions'] ?? [], true)) {
                Response::forbidden("Missing required permission: {$action}");
            }
        };
    }

    public static function isSuperAdmin(?array $user = null): bool
    {
        $targetUser = $user ?? self::$currentUser;
        if (!$targetUser) {
            return false;
        }

        $normalizedRoles = array_map(function ($r) {
            return strtoupper(str_replace(['-', ' '], '_', (string)$r));
        }, $targetUser['roles'] ?? []);
        if (!empty($targetUser['role'])) {
            $normalizedRoles[] = strtoupper(str_replace(['-', ' '], '_', (string)$targetUser['role']));
        }

        return in_array('SUPER_ADMIN', $normalizedRoles, true) || in_array('SUPERADMIN', $normalizedRoles, true);
    }

    public static function isAdmin(?array $user = null): bool
    {
        $targetUser = $user ?? self::$currentUser;
        if (!$targetUser) {
            return false;
        }

        $normalizedRoles = array_map(function ($r) {
            return strtoupper(str_replace(['-', ' '], '_', (string)$r));
        }, $targetUser['roles'] ?? []);
        if (!empty($targetUser['role'])) {
            $normalizedRoles[] = strtoupper(str_replace(['-', ' '], '_', (string)$targetUser['role']));
        }

        return in_array('ADMIN', $normalizedRoles, true) || self::isSuperAdmin($targetUser);
    }

    /**
     * Strictly requires SUPER_ADMIN authority. ADMIN or other roles are rejected.
     */
    public static function requireSuperAdmin(?Request $request = null): void
    {
        if (self::$currentUser === null) {
            $req = $request ?? new Request();
            self::requireAuth($req);
        }

        if (!self::isSuperAdmin()) {
            $user = self::$currentUser;
            $req = $request ?? new Request();
            // Audit unauthorized privileged access attempt
            \Hambak\Services\AuditService::getInstance()->logSecurityEvent(
                'UNAUTHORIZED_SUPER_ADMIN_ACCESS_ATTEMPT',
                'HIGH',
                $user['id'] ?? null,
                [
                    'email'        => $user['email'] ?? 'unknown',
                    'attemptedUri' => $_SERVER['REQUEST_URI'] ?? '',
                    'method'       => $_SERVER['REQUEST_METHOD'] ?? '',
                    'currentRoles' => $user['roles'] ?? [],
                ],
                $req->getClientIp() ?: '127.0.0.1',
                $req->getUserAgent() ?: 'Unknown'
            );

            Response::forbidden('Access restricted to SUPER_ADMIN authority');
        }
    }

    public static function requireRole(string|array $role, ?Request $request = null): void
    {
        if (self::$currentUser === null) {
            $req = $request ?? new Request();
            self::requireAuth($req);
        }

        $user = self::$currentUser;
        $normalizedRoles = array_map(function ($r) {
            return strtoupper(str_replace(['-', ' '], '_', (string)$r));
        }, $user['roles'] ?? []);
        if (!empty($user['role'])) {
            $normalizedRoles[] = strtoupper(str_replace(['-', ' '], '_', (string)$user['role']));
        }

        // SUPER_ADMIN has global bypass
        if (in_array('SUPER_ADMIN', $normalizedRoles, true) || in_array('SUPERADMIN', $normalizedRoles, true)) {
            return;
        }

        $allowedRoles = is_array($role) ? $role : [$role];
        $normalizedAllowed = array_map(function ($r) {
            return strtoupper(str_replace(['-', ' '], '_', (string)$r));
        }, $allowedRoles);

        $matched = array_intersect($normalizedAllowed, $normalizedRoles);

        if (empty($matched)) {
            $roleStr = implode(', ', $allowedRoles);
            Response::forbidden("Access restricted to [{$roleStr}] role");
        }
    }
}
