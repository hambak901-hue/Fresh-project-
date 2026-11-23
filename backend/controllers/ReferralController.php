<?php
/**
 * @file ReferralController.php
 * Referral & Rewards Engine, Transaction PIN Governance, MFA & Session Security Controller
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\SchemaSync;
use HambakTech\Core\Security;
use HambakTech\Services\FootprintService;
use HambakTech\Services\MailService;
use HambakTech\Services\MfaService;
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\ReferralEngineService;
use RuntimeException;
use Throwable;

class ReferralController
{
    private Database $db;
    private ReferralEngineService $referrals;
    private PinSecurityService $pins;
    private MfaService $mfa;

    public function __construct()
    {
        $this->db = Database::getInstance();
        SchemaSync::syncSecurityAndReferralSchema($this->db);
        $this->referrals = new ReferralEngineService($this->db);
        $this->pins = new PinSecurityService($this->db);
        $this->mfa = new MfaService($this->db);
    }

    // =========================================================================
    // 1. PUBLIC & CUSTOMER REFERRAL ENDPOINTS
    // =========================================================================

    /**
     * GET /api/referrals/public-config
     */
    public function publicConfig(Request $request): void
    {
        Response::success([
            'program' => $this->referrals->getPublicConfig(),
            'pin_policy' => $this->pins->getPublicPolicy(),
        ]);
    }

    /**
     * GET /api/referrals/validate-code?code=...
     */
    public function validateCode(Request $request): void
    {
        $code = trim((string)($request->query('code') ?? $request->input('code', '')));
        $currentUser = Auth::user($request);
        $res = $this->referrals->validateCodePreview($code, $currentUser['id'] ?? null);
        if (!$res['valid']) {
            Response::error($res['message'], 404, $res);
        }
        Response::success($res);
    }

    /**
     * GET /api/referrals/dashboard
     */
    public function dashboard(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $data = $this->referrals->getCustomerDashboard((string)$user['id']);
        $data['pin_policy'] = $this->pins->getPublicPolicy();
        Response::success($data);
    }

    /**
     * POST /api/referrals/convert-to-wallet
     */
    public function convertToWallet(Request $request): void
    {
        $user = Auth::requireVerifiedEmail($request);
        $body = $request->getBody();

        // Mandatory PIN verification gate
        $this->pins->requireValidPin($user, $body, 'referral_wallet_conversion', 'referral_wallet_conversion');

        $amount = (float)($body['amount'] ?? 0);
        $idempotencyKey = trim((string)($request->header('x-idempotency-key') ?? $body['idempotency_key'] ?? ''));

        try {
            $res = $this->referrals->convertEarningsToWallet(
                (string)$user['id'],
                $amount,
                $idempotencyKey,
                $request->getIp()
            );
            Response::success($res, 'Referral earnings converted to main wallet successfully.');
        } catch (Throwable $e) {
            Security::logPrivateError('ReferralConvertToWallet', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to convert referral earnings right now.'), 422);
        }
    }

    /**
     * POST /api/referrals/convert-points
     */
    public function convertPoints(Request $request): void
    {
        $user = Auth::requireVerifiedEmail($request);
        $body = $request->getBody();

        // Mandatory PIN verification gate
        $this->pins->requireValidPin($user, $body, 'referral_wallet_conversion', 'referral_points_conversion');

        $points = (int)($body['points'] ?? 0);

        try {
            $res = $this->referrals->convertPointsToWallet(
                (string)$user['id'],
                $points,
                $request->getIp()
            );
            Response::success($res, 'Loyalty points converted to main wallet successfully.');
        } catch (Throwable $e) {
            Security::logPrivateError('ReferralConvertPoints', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to convert loyalty points right now.'), 422);
        }
    }

    /**
     * GET /api/referrals/withdrawals
     */
    public function listWithdrawals(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $rows = $this->db->fetchAll(
            'SELECT id, withdrawal_number, gross_amount, fee_amount, net_amount, bank_name, account_number, account_name,
                    status, admin_note, rejection_reason, payment_reference, reviewed_at, paid_at, created_at
             FROM referral_withdrawals
             WHERE user_id = :uid
             ORDER BY created_at DESC
             LIMIT 100',
            ['uid' => $user['id']]
        );
        Response::success(['withdrawals' => $rows]);
    }

    /**
     * POST /api/referrals/withdrawals
     */
    public function requestWithdrawal(Request $request): void
    {
        $user = Auth::requireVerifiedEmail($request);
        $body = $request->getBody();

        // Mandatory PIN verification gate
        $this->pins->requireValidPin($user, $body, 'referral_withdrawal', 'referral_withdrawal');

        try {
            $res = $this->referrals->requestWithdrawal((string)$user['id'], $body, $request->getIp());
            Response::success($res, 'Withdrawal request submitted and queued for administrator review.', 201);
        } catch (Throwable $e) {
            Security::logPrivateError('ReferralRequestWithdrawal', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to submit withdrawal request right now.'), 422);
        }
    }

    /**
     * POST /api/referrals/withdrawals/:id/cancel
     */
    public function cancelWithdrawal(Request $request, array $params = []): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));
        if ($id === '') {
            Response::error('Withdrawal ID is required.', 422);
        }
        try {
            $res = $this->referrals->cancelCustomerWithdrawal((string)$user['id'], $id, $request->getIp());
            Response::success($res, 'Withdrawal request cancelled and funds restored to referral balance.');
        } catch (Throwable $e) {
            Security::logPrivateError('ReferralCancelWithdrawal', $e, ['user_id' => $user['id'] ?? null, 'withdrawal_id' => $id]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to cancel withdrawal request right now.'), 422);
        }
    }

    // =========================================================================
    // 2. PIN POLICY, OTP RESET, SESSION & MFA ENDPOINTS
    // =========================================================================

    /**
     * GET /api/auth/pin-policy
     */
    public function publicPinPolicy(Request $request): void
    {
        $policy = $this->pins->getPublicPolicy();
        $user = Auth::user($request);
        Response::success([
            'pin_policy' => $policy,
            'has_transaction_pin' => $user ? (bool)($user['has_transaction_pin'] ?? false) : false,
            'pin_is_locked' => $user ? (bool)($user['pin_is_locked'] ?? false) : false,
            'pin_locked_until' => $user['pin_locked_until'] ?? null,
        ]);
    }

    /**
     * POST /api/auth/pin/request-otp
     */
    public function requestPinResetOtp(Request $request): void
    {
        $user = Auth::requireAuth($request);
        try {
            $res = $this->pins->requestOtpReset((string)$user['id'], $request->getIp());
            Response::success($res, 'A 6-digit PIN reset verification code has been dispatched to your registered email.');
        } catch (Throwable $e) {
            Security::logPrivateError('PinRequestOtpReset', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to send PIN reset verification code right now.'), 422);
        }
    }

    /**
     * POST /api/auth/pin/reset-otp
     */
    public function confirmPinResetOtp(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $otp = trim((string)($request->input('otp_code') ?? $request->input('otp') ?? ''));
        $newPin = trim((string)($request->input('new_pin') ?? $request->input('pin') ?? ''));

        try {
            $res = $this->pins->confirmOtpReset((string)$user['id'], $otp, $newPin);
            Response::success($res, 'Transaction PIN reset successfully.');
        } catch (Throwable $e) {
            Security::logPrivateError('PinConfirmOtpReset', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to reset transaction PIN right now.'), 422);
        }
    }

    /**
     * POST /api/auth/logout
     */
    public function logout(Request $request): void
    {
        $payload = Auth::currentPayload($request);
        if ($payload && !empty($payload['jti'])) {
            Auth::revokeSessionByJti((string)$payload['jti'], 'user_logout');
            if (!empty($payload['sub'])) {
                FootprintService::record(
                    'auth',
                    'USER_LOGOUT',
                    ['id' => $payload['sub'], 'email' => $payload['email'] ?? null],
                    null,
                    null,
                    null,
                    'successful',
                    null,
                    null,
                    ['jti' => $payload['jti']],
                    $request->getIp()
                );
            }
        }
        Response::success(['logged_out' => true], 'Session terminated securely.');
    }

    /**
     * POST /api/auth/logout-all
     */
    public function logoutAll(Request $request): void
    {
        $user = Auth::requireAuth($request);
        Auth::revokeAllUserSessions((string)$user['id'], 'user_logout_all', true);
        FootprintService::record(
            'security',
            'USER_LOGOUT_ALL_SESSIONS',
            $user,
            null,
            null,
            null,
            'successful',
            null,
            null,
            [],
            $request->getIp()
        );
        Response::success(['revoked_all' => true], 'All active sessions on all devices have been revoked.');
    }

    /**
     * GET /api/auth/sessions
     */
    public function listSessions(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $payload = Auth::currentPayload($request);
        $currentJti = (string)($payload['jti'] ?? '');

        $rows = $this->db->fetchAll(
            'SELECT id, jti, ip_address, device_label, is_revoked, revoked_reason, expires_at, last_seen_at, created_at
             FROM user_sessions
             WHERE user_id = :uid AND is_revoked = 0 AND expires_at > NOW()
             ORDER BY last_seen_at DESC
             LIMIT 30',
            ['uid' => $user['id']]
        );

        $sessions = [];
        foreach ($rows as $r) {
            $sessions[] = [
                'id' => $r['id'],
                'ip_address' => $r['ip_address'],
                'device_label' => $r['device_label'],
                'is_current' => $currentJti !== '' && hash_equals($currentJti, (string)$r['jti']),
                'last_seen_at' => $r['last_seen_at'],
                'expires_at' => $r['expires_at'],
                'created_at' => $r['created_at'],
            ];
        }

        Response::success(['sessions' => $sessions]);
    }

    /**
     * DELETE /api/auth/sessions/:id
     */
    public function revokeOwnSession(Request $request, array $params = []): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));
        if ($id === '') {
            Response::error('Session ID is required.', 422);
        }

        $row = $this->db->fetchOne(
            'SELECT id, jti FROM user_sessions WHERE id = :id AND user_id = :uid LIMIT 1',
            ['id' => $id, 'uid' => $user['id']]
        );
        if (!$row) {
            Response::notFound('Session not found.');
        }
        Auth::revokeSessionByJti((string)$row['jti'], 'user_revoked_device');
        Response::success(['revoked_id' => $id], 'Device session revoked.');
    }

    /**
     * GET /api/auth/mfa/status
     */
    public function mfaStatus(Request $request): void
    {
        $user = Auth::requireAuth($request);
        Response::success([
            'mfa' => $this->mfa->getStatus((string)$user['id']),
            'policy' => $this->mfa->getPolicy(),
        ]);
    }

    /**
     * POST /api/auth/mfa/verify
     */
    public function verifyMfaChallenge(Request $request): void
    {
        $challengeToken = trim((string)$request->input('challenge_token', ''));
        $code = trim((string)($request->input('code') ?? $request->input('otp') ?? ''));

        try {
            $res = $this->mfa->verifyChallenge($challengeToken, $code);
            $user = $this->loadFullUserForToken((string)$res['user_id']);
            if (!$user || ($user['status'] ?? 'active') !== 'active') {
                Response::forbidden('Account is not active.');
            }
            if (!empty($user['email']) && !empty($user['email_verified'])) {
                try {
                    $reconciled = \HambakTech\Services\AcademyService::reconcileUserAcademyLinks(
                        $this->db,
                        (string)$user['id'],
                        (string)$user['email'],
                        true
                    );
                    if (!empty($reconciled['role_upgraded'])) {
                        $reloaded = $this->loadFullUserForToken((string)$user['id']);
                        if ($reloaded) {
                            $user = $reloaded;
                        }
                    }
                } catch (Throwable) {
                }
            }
            $this->db->execute('UPDATE users SET last_login_at = NOW(), last_login_ip = :ip WHERE id = :id', [
                'ip' => $request->getIp(),
                'id' => $user['id'],
            ]);
            $token = Auth::generateToken($user, $request);
            $safeUser = $this->sanitizeAuthUser($user);

            FootprintService::record(
                'auth',
                'MFA_VERIFIED_LOGIN',
                ['id' => $safeUser['id'], 'email' => $safeUser['email'], 'full_name' => $safeUser['full_name']],
                null,
                null,
                null,
                'successful',
                null,
                null,
                ['method' => $res['method'], 'recovery_used' => $res['used_recovery_code']],
                $request->getIp()
            );

            Response::success([
                'user' => $safeUser,
                'token' => $token,
                'pin_policy' => $this->pins->getPublicPolicy(),
            ], 'Multi-factor authentication verified.');
        } catch (Throwable $e) {
            Security::logPrivateError('MfaVerifyChallenge', $e);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Invalid or expired verification code.'), 401);
        }
    }

    /**
     * POST /api/auth/mfa/totp/setup
     */
    public function beginTotpSetup(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $setup = $this->mfa->beginTotpSetup((string)$user['id'], (string)$user['email']);
        Response::success($setup, 'Scan the authenticator QR/key in Google Authenticator or Authy and enter a 6-digit code to activate.');
    }

    /**
     * POST /api/auth/mfa/totp/confirm
     */
    public function confirmTotpSetup(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $code = trim((string)$request->input('code', ''));
        try {
            $res = $this->mfa->confirmTotpSetup((string)$user['id'], $code);
            FootprintService::record('security', 'MFA_TOTP_ENABLED', $user, null, null, null, 'successful', null, null, [], $request->getIp());
            Response::success($res, 'Authenticator app MFA activated. Store your recovery codes in a safe place.');
        } catch (Throwable $e) {
            Security::logPrivateError('MfaConfirmTotp', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to activate authenticator MFA right now.'), 422);
        }
    }

    /**
     * POST /api/auth/mfa/email
     */
    public function setEmailMfa(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $enabled = (bool)$request->input('enabled', true);
        try {
            $res = $this->mfa->setEmailOtpEnabled((string)$user['id'], $enabled);
            FootprintService::record('security', $enabled ? 'MFA_EMAIL_ENABLED' : 'MFA_EMAIL_DISABLED', $user, null, null, null, 'successful', null, null, [], $request->getIp());
            Response::success($res, $enabled ? 'Email OTP two-factor authentication enabled.' : 'Email OTP two-factor authentication disabled.');
        } catch (Throwable $e) {
            Security::logPrivateError('MfaSetEmail', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to update email two-factor authentication right now.'), 422);
        }
    }

    /**
     * POST /api/auth/mfa/disable
     */
    public function disableMfa(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $password = (string)$request->input('password', '');
        $row = $this->db->fetchOne('SELECT password_hash FROM users WHERE id = :id LIMIT 1', ['id' => $user['id']]);
        if (!$row || !Security::verifyPassword($password, (string)$row['password_hash'], (string)$user['email'])) {
            Response::error('Valid account password is required to disable MFA.', 401);
        }
        try {
            $res = $this->mfa->disableAllMfa((string)$user['id']);
            FootprintService::record('security', 'MFA_DISABLED', $user, null, null, null, 'successful', null, null, [], $request->getIp());
            Response::success($res, 'Two-factor authentication disabled.');
        } catch (Throwable $e) {
            Security::logPrivateError('MfaDisable', $e, ['user_id' => $user['id'] ?? null]);
            Response::error(Security::sanitizeCustomerError($e->getMessage(), 'Unable to disable two-factor authentication right now.'), 403);
        }
    }

    // =========================================================================
    // 3. ADMIN & SUPER ADMIN REFERRAL MANAGEMENT ENDPOINTS
    // =========================================================================

    /**
     * GET /api/admin/referrals/overview
     */
    public function adminOverview(Request $request): void
    {
        Auth::requirePermission($request, 'referrals');
        $this->referrals->settleMatureRewards(null);

        $config = $this->referrals->getConfig();
        $campaigns = $this->db->fetchAll('SELECT * FROM referral_campaigns ORDER BY created_at DESC');
        $tiers = $this->db->fetchAll('SELECT * FROM referral_tiers ORDER BY min_qualified_referrals ASC');

        $referrals = $this->db->fetchAll(
            'SELECT r.*,
                    ref_u.full_name AS referrer_name, ref_u.email AS referrer_email, ref_u.referral_code AS referrer_code,
                    du.full_name AS referred_name, du.email AS referred_email, du.phone_number AS referred_phone,
                    du.kyc_level AS referred_kyc_level, du.created_at AS referred_created_at
             FROM referrals r
             LEFT JOIN users ref_u ON ref_u.id = r.referrer_user_id
             LEFT JOIN users du ON du.id = r.referred_user_id
             ORDER BY r.created_at DESC
             LIMIT 100'
        );

        $rewards = $this->db->fetchAll(
            'SELECT rw.*,
                    ref_u.full_name AS referrer_name, ref_u.email AS referrer_email,
                    du.full_name AS referred_name, du.email AS referred_email
             FROM referral_rewards rw
             LEFT JOIN users ref_u ON ref_u.id = rw.referrer_user_id
             LEFT JOIN users du ON du.id = rw.referred_user_id
             ORDER BY rw.created_at DESC
             LIMIT 100'
        );

        $auditLogs = $this->db->fetchAll(
            'SELECT * FROM referral_audit_logs ORDER BY created_at DESC LIMIT 60'
        );

        $report = $this->referrals->getReferralGrowthReport([
            'start_date' => (string)$request->query('date_from', $request->query('start_date', '')),
            'end_date' => (string)$request->query('date_to', $request->query('end_date', '')),
        ]);

        Response::success([
            'config' => $config,
            'campaigns' => $campaigns,
            'tiers' => $tiers,
            'referrals' => $referrals,
            'rewards' => $rewards,
            'audit_logs' => $auditLogs,
            'report' => $report,
        ]);
    }

    /**
     * GET / PUT /api/admin/referrals/config
     */
    public function adminConfig(Request $request): void
    {
        if ($request->getMethod() === 'GET') {
            Auth::requirePermission($request, 'referrals');
            Response::success(['config' => $this->referrals->getConfig()]);
            return;
        }

        // Only Super Admin may alter live reward rules, margins, caps, or withdrawal policy
        $super = Auth::requireSuperAdmin($request);
        $body = $request->getBody();
        $current = $this->referrals->getConfig();

        $allowedKeys = array_keys($current);
        $merged = $current;
        foreach ($allowedKeys as $key) {
            if (array_key_exists($key, $body)) {
                $merged[$key] = $body[$key];
            }
        }
        if (isset($body['qualifying_services']) && is_array($body['qualifying_services'])) {
            $merged['qualifying_services'] = array_merge($current['qualifying_services'], array_map('boolval', $body['qualifying_services']));
        }

        // Clamp critical numeric bounds before persisting
        $merged['trigger_mode'] = ReferralEngineService::normalizeTriggerMode((string)($merged['trigger_mode'] ?? 'first_qualifying_transaction'));
        $merged['code_prefix'] = preg_replace('/[^A-Z0-9]/', '', strtoupper((string)($merged['code_prefix'] ?? 'HAMBAK'))) ?: 'HAMBAK';
        $merged['code_length'] = max(4, min(10, (int)($merged['code_length'] ?? 6)));
        $merged['flat_reward_naira'] = max(0.0, min(10000.0, (float)($merged['flat_reward_naira'] ?? 100)));
        $merged['percent_of_spend'] = max(0.0, min(25.0, (float)($merged['percent_of_spend'] ?? 1.5)));
        $merged['percent_of_margin'] = max(0.0, min(80.0, (float)($merged['percent_of_margin'] ?? 15)));
        $merged['point_value_naira'] = max(0.01, min(100.0, (float)($merged['point_value_naira'] ?? 1)));
        $merged['min_qualifying_spend'] = max(0.0, (float)($merged['min_qualifying_spend'] ?? 500));
        $merged['min_net_margin_naira'] = max(0.0, (float)($merged['min_net_margin_naira'] ?? 10));
        $merged['settlement_hold_hours'] = max(0, min(720, (int)($merged['settlement_hold_hours'] ?? 24)));
        $merged['monthly_reward_cap_naira'] = max(0.0, (float)($merged['monthly_reward_cap_naira'] ?? 50000));
        $merged['max_rewards_per_referee'] = max(1, min(100, (int)($merged['max_rewards_per_referee'] ?? 1)));
        $merged['min_wallet_conversion_naira'] = max(50.0, (float)($merged['min_wallet_conversion_naira'] ?? 500));
        $merged['min_points_conversion'] = max(1, (int)($merged['min_points_conversion'] ?? 100));
        $merged['min_withdrawal_naira'] = max(500.0, (float)($merged['min_withdrawal_naira'] ?? 2000));
        $merged['max_withdrawal_naira'] = max((float)$merged['min_withdrawal_naira'], (float)($merged['max_withdrawal_naira'] ?? 100000));
        $merged['daily_withdrawal_limit_naira'] = max((float)$merged['max_withdrawal_naira'], (float)($merged['daily_withdrawal_limit_naira'] ?? 100000));
        $merged['withdrawal_fee_value'] = max(0.0, (float)($merged['withdrawal_fee_value'] ?? 50));
        $merged['require_kyc_level_for_withdrawal'] = max(1, min(3, (int)($merged['require_kyc_level_for_withdrawal'] ?? 1)));
        $merged['max_signups_per_ip_24h'] = max(1, min(25, (int)($merged['max_signups_per_ip_24h'] ?? 3)));

        $json = json_encode($merged, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES (:id, "referral_settings", :val, "referral", "Master Referral Program Rules", NOW())
             ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
            ['id' => Security::generateUuid(), 'val' => $json, 'val2' => $json]
        );

        $this->referrals->logAudit(
            (string)$super['id'],
            (string)$super['email'],
            null,
            'REFERRAL_CONFIG_UPDATED',
            'system_settings',
            'referral_settings',
            ['reward_mode' => $merged['reward_mode'], 'enabled' => $merged['enabled']]
        );

        Response::success(['config' => $this->referrals->getConfig()], 'Referral program configuration saved and applied.');
    }

    /**
     * GET / POST / PUT / DELETE /api/admin/referrals/campaigns
     */
    public function adminCampaigns(Request $request, array $params = []): void
    {
        $method = $request->getMethod();
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));

        if ($method === 'GET') {
            Auth::requirePermission($request, 'referrals');
            $rows = $this->db->fetchAll('SELECT * FROM referral_campaigns ORDER BY created_at DESC');
            Response::success(['campaigns' => $rows]);
            return;
        }

        $super = Auth::requireSuperAdmin($request);

        if ($method === 'DELETE' && $id !== '') {
            $this->db->execute('DELETE FROM referral_campaigns WHERE id = :id', ['id' => $id]);
            $this->referrals->logAudit((string)$super['id'], (string)$super['email'], null, 'CAMPAIGN_DELETED', 'campaign', $id, []);
            Response::success(['deleted_id' => $id], 'Campaign removed.');
            return;
        }

        $body = $request->getBody();
        $name = trim((string)($body['name'] ?? ''));
        $code = preg_replace('/[^A-Z0-9_-]/', '', strtoupper(trim((string)($body['campaign_code'] ?? ''))));
        if ($name === '' || $code === '') {
            Response::error('Campaign name and campaign code are required.', 422);
        }

        $rewardMode = in_array($body['reward_mode'] ?? 'fixed', ['fixed', 'percent_of_spend', 'percent_of_margin', 'points'], true)
            ? (string)$body['reward_mode']
            : 'fixed';
        $rewardVal = max(0.0, (float)($body['reward_value'] ?? 0));
        $pointsBonus = max(0, (int)($body['points_bonus'] ?? $body['bonus_points'] ?? 0));
        $minSpend = max(0.0, (float)($body['min_spend'] ?? 0));
        $budgetCap = isset($body['budget_cap']) && $body['budget_cap'] !== '' && $body['budget_cap'] !== null
            ? max(0.0, (float)$body['budget_cap'])
            : (isset($body['max_budget']) && $body['max_budget'] !== '' && $body['max_budget'] !== null ? max(0.0, (float)$body['max_budget']) : 0.0);
        $isActive = isset($body['is_active']) ? ((bool)$body['is_active'] ? 1 : 0) : 1;
        $startsAt = !empty($body['starts_at']) ? date('Y-m-d H:i:s', strtotime((string)$body['starts_at'])) : null;
        $endsAt = !empty($body['ends_at']) ? date('Y-m-d H:i:s', strtotime((string)$body['ends_at'])) : null;
        $description = trim((string)($body['description'] ?? ''));

        if ($method === 'PUT' && $id !== '') {
            $this->db->execute(
                'UPDATE referral_campaigns
                 SET name = :nm, campaign_code = :cc, description = :desc, reward_mode = :rm, reward_value = :rv,
                     points_bonus = :bp, min_spend = :ms, budget_cap = :mb, is_active = :act, starts_at = :sa, ends_at = :ea, updated_at = NOW()
                 WHERE id = :id',
                [
                    'nm' => $name, 'cc' => $code, 'desc' => $description, 'rm' => $rewardMode, 'rv' => $rewardVal,
                    'bp' => $pointsBonus, 'ms' => $minSpend, 'mb' => $budgetCap, 'act' => $isActive, 'sa' => $startsAt, 'ea' => $endsAt, 'id' => $id,
                ]
            );
            $row = $this->db->fetchOne('SELECT * FROM referral_campaigns WHERE id = :id', ['id' => $id]);
            Response::success(['campaign' => $row], 'Campaign updated.');
            return;
        }

        $dup = $this->db->fetchOne('SELECT id FROM referral_campaigns WHERE UPPER(campaign_code) = :cc LIMIT 1', ['cc' => $code]);
        if ($dup) {
            Response::error('A campaign with this code already exists.', 409);
        }

        $newId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO referral_campaigns (id, name, campaign_code, description, reward_mode, reward_value, points_bonus, min_spend, budget_cap, is_active, starts_at, ends_at, created_by, created_at)
             VALUES (:id, :nm, :cc, :desc, :rm, :rv, :bp, :ms, :mb, :act, :sa, :ea, :cby, NOW())',
            [
                'id' => $newId, 'nm' => $name, 'cc' => $code, 'desc' => $description, 'rm' => $rewardMode, 'rv' => $rewardVal,
                'bp' => $pointsBonus, 'ms' => $minSpend, 'mb' => $budgetCap, 'act' => $isActive, 'sa' => $startsAt, 'ea' => $endsAt,
                'cby' => $super['id'],
            ]
        );
        $this->referrals->logAudit((string)$super['id'], (string)$super['email'], null, 'CAMPAIGN_CREATED', 'campaign', $newId, ['code' => $code]);
        $row = $this->db->fetchOne('SELECT * FROM referral_campaigns WHERE id = :id', ['id' => $newId]);
        Response::success(['campaign' => $row], 'Campaign created.', 201);
    }

    /**
     * GET / POST / PUT / DELETE /api/admin/referrals/tiers
     */
    public function adminTiers(Request $request, array $params = []): void
    {
        $method = $request->getMethod();
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));

        if ($method === 'GET') {
            Auth::requirePermission($request, 'referrals');
            $rows = $this->db->fetchAll('SELECT * FROM referral_tiers ORDER BY min_qualified_referrals ASC');
            Response::success(['tiers' => $rows]);
            return;
        }

        $super = Auth::requireSuperAdmin($request);
        if ($method === 'DELETE' && $id !== '') {
            $this->db->execute('DELETE FROM referral_tiers WHERE id = :id', ['id' => $id]);
            Response::success(['deleted_id' => $id], 'Tier deleted.');
            return;
        }

        $body = $request->getBody();
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Tier name is required.', 422);
        }
        $minRef = max(0, (int)($body['min_qualified_referrals'] ?? 0));
        $minVol = max(0.0, (float)($body['min_referred_volume'] ?? 0));
        $mult = max(1.0, min(5.0, (float)($body['reward_multiplier'] ?? 1.0)));
        $bonusCash = max(0.0, (float)($body['bonus_cash'] ?? 0));
        $bonusPts = max(0, (int)($body['bonus_points'] ?? 0));
        $resellerOnly = isset($body['reseller_only']) ? ((bool)$body['reseller_only'] ? 1 : 0) : 0;
        $displayOrder = max(1, (int)($body['display_order'] ?? 1));
        $tierKey = strtolower(preg_replace('/[^a-z0-9_]+/i', '_', (string)($body['tier_key'] ?? $name)) ?: ('tier_' . time()));
        $isActive = isset($body['is_active']) ? ((bool)$body['is_active'] ? 1 : 0) : 1;

        if ($method === 'PUT' && $id !== '') {
            $this->db->execute(
                'UPDATE referral_tiers
                 SET name = :nm, min_qualified_referrals = :mr, min_referred_volume = :mv, reward_multiplier = :rm,
                     bonus_cash = :bc, bonus_points = :bp, reseller_only = :ro, display_order = :ord, is_active = :act, updated_at = NOW()
                 WHERE id = :id',
                [
                    'nm' => $name, 'mr' => $minRef, 'mv' => $minVol, 'rm' => $mult,
                    'bc' => $bonusCash, 'bp' => $bonusPts, 'ro' => $resellerOnly, 'ord' => $displayOrder, 'act' => $isActive, 'id' => $id,
                ]
            );
            $row = $this->db->fetchOne('SELECT * FROM referral_tiers WHERE id = :id', ['id' => $id]);
            Response::success(['tier' => $row], 'Partner tier updated.');
            return;
        }

        $newId = Security::generateUuid();
        $dupKey = $this->db->fetchOne('SELECT id FROM referral_tiers WHERE tier_key = :tk LIMIT 1', ['tk' => $tierKey]);
        if ($dupKey) {
            $tierKey .= '_' . substr($newId, 0, 4);
        }
        $this->db->execute(
            'INSERT INTO referral_tiers (id, tier_key, name, min_qualified_referrals, min_referred_volume, reward_multiplier, bonus_cash, bonus_points, reseller_only, display_order, is_active, created_at)
             VALUES (:id, :tk, :nm, :mr, :mv, :rm, :bc, :bp, :ro, :ord, :act, NOW())',
            [
                'id' => $newId, 'tk' => $tierKey, 'nm' => $name, 'mr' => $minRef, 'mv' => $minVol, 'rm' => $mult,
                'bc' => $bonusCash, 'bp' => $bonusPts, 'ro' => $resellerOnly, 'ord' => $displayOrder, 'act' => $isActive,
            ]
        );
        $this->referrals->logAudit((string)$super['id'], (string)$super['email'], null, 'TIER_CREATED', 'tier', $newId, ['name' => $name]);
        $row = $this->db->fetchOne('SELECT * FROM referral_tiers WHERE id = :id', ['id' => $newId]);
        Response::success(['tier' => $row], 'Partner tier created.', 201);
    }

    /**
     * GET /api/admin/referrals/rewards
     */
    public function adminRewards(Request $request): void
    {
        Auth::requirePermission($request, 'referrals');
        $status = trim((string)$request->query('status', 'all'));
        $where = $status !== '' && $status !== 'all' ? 'WHERE rw.status = :st' : '';
        $params = $status !== '' && $status !== 'all' ? ['st' => $status] : [];
        $rows = $this->db->fetchAll(
            "SELECT rw.*, ref_u.full_name AS referrer_name, ref_u.email AS referrer_email,
                    du.full_name AS referred_name, du.email AS referred_email
             FROM referral_rewards rw
             LEFT JOIN users ref_u ON ref_u.id = rw.referrer_user_id
             LEFT JOIN users du ON du.id = rw.referred_user_id
             {$where}
             ORDER BY rw.created_at DESC
             LIMIT 200",
            $params
        );
        Response::success(['rewards' => $rows]);
    }

    /**
     * POST /api/admin/referrals/rewards/:id/action
     * Actions: settle | reverse | flag
     */
    public function adminRewardAction(Request $request, array $params = []): void
    {
        $admin = Auth::requirePermission($request, 'referrals');
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));
        $action = strtolower(trim((string)$request->input('action', '')));
        $reason = trim((string)$request->input('reason', 'Administrator action'));

        $reward = $this->db->fetchOne('SELECT * FROM referral_rewards WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$reward) {
            Response::notFound('Referral reward not found.');
        }

        if ($action === 'settle' && $reward['status'] === 'pending') {
            $cash = (float)$reward['reward_cash'];
            $pts = (int)$reward['reward_points'];
            $this->db->withTransaction(function (Database $db) use ($reward, $cash, $pts, $admin) {
                $db->execute(
                    'UPDATE referral_rewards
                     SET status = "available", status_reason = "Manually settled by administrator", settled_at = NOW(), updated_at = NOW()
                     WHERE id = :id AND status = "pending"',
                    ['id' => $reward['id']]
                );
                $this->referrals->ensureBalanceRow((string)$reward['referrer_user_id']);
                $bal = $db->fetchOne('SELECT points_balance FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $reward['referrer_user_id']]);
                $beforePts = (int)($bal['points_balance'] ?? 0);
                $afterPts = $beforePts + $pts;

                $db->execute(
                    'UPDATE referral_balances
                     SET pending_balance = GREATEST(0, pending_balance - :c1),
                         available_balance = available_balance + :c2,
                         points_balance = points_balance + :p1,
                         updated_at = NOW()
                     WHERE user_id = :uid',
                    [
                        'c1' => $cash, 'c2' => $cash,
                        'p1' => $pts,
                        'uid' => $reward['referrer_user_id'],
                    ]
                );
                if ($pts > 0) {
                    $db->execute(
                        'INSERT IGNORE INTO referral_points_ledger
                         (id, user_id, entry_type, points, balance_before, balance_after, reference, naira_value, conversion_rate, description, created_at)
                         VALUES (:id, :uid, "CREDIT", :pts, :bb, :ba, :ref, 0.00, 1.0000, :desc, NOW())',
                        [
                            'id' => Security::generateUuid(),
                            'uid' => $reward['referrer_user_id'],
                            'pts' => $pts,
                            'bb' => $beforePts,
                            'ba' => $afterPts,
                            'ref' => 'PTS_' . $reward['source_reference'],
                            'desc' => 'Admin manual settlement of referral points',
                        ]
                    );
                }
                $this->referrals->logAudit((string)$admin['id'], (string)$admin['email'], (string)$reward['referrer_user_id'], 'REWARD_MANUALLY_SETTLED', 'referral_reward', (string)$reward['id'], ['cash' => $cash, 'points' => $pts]);
            });
            Response::success(['settled' => true], 'Reward settled to available balance.');
        } elseif ($action === 'reverse') {
            Auth::requireSuperAdmin($request);
            $count = $this->referrals->reverseRewardsForSource((string)$reward['source_reference'], $reason, (string)$admin['id']);
            Response::success(['reversed_count' => $count], $count > 0 ? 'Reward reversed cleanly.' : 'Reward already reversed or finalized.');
        } elseif ($action === 'flag') {
            $this->db->execute(
                'UPDATE referral_rewards SET status = "rejected", status_reason = :r, updated_at = NOW() WHERE id = :id AND status = "pending"',
                ['r' => $reason, 'id' => $reward['id']]
            );
            $this->referrals->logAudit((string)$admin['id'], (string)$admin['email'], (string)$reward['referrer_user_id'], 'REWARD_FLAGGED', 'referral_reward', (string)$reward['id'], ['reason' => $reason]);
            Response::success(['flagged' => true], 'Pending reward rejected for compliance review.');
        } else {
            Response::error('Unsupported reward action.', 422);
        }
    }

    /**
     * POST /api/admin/referrals/:id/status
     */
    public function adminFlagReferral(Request $request, array $params = []): void
    {
        $admin = Auth::requirePermission($request, 'referrals');
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));
        $status = strtolower(trim((string)$request->input('status', '')));
        $reason = trim((string)$request->input('reason', ''));

        if (!in_array($status, ['registered', 'qualified', 'flagged', 'blocked'], true)) {
            Response::error('Invalid referral relationship status.', 422);
        }

        $row = $this->db->fetchOne('SELECT * FROM referrals WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$row) {
            Response::notFound('Referral record not found.');
        }

        $this->db->execute(
            'UPDATE referrals SET status = :st, flag_reason = :fr, updated_at = NOW() WHERE id = :id',
            ['st' => $status, 'fr' => $reason ?: null, 'id' => $id]
        );
        $this->referrals->logAudit(
            (string)$admin['id'],
            (string)$admin['email'],
            (string)$row['referrer_user_id'],
            'REFERRAL_STATUS_CHANGED',
            'referral',
            $id,
            ['previous' => $row['status'], 'next' => $status, 'reason' => $reason]
        );

        Response::success(['status' => $status], "Referral record updated to {$status}.");
    }

    /**
     * POST /api/admin/referrals/settle
     */
    public function adminSettle(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'referrals');
        $settled = $this->referrals->settleMatureRewards(null);
        $this->referrals->logAudit((string)$admin['id'], (string)$admin['email'], null, 'REFERRAL_BATCH_SETTLE', 'referral_reward', null, ['settled_count' => $settled]);
        Response::success(['settled_count' => $settled], "{$settled} mature pending reward(s) moved to available balance.");
    }

    /**
     * GET /api/admin/withdrawals
     */
    public function adminWithdrawals(Request $request): void
    {
        Auth::requirePermission($request, 'withdrawals');
        $status = strtolower(trim((string)$request->query('status', 'all')));
        $search = trim((string)$request->query('search', ''));
        $conds = [];
        $params = [];
        if ($status !== '' && $status !== 'all') {
            $conds[] = 'w.status = :st';
            $params['st'] = $status;
        }
        if ($search !== '') {
            $conds[] = '(w.withdrawal_number LIKE :q1 OR u.full_name LIKE :q2 OR u.email LIKE :q3 OR w.account_name LIKE :q4 OR w.account_number LIKE :q5 OR w.bank_name LIKE :q6)';
            $pat = '%' . $search . '%';
            $params['q1'] = $pat;
            $params['q2'] = $pat;
            $params['q3'] = $pat;
            $params['q4'] = $pat;
            $params['q5'] = $pat;
            $params['q6'] = $pat;
        }
        $where = !empty($conds) ? ('WHERE ' . implode(' AND ', $conds)) : '';

        $rows = $this->db->fetchAll(
            "SELECT w.*, u.full_name AS customer_name, u.email AS customer_email, u.phone_number AS customer_phone,
                    u.kyc_level, u.tier
             FROM referral_withdrawals w
             LEFT JOIN users u ON u.id = w.user_id
             {$where}
             ORDER BY CASE WHEN w.status = 'pending' THEN 0 WHEN w.status IN ('approved', 'processing') THEN 1 ELSE 2 END, w.created_at DESC
             LIMIT 200",
            $params
        );

        $stats = $this->db->fetchOne(
            'SELECT
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) AS pending_count,
                COALESCE(SUM(CASE WHEN status = "pending" THEN net_amount ELSE 0 END), 0) AS pending_payout_total,
                SUM(CASE WHEN status IN ("approved", "processing") THEN 1 ELSE 0 END) AS processing_count,
                SUM(CASE WHEN status = "paid" THEN 1 ELSE 0 END) AS paid_count,
                COALESCE(SUM(CASE WHEN status = "paid" THEN net_amount ELSE 0 END), 0) AS paid_total,
                SUM(CASE WHEN status IN ("rejected", "failed") THEN 1 ELSE 0 END) AS rejected_count
             FROM referral_withdrawals'
        );

        Response::success([
            'withdrawals' => $rows,
            'stats' => [
                'pending_count' => (int)($stats['pending_count'] ?? 0),
                'pending_payout_total' => (float)($stats['pending_payout_total'] ?? 0),
                'processing_count' => (int)($stats['processing_count'] ?? 0),
                'paid_count' => (int)($stats['paid_count'] ?? 0),
                'paid_total' => (float)($stats['paid_total'] ?? 0),
                'rejected_count' => (int)($stats['rejected_count'] ?? 0),
            ],
        ]);
    }

    /**
     * POST /api/admin/withdrawals/:id/action
     * Actions: approve | process | mark_paid | reject | fail
     */
    public function adminWithdrawalAction(Request $request, array $params = []): void
    {
        $admin = Auth::requirePermission($request, 'withdrawals');
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));
        $body = $request->getBody();
        $action = strtolower(trim((string)($body['action'] ?? '')));

        if ($id === '' || $action === '') {
            Response::error('Withdrawal ID and action are required.', 422);
        }

        try {
            $res = $this->referrals->adminProcessWithdrawal($id, $action, $body, $admin, $request->getIp());
            Response::success($res, 'Withdrawal workflow updated successfully.');
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    // =========================================================================
    // 4. ADMIN PIN GOVERNANCE, MFA POLICY & SECURITY AUDIT ENDPOINTS
    // =========================================================================

    /**
     * GET /api/admin/pin/overview
     */
    public function adminPinOverview(Request $request): void
    {
        Auth::requirePermission($request, 'security');

        $policy = $this->pins->getPolicy();
        $summary = $this->db->fetchOne(
            'SELECT
                COUNT(*) AS total_customers,
                SUM(CASE WHEN transaction_pin_hash IS NOT NULL AND transaction_pin_hash != "" THEN 1 ELSE 0 END) AS pin_activated_count,
                SUM(CASE WHEN transaction_pin_hash IS NULL OR transaction_pin_hash = "" THEN 1 ELSE 0 END) AS pin_missing_count,
                SUM(CASE WHEN pin_locked_until IS NOT NULL AND pin_locked_until > NOW() THEN 1 ELSE 0 END) AS pin_locked_count
             FROM users WHERE role = "customer"'
        );

        $customers = $this->db->fetchAll(
            'SELECT id, full_name, email, phone_number, status, kyc_level,
                    (transaction_pin_hash IS NOT NULL AND transaction_pin_hash != "") AS has_transaction_pin,
                    pin_failed_attempts, pin_locked_until, pin_set_at, pin_updated_by_admin_at, created_at
             FROM users
             WHERE role = "customer"
               AND (pin_locked_until > NOW() OR pin_failed_attempts > 0 OR transaction_pin_hash IS NULL OR transaction_pin_hash = "")
             ORDER BY (pin_locked_until > NOW()) DESC, pin_failed_attempts DESC, created_at DESC
             LIMIT 100'
        );

        Response::success([
            'policy' => $policy,
            'summary' => [
                'total_customers' => (int)($summary['total_customers'] ?? 0),
                'pin_activated_count' => (int)($summary['pin_activated_count'] ?? 0),
                'pin_missing_count' => (int)($summary['pin_missing_count'] ?? 0),
                'pin_locked_count' => (int)($summary['pin_locked_count'] ?? 0),
            ],
            'users' => $customers,
        ]);
    }

    /**
     * PUT /api/admin/pin/policy (Super Admin ONLY)
     */
    public function adminUpdatePinPolicy(Request $request): void
    {
        $super = Auth::requireSuperAdmin($request);
        $body = $request->getBody();
        $current = $this->pins->getPolicy();

        $next = array_merge($current, array_intersect_key($body, $current));
        if (isset($body['protected_categories']) && is_array($body['protected_categories'])) {
            $next['protected_categories'] = array_merge(
                $current['protected_categories'],
                array_map('boolval', $body['protected_categories'])
            );
        }
        $next['pin_length'] = max(4, min(6, (int)($next['pin_length'] ?? 4)));
        $next['pin_max_attempts'] = max(3, min(10, (int)($next['pin_max_attempts'] ?? 5)));
        $next['pin_lockout_minutes'] = max(5, min(120, (int)($next['pin_lockout_minutes'] ?? 15)));
        $next['otp_reset_expiry_minutes'] = max(5, min(60, (int)($next['otp_reset_expiry_minutes'] ?? 15)));
        $next['enforce_transaction_pin'] = (bool)($next['enforce_transaction_pin'] ?? true);
        $next['require_pin_activation_for_all_customers'] = (bool)($next['require_pin_activation_for_all_customers'] ?? true);
        $next['allow_weak_pins'] = (bool)($next['allow_weak_pins'] ?? false);

        $json = json_encode($next, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES (:id, "pin_policy_settings", :val, "security", "Transaction PIN Security Policy", NOW())
             ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
            ['id' => Security::generateUuid(), 'val' => $json, 'val2' => $json]
        );

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "PIN_POLICY_UPDATED", :det, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $super['id'],
                'email' => $super['email'],
                'det' => json_encode(['pin_length' => $next['pin_length'], 'enforce' => $next['enforce_transaction_pin']]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success(['policy' => $this->pins->getPolicy()], 'Transaction PIN policy saved.');
    }

    /**
     * POST /api/admin/pin/users/:id/unlock
     */
    public function adminUnlockUserPin(Request $request, array $params = []): void
    {
        $admin = Auth::requirePermission($request, 'security');
        $targetId = trim((string)($params['id'] ?? $request->param('id') ?? ''));
        try {
            $res = $this->pins->adminUnlockUserPin($targetId, $admin, $request->getIp());
            Response::success($res, 'Customer PIN lockout cleared.');
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 403);
        }
    }

    /**
     * POST /api/admin/pin/users/:id/reset
     */
    public function adminResetUserPin(Request $request, array $params = []): void
    {
        $admin = Auth::requirePermission($request, 'security');
        $targetId = trim((string)($params['id'] ?? $request->param('id') ?? ''));
        $mode = (string)$request->input('mode', 'force_reactivate');
        $newPin = $request->input('new_pin') !== null ? trim((string)$request->input('new_pin')) : null;
        try {
            $res = $this->pins->adminResetUserPin($targetId, $admin, $mode, $newPin, $request->getIp());
            Response::success($res, 'Customer Transaction PIN reset processed.');
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /**
     * GET /api/admin/security/overview
     */
    public function adminSecurityOverview(Request $request): void
    {
        $admin = Auth::requirePermission($request, 'security');

        $secSettings = Auth::getSecuritySettings();
        $mfaPolicy = $this->mfa->getPolicy();
        $pinPolicy = $this->pins->getPolicy();

        $activeSessions = $this->db->fetchAll(
            'SELECT s.id, s.user_id, s.ip_address, s.device_label, s.last_seen_at, s.expires_at, s.created_at,
                    u.full_name, u.email, u.role
             FROM user_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.is_revoked = 0 AND s.expires_at > NOW()
             ORDER BY s.last_seen_at DESC
             LIMIT 100'
        );

        $failedLogins = $this->db->fetchAll(
            'SELECT * FROM login_attempts WHERE attempt_count > 0 ORDER BY last_attempt_at DESC, created_at DESC LIMIT 50'
        );

        $mfaStats = $this->db->fetchOne(
            'SELECT
                SUM(CASE WHEN role IN ("admin", "superadmin") AND mfa_enabled = 1 THEN 1 ELSE 0 END) AS admin_mfa_enabled,
                SUM(CASE WHEN role IN ("admin", "superadmin") THEN 1 ELSE 0 END) AS total_admins,
                SUM(CASE WHEN role = "customer" AND mfa_enabled = 1 THEN 1 ELSE 0 END) AS customer_mfa_enabled
             FROM users'
        );

        Response::success([
            'security_settings' => $secSettings,
            'mfa_policy' => $mfaPolicy,
            'pin_policy' => $pinPolicy,
            'active_sessions' => $activeSessions,
            'failed_logins' => $failedLogins,
            'mfa_stats' => [
                'admin_mfa_enabled' => (int)($mfaStats['admin_mfa_enabled'] ?? 0),
                'total_admins' => (int)($mfaStats['total_admins'] ?? 0),
                'customer_mfa_enabled' => (int)($mfaStats['customer_mfa_enabled'] ?? 0),
            ],
            'caller_is_superadmin' => ($admin['role'] ?? '') === 'superadmin',
        ]);
    }

    /**
     * POST /api/admin/security/sessions/:id/revoke (Super Admin ONLY)
     */
    public function adminRevokeSession(Request $request, array $params = []): void
    {
        $super = Auth::requireSuperAdmin($request);
        $id = trim((string)($params['id'] ?? $request->param('id') ?? ''));

        $session = $this->db->fetchOne('SELECT id, jti, user_id FROM user_sessions WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$session) {
            Response::notFound('Session not found.');
        }

        Auth::revokeSessionByJti((string)$session['jti'], 'revoked_by_superadmin');
        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "ADMIN_SESSION_REVOKED", :det, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $super['id'],
                'email' => $super['email'],
                'det' => json_encode(['session_id' => $id, 'target_user_id' => $session['user_id']]),
                'ip' => $request->getIp(),
            ]
        );
        Response::success(['revoked_id' => $id], 'User session revoked.');
    }

    /**
     * PUT /api/admin/security/mfa-policy (Super Admin ONLY)
     */
    public function adminUpdateMfaPolicy(Request $request): void
    {
        $super = Auth::requireSuperAdmin($request);
        $body = $request->getBody();

        // Update MFA settings
        if (isset($body['mfa_policy']) || isset($body['enforce_mfa_for_superadmin']) || isset($body['enforce_mfa_for_admin'])) {
            $src = is_array($body['mfa_policy'] ?? null) ? $body['mfa_policy'] : $body;
            $curMfa = $this->mfa->getPolicy();
            $nextMfa = [
                'enforce_mfa_for_superadmin' => (bool)($src['enforce_mfa_for_superadmin'] ?? $curMfa['enforce_mfa_for_superadmin']),
                'enforce_mfa_for_admin' => (bool)($src['enforce_mfa_for_admin'] ?? $curMfa['enforce_mfa_for_admin']),
                'allow_customer_mfa' => (bool)($src['allow_customer_mfa'] ?? $curMfa['allow_customer_mfa']),
                'allow_email_otp' => (bool)($src['allow_email_otp'] ?? $curMfa['allow_email_otp']),
                'allow_totp' => (bool)($src['allow_totp'] ?? $curMfa['allow_totp']),
                'otp_expiry_minutes' => max(3, min(30, (int)($src['otp_expiry_minutes'] ?? $curMfa['otp_expiry_minutes']))),
                'totp_issuer' => trim((string)($src['totp_issuer'] ?? $curMfa['totp_issuer'])) ?: 'HAMBAKTECH',
            ];
            $json = json_encode($nextMfa, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, "mfa_settings", :val, "security", "MFA Policy Settings", NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
                ['id' => Security::generateUuid(), 'val' => $json, 'val2' => $json]
            );
        }

        // Optional updates to security_settings (session TTL, lockout, CORS)
        if (isset($body['security_settings']) && is_array($body['security_settings'])) {
            $curSec = Auth::getSecuritySettings();
            $s = $body['security_settings'];
            $nextSec = array_merge($curSec, $s);
            $nextSec['session_timeout_minutes'] = max(15, min(10080, (int)($nextSec['session_timeout_minutes'] ?? 1440)));
            $nextSec['admin_session_timeout_minutes'] = max(10, min(720, (int)($nextSec['admin_session_timeout_minutes'] ?? 60)));
            $nextSec['login_max_attempts'] = max(3, min(15, (int)($nextSec['login_max_attempts'] ?? 5)));
            $nextSec['login_lockout_minutes'] = max(5, min(180, (int)($nextSec['login_lockout_minutes'] ?? 15)));
            $jsonSec = json_encode($nextSec, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $this->db->execute(
                'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
                 VALUES (:id, "security_settings", :val, "security", "Session & Auth Security Settings", NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
                ['id' => Security::generateUuid(), 'val' => $jsonSec, 'val2' => $jsonSec]
            );
        }

        $this->db->execute(
            'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
             VALUES (:id, :uid, :email, "SECURITY_MFA_POLICY_UPDATED", :det, :ip, NOW())',
            [
                'id' => Security::generateUuid(),
                'uid' => $super['id'],
                'email' => $super['email'],
                'det' => json_encode(['updated_by' => $super['email']]),
                'ip' => $request->getIp(),
            ]
        );

        Response::success([
            'mfa_policy' => $this->mfa->getPolicy(),
            'security_settings' => Auth::getSecuritySettings(),
        ], 'Security & MFA policy updated.');
    }

    /**
     * GET /api/admin/reports/referral-growth
     */
    public function adminGrowthReport(Request $request): void
    {
        Auth::requirePermission($request, 'reports');
        $report = $this->referrals->getReferralGrowthReport([
            'start_date' => (string)$request->query('date_from', $request->query('start_date', '')),
            'end_date' => (string)$request->query('date_to', $request->query('end_date', '')),
            'campaign_code' => (string)$request->query('campaign_code', ''),
        ]);
        Response::success(['report' => $report]);
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    private function loadFullUserForToken(string $userId): ?array
    {
        try {
            return $this->db->fetchOne(
                'SELECT u.*, (u.transaction_pin_hash IS NOT NULL AND u.transaction_pin_hash != "") AS has_transaction_pin,
                        w.balance AS live_balance, p.nin, p.bvn, p.address, p.state, p.lga, p.bio, p.date_of_birth,
                        p.notification_preferences, p.security_settings, p.assigned_permissions AS profile_permissions
                 FROM users u
                 LEFT JOIN wallets w ON w.user_id = u.id
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 WHERE u.id = :id LIMIT 1',
                ['id' => $userId]
            );
        } catch (Throwable) {
            return $this->db->fetchOne('SELECT * FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
        }
    }

    private function sanitizeAuthUser(array $user): array
    {
        $user['wallet_balance'] = (float)($user['live_balance'] ?? $user['wallet_balance'] ?? 0);
        $user['kyc_level'] = (int)($user['kyc_level'] ?? $user['tier'] ?? 1);
        $user['tier'] = (int)($user['tier'] ?? $user['kyc_level']);
        $user['has_transaction_pin'] = (bool)($user['has_transaction_pin'] ?? false);
        $user['mfa_enabled'] = (bool)($user['mfa_enabled'] ?? false);
        $user['pin_is_locked'] = !empty($user['pin_locked_until']) && strtotime((string)$user['pin_locked_until']) > time();

        if (isset($user['notification_preferences']) && is_string($user['notification_preferences'])) {
            $user['notification_preferences'] = json_decode($user['notification_preferences'], true);
        }
        if (isset($user['security_settings']) && is_string($user['security_settings'])) {
            $user['security_settings'] = json_decode($user['security_settings'], true);
        }

        $perms = [];
        foreach ([$user['assigned_permissions'] ?? null, $user['profile_permissions'] ?? null] as $raw) {
            if (is_string($raw) && $raw !== '') {
                $d = json_decode($raw, true);
                if (is_array($d)) {
                    $perms = $d;
                    break;
                }
            } elseif (is_array($raw)) {
                $perms = $raw;
                break;
            }
        }
        if (($user['role'] ?? '') === 'superadmin') {
            $perms = ['*'];
        } elseif (($user['role'] ?? '') === 'admin' && empty($perms)) {
            $perms = ['customers', 'wallet', 'kyc', 'services', 'support', 'reports', 'referrals', 'withdrawals'];
        }
        $user['permissions'] = $perms;

        unset($user['password_hash'], $user['transaction_pin_hash'], $user['live_balance'], $user['assigned_permissions'], $user['profile_permissions']);
        return $user;
    }
}
