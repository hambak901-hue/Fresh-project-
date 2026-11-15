<?php
/**
 * @file ReferralEngineService.php
 * Enterprise Referral Attribution, Configurable Reward/Points Engine, Anti-Fraud Guard,
 * Profit-Safe Settlement Hold, Wallet Conversion, Bank Withdrawal & Report #12 Analytics
 */

declare(strict_types=1);

namespace HambakTech\Services;

use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Core\SchemaSync;

class ReferralEngineService
{
    private Database $db;
    private WalletService $walletService;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?: Database::getInstance();
        $this->walletService = new WalletService();
        SchemaSync::syncSecurityAndReferralSchema($this->db);
    }

    public static function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', trim($phone)) ?? '';
        if ($digits === '') {
            return '';
        }
        if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            return '234' . substr($digits, 1);
        }
        if (strlen($digits) === 10) {
            return '234' . $digits;
        }
        if (str_starts_with($digits, '2340') && strlen($digits) === 14) {
            return '234' . substr($digits, 4);
        }
        return $digits;
    }

    public static function normalizeTriggerMode(string $mode): string
    {
        $m = strtolower(trim($mode));
        return match ($m) {
            'signup_verified' => 'signup_verified',
            'first_qualifying_tx', 'first_qualifying_transaction' => 'first_qualifying_transaction',
            'every_qualifying_tx', 'every_qualifying_transaction' => 'every_qualifying_transaction',
            'up_to_n_tx' => 'up_to_n_tx',
            default => 'first_qualifying_transaction',
        };
    }

    public function getConfig(): array
    {
        $defaults = [
            'enabled' => true,
            'program_name' => 'HAMBAKTECH Partner & Referral Program',
            'code_prefix' => 'HAMBAK',
            'code_length' => 6,
            'reward_mode' => 'fixed',
            'trigger_mode' => 'first_qualifying_transaction',
            'flat_reward_naira' => 100.00,
            'percent_of_spend' => 1.5,
            'percent_of_margin' => 15.0,
            'points_per_qualifying_tx' => 50,
            'points_per_1000_naira' => 25,
            'point_value_naira' => 1.00,
            'min_qualifying_spend' => 500.00,
            'min_net_margin_naira' => 10.00,
            'protect_negative_margin' => true,
            'settlement_hold_hours' => 24,
            'monthly_reward_cap_naira' => 50000.00,
            'max_rewards_per_referee' => 1,
            'qualifying_services' => [
                'data' => true,
                'airtime' => true,
                'airtime_pin' => true,
                'data_pin' => true,
                'cable' => true,
                'electricity' => true,
                'exam_pin' => true,
                'bulksms' => true,
                'nin_verification' => true,
                'bvn_verification' => true,
                'nin_modification' => true,
                'bvn_modification' => true,
                'enrolment' => true,
            ],
            'wallet_conversion_enabled' => true,
            'min_wallet_conversion_naira' => 500.00,
            'min_points_conversion' => 100,
            'wallet_conversion_fee_naira' => 0.00,
            'withdrawal_enabled' => true,
            'min_withdrawal_naira' => 2000.00,
            'max_withdrawal_naira' => 100000.00,
            'daily_withdrawal_limit_naira' => 100000.00,
            'withdrawal_fee_type' => 'flat',
            'withdrawal_fee_value' => 50.00,
            'require_kyc_level_for_withdrawal' => 1,
            'block_self_referral' => true,
            'block_same_ip_signup' => true,
            'max_signups_per_ip_24h' => 3,
            'notify_email_on_reward' => true,
            'notify_email_on_withdrawal' => true,
            'terms_summary' => 'Earn rewards when friends sign up using your referral code and complete qualifying transactions above the minimum spend threshold. Rewards enter a settlement hold window before becoming available for instant wallet conversion or bank withdrawal.',
            'whatsapp_share_template' => 'Join HAMBAKTECH for instant Data, Airtime, Bills & Identity Services using my referral link: {referral_link} (Code: {referral_code})',
        ];

        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "referral_settings" LIMIT 1');
            if ($row && !empty($row['setting_value'])) {
                $decoded = json_decode((string)$row['setting_value'], true);
                if (is_array($decoded)) {
                    if (isset($decoded['qualifying_services']) && is_array($decoded['qualifying_services'])) {
                        $decoded['qualifying_services'] = array_merge($defaults['qualifying_services'], $decoded['qualifying_services']);
                    }
                    $defaults = array_merge($defaults, $decoded);
                }
            }
        } catch (\Throwable) {
        }

        // Safety bounds preventing misconfiguration
        $defaults['code_length'] = max(4, min(10, (int)$defaults['code_length']));
        $defaults['flat_reward_naira'] = max(0.0, min(10000.0, (float)$defaults['flat_reward_naira']));
        $defaults['percent_of_spend'] = max(0.0, min(25.0, (float)$defaults['percent_of_spend']));
        $defaults['percent_of_margin'] = max(0.0, min(80.0, (float)$defaults['percent_of_margin']));
        $defaults['point_value_naira'] = max(0.01, min(100.0, (float)$defaults['point_value_naira']));
        $defaults['min_qualifying_spend'] = max(0.0, (float)$defaults['min_qualifying_spend']);
        $defaults['min_net_margin_naira'] = max(0.0, (float)$defaults['min_net_margin_naira']);
        $defaults['settlement_hold_hours'] = max(0, min(720, (int)$defaults['settlement_hold_hours']));
        $defaults['monthly_reward_cap_naira'] = max(0.0, (float)$defaults['monthly_reward_cap_naira']);
        $defaults['max_rewards_per_referee'] = max(1, min(100, (int)$defaults['max_rewards_per_referee']));
        $defaults['min_wallet_conversion_naira'] = max(50.0, (float)$defaults['min_wallet_conversion_naira']);
        $defaults['min_points_conversion'] = max(1, (int)$defaults['min_points_conversion']);
        $defaults['min_withdrawal_naira'] = max(500.0, (float)$defaults['min_withdrawal_naira']);
        $defaults['max_withdrawal_naira'] = max((float)$defaults['min_withdrawal_naira'], (float)$defaults['max_withdrawal_naira']);
        $defaults['daily_withdrawal_limit_naira'] = max((float)$defaults['max_withdrawal_naira'], (float)$defaults['daily_withdrawal_limit_naira']);
        $defaults['withdrawal_fee_value'] = max(0.0, (float)$defaults['withdrawal_fee_value']);
        $defaults['trigger_mode'] = self::normalizeTriggerMode((string)($defaults['trigger_mode'] ?? 'first_qualifying_transaction'));
        $defaults['max_signups_per_ip_24h'] = max(1, min(25, (int)$defaults['max_signups_per_ip_24h']));

        return $defaults;
    }

    public function getPublicConfig(): array
    {
        $c = $this->getConfig();
        return [
            'enabled' => (bool)$c['enabled'],
            'program_name' => $c['program_name'],
            'reward_mode' => $c['reward_mode'],
            'trigger_mode' => $c['trigger_mode'],
            'flat_reward_naira' => (float)$c['flat_reward_naira'],
            'percent_of_spend' => (float)$c['percent_of_spend'],
            'percent_of_margin' => (float)$c['percent_of_margin'],
            'points_per_qualifying_tx' => (int)$c['points_per_qualifying_tx'],
            'points_per_1000_naira' => (int)$c['points_per_1000_naira'],
            'point_value_naira' => (float)$c['point_value_naira'],
            'min_qualifying_spend' => (float)$c['min_qualifying_spend'],
            'settlement_hold_hours' => (int)$c['settlement_hold_hours'],
            'max_rewards_per_referee' => (int)$c['max_rewards_per_referee'],
            'qualifying_services' => $c['qualifying_services'],
            'wallet_conversion_enabled' => (bool)$c['wallet_conversion_enabled'],
            'min_wallet_conversion_naira' => (float)$c['min_wallet_conversion_naira'],
            'min_points_conversion' => (int)$c['min_points_conversion'],
            'wallet_conversion_fee_naira' => (float)$c['wallet_conversion_fee_naira'],
            'withdrawal_enabled' => (bool)$c['withdrawal_enabled'],
            'min_withdrawal_naira' => (float)$c['min_withdrawal_naira'],
            'max_withdrawal_naira' => (float)$c['max_withdrawal_naira'],
            'daily_withdrawal_limit_naira' => (float)$c['daily_withdrawal_limit_naira'],
            'withdrawal_fee_type' => $c['withdrawal_fee_type'],
            'withdrawal_fee_value' => (float)$c['withdrawal_fee_value'],
            'require_kyc_level_for_withdrawal' => (int)$c['require_kyc_level_for_withdrawal'],
            'terms_summary' => $c['terms_summary'],
            'whatsapp_share_template' => $c['whatsapp_share_template'],
        ];
    }

    public function generateUniqueCode(?string $prefix = null, ?int $length = null): string
    {
        $cfg = $this->getConfig();
        $pfx = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($prefix ?? $cfg['code_prefix'] ?? 'HAMBAK')) ?: 'HAMBAK');
        $len = max(4, min(10, (int)($length ?? $cfg['code_length'] ?? 6)));
        $alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        $maxIdx = strlen($alphabet) - 1;

        for ($attempt = 0; $attempt < 25; $attempt++) {
            $suffix = '';
            $curLen = $attempt >= 15 ? $len + 2 : $len;
            for ($i = 0; $i < $curLen; $i++) {
                $suffix .= $alphabet[random_int(0, $maxIdx)];
            }
            $candidate = "{$pfx}-{$suffix}";
            $exists = $this->db->fetchOne('SELECT id FROM users WHERE referral_code = :rc LIMIT 1', ['rc' => $candidate]);
            if (!$exists) {
                return $candidate;
            }
        }

        return $pfx . '-' . strtoupper(bin2hex(random_bytes(5)));
    }

    public function ensureBalanceRow(string $userId): void
    {
        $this->db->execute('INSERT IGNORE INTO referral_balances (user_id) VALUES (:uid)', ['uid' => $userId]);
    }

    public function validateCodePreview(string $code, ?string $currentUserId = null): array
    {
        $clean = strtoupper(trim($code));
        if ($clean === '' || strlen($clean) < 4) {
            return ['valid' => false, 'message' => 'Enter a valid referral code.'];
        }

        $referrer = $this->db->fetchOne(
            'SELECT id, full_name, referral_code, status FROM users WHERE UPPER(referral_code) = :rc LIMIT 1',
            ['rc' => $clean]
        );
        if (!$referrer || ($referrer['status'] ?? 'active') !== 'active') {
            return ['valid' => false, 'message' => 'Referral code was not found or is currently inactive.'];
        }
        if ($currentUserId !== null && $referrer['id'] === $currentUserId) {
            return ['valid' => false, 'message' => 'Self-referral is not permitted.'];
        }

        return [
            'valid' => true,
            'code' => $referrer['referral_code'],
            'referrer_name_masked' => self::maskName((string)$referrer['full_name']),
            'program' => $this->getPublicConfig(),
        ];
    }

    public function bindReferralOnSignup(
        string $newUserId,
        string $email,
        string $phone,
        ?string $referralCode,
        string $channel = 'referral_link',
        ?string $campaignCode = null,
        string $ip = '',
        string $ua = ''
    ): ?array {
        $cfg = $this->getConfig();
        $cleanCode = strtoupper(trim((string)$referralCode));
        if ($cleanCode === '') {
            return null;
        }

        // Prevent duplicate overwriting if already bound
        $existingRef = $this->db->fetchOne('SELECT id FROM referrals WHERE referred_user_id = :uid LIMIT 1', ['uid' => $newUserId]);
        if ($existingRef) {
            return null;
        }

        $referrer = $this->db->fetchOne(
            'SELECT id, email, phone_number, phone_normalized, full_name, referral_code, status
             FROM users WHERE UPPER(referral_code) = :rc LIMIT 1',
            ['rc' => $cleanCode]
        );
        if (!$referrer || ($referrer['status'] ?? 'active') !== 'active') {
            return null;
        }

        // Self-referral protection
        if (!empty($cfg['block_self_referral'])) {
            $normNewPhone = self::normalizePhone($phone);
            $normRefPhone = self::normalizePhone((string)($referrer['phone_normalized'] ?: $referrer['phone_number']));
            if (
                $referrer['id'] === $newUserId
                || strcasecmp((string)$referrer['email'], $email) === 0
                || ($normNewPhone !== '' && $normRefPhone !== '' && $normNewPhone === $normRefPhone)
            ) {
                $this->logAudit($newUserId, $email, $referrer['id'], 'REFERRAL_SELF_REFERRAL_BLOCKED', 'referral', $cleanCode, [
                    'ip' => $ip,
                ]);
                return null;
            }
        }

        $status = 'registered';
        $flagReason = null;

        // IP abuse detection
        if (!empty($cfg['block_same_ip_signup']) && $ip !== '') {
            $recentIpCountRow = $this->db->fetchOne(
                'SELECT COUNT(*) AS cnt FROM referrals WHERE signup_ip = :ip AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)',
                ['ip' => $ip]
            );
            $ipCount = (int)($recentIpCountRow['cnt'] ?? 0);
            if ($ipCount >= (int)$cfg['max_signups_per_ip_24h']) {
                $status = 'flagged';
                $flagReason = 'Exceeded maximum referral signups per IP in 24h window.';
            }
        }

        $activeCampaignCode = null;
        $cleanCamp = strtoupper(trim((string)$campaignCode));
        if ($cleanCamp !== '') {
            $camp = $this->db->fetchOne(
                'SELECT campaign_code FROM referral_campaigns
                 WHERE UPPER(campaign_code) = :cc AND is_active = 1
                   AND (starts_at IS NULL OR starts_at <= NOW())
                   AND (ends_at IS NULL OR ends_at >= NOW())
                 LIMIT 1',
                ['cc' => $cleanCamp]
            );
            if ($camp) {
                $activeCampaignCode = $camp['campaign_code'];
            }
        }

        $fingerprint = hash('sha256', strtolower($ip . '|' . substr($ua, 0, 120)));
        $refId = Security::generateUuid();
        $cleanChannel = in_array($channel, ['referral_link', 'manual_code', 'campaign', 'admin_create'], true) ? $channel : 'referral_link';

        $this->db->execute(
            'INSERT INTO referrals
             (id, referrer_user_id, referred_user_id, referral_code_used, attribution_channel, campaign_code, risk_fingerprint, signup_ip, status, flag_reason, created_at)
             VALUES
             (:id, :ruid, :duid, :code, :chan, :camp, :fp, :ip, :st, :fr, NOW())',
            [
                'id' => $refId,
                'ruid' => $referrer['id'],
                'duid' => $newUserId,
                'code' => $referrer['referral_code'],
                'chan' => $cleanChannel,
                'camp' => $activeCampaignCode,
                'fp' => $fingerprint,
                'ip' => substr($ip, 0, 45),
                'st' => $status,
                'fr' => $flagReason,
            ]
        );

        $this->db->execute(
            'UPDATE users SET referred_by_user_id = :ruid, referral_source = :src, referral_campaign_code = :camp, referral_bound_at = NOW() WHERE id = :uid',
            [
                'ruid' => $referrer['id'],
                'src' => $cleanChannel,
                'camp' => $activeCampaignCode,
                'uid' => $newUserId,
            ]
        );

        $this->ensureBalanceRow($referrer['id']);
        $this->ensureBalanceRow($newUserId);

        $this->logAudit($newUserId, $email, $referrer['id'], 'REFERRAL_BOUND', 'referral', $refId, [
            'code' => $referrer['referral_code'],
            'channel' => $cleanChannel,
            'campaign' => $activeCampaignCode,
            'status' => $status,
            'ip' => $ip,
        ]);

        // If trigger_mode is signup_verified, grant signup reward cleanly (respecting hold)
        if ($cfg['enabled'] && $cfg['trigger_mode'] === 'signup_verified' && $status === 'registered') {
            $this->recordQualifyingTransaction([
                'user_id' => $newUserId,
                'service_category' => 'signup_bonus',
                'service_key' => 'signup_verified',
                'source_reference' => 'SIGNUP_' . $newUserId,
                'gross_amount' => (float)$cfg['min_qualifying_spend'],
                'wholesale_cost' => 0.00,
                'gateway_fee' => 0.00,
                'is_signup_event' => true,
            ]);
        }

        return [
            'referral_id' => $refId,
            'referrer_user_id' => $referrer['id'],
            'status' => $status,
            'campaign_code' => $activeCampaignCode,
        ];
    }

    /**
     * Evaluates and records referral reward + points when a referred user completes a qualifying transaction.
     * Safe to call on every completed service purchase; idempotent via source_reference.
     */
    public function recordQualifyingTransaction(array $tx): array
    {
        $cfg = $this->getConfig();
        if (empty($cfg['enabled'])) {
            return ['awarded' => false, 'reason' => 'program_disabled'];
        }

        $referredUserId = (string)($tx['user_id'] ?? '');
        $category = (string)($tx['service_category'] ?? '');
        $serviceKey = (string)($tx['service_key'] ?? $category);
        $sourceRef = trim((string)($tx['source_reference'] ?? ''));
        $gross = max(0.0, (float)($tx['gross_amount'] ?? 0));
        $wholesale = max(0.0, (float)($tx['wholesale_cost'] ?? 0));
        $gatewayFee = max(0.0, (float)($tx['gateway_fee'] ?? 0));
        $isSignupEvent = !empty($tx['is_signup_event']);

        if ($referredUserId === '' || $sourceRef === '') {
            return ['awarded' => false, 'reason' => 'missing_tx_identity'];
        }

        // Idempotency guard
        $existing = $this->db->fetchOne('SELECT id, status FROM referral_rewards WHERE source_reference = :sr LIMIT 1', ['sr' => $sourceRef]);
        if ($existing) {
            return ['awarded' => false, 'duplicate' => true, 'reward_id' => $existing['id']];
        }

        // Check if this user was referred
        $referral = $this->db->fetchOne(
            'SELECT * FROM referrals WHERE referred_user_id = :duid LIMIT 1',
            ['duid' => $referredUserId]
        );
        if (!$referral) {
            return ['awarded' => false, 'reason' => 'not_referred'];
        }
        if (in_array($referral['status'], ['blocked', 'flagged'], true)) {
            return ['awarded' => false, 'reason' => 'referral_' . $referral['status']];
        }

        $referrerId = (string)$referral['referrer_user_id'];
        if ($referrerId === $referredUserId) {
            return ['awarded' => false, 'reason' => 'self_referral_blocked'];
        }

        // Service eligibility & minimum spend
        if (!$isSignupEvent) {
            $catAliases = [
                'nin_enrolment' => 'enrolment',
                'nin_mod' => 'nin_modification',
                'bvn_mod' => 'bvn_modification',
            ];
            $mappedCat = $catAliases[$category] ?? $category;
            $isServiceEligible = !empty($cfg['qualifying_services'][$category]) || !empty($cfg['qualifying_services'][$mappedCat]);
            if (!$isServiceEligible) {
                return ['awarded' => false, 'reason' => 'service_not_eligible'];
            }
            if ($gross < (float)$cfg['min_qualifying_spend']) {
                return ['awarded' => false, 'reason' => 'below_min_qualifying_spend'];
            }
        }

        // Trigger mode & max rewards per referee guard
        $awardedCountRow = $this->db->fetchOne(
            'SELECT COUNT(*) AS cnt FROM referral_rewards WHERE referred_user_id = :duid AND status IN ("pending", "available", "paid_out")',
            ['duid' => $referredUserId]
        );
        $priorAwards = (int)($awardedCountRow['cnt'] ?? 0);
        $trigMode = self::normalizeTriggerMode((string)($cfg['trigger_mode'] ?? 'first_qualifying_transaction'));
        if ($trigMode === 'first_qualifying_transaction' && $priorAwards >= 1) {
            return ['awarded' => false, 'reason' => 'first_transaction_already_rewarded'];
        }
        if ($trigMode === 'signup_verified' && !$isSignupEvent && $priorAwards >= 1) {
            return ['awarded' => false, 'reason' => 'signup_bonus_already_awarded'];
        }
        if ($trigMode === 'up_to_n_tx' && $priorAwards >= max(1, (int)$cfg['max_rewards_per_referee'])) {
            return ['awarded' => false, 'reason' => 'max_rewards_per_referee_reached'];
        }
        if ($trigMode === 'every_qualifying_transaction' && (int)$cfg['max_rewards_per_referee'] > 1 && $priorAwards >= (int)$cfg['max_rewards_per_referee']) {
            return ['awarded' => false, 'reason' => 'max_rewards_per_referee_reached'];
        }

        // Monthly cap check for referrer
        if ((float)$cfg['monthly_reward_cap_naira'] > 0) {
            $monthRow = $this->db->fetchOne(
                'SELECT COALESCE(SUM(reward_cash), 0) AS total_month
                 FROM referral_rewards
                 WHERE referrer_user_id = :ruid
                   AND status IN ("pending", "available", "paid_out")
                   AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())',
                ['ruid' => $referrerId]
            );
            $monthEarned = (float)($monthRow['total_month'] ?? 0);
            if ($monthEarned >= (float)$cfg['monthly_reward_cap_naira']) {
                return ['awarded' => false, 'reason' => 'monthly_reward_cap_reached'];
            }
        }

        // Margin calculation
        $netMargin = round($gross - $wholesale - $gatewayFee, 2);

        // Determine active campaign & referrer tier multiplier
        $campaign = null;
        if (!empty($referral['campaign_code'])) {
            $campaign = $this->db->fetchOne(
                'SELECT * FROM referral_campaigns
                 WHERE campaign_code = :cc AND is_active = 1
                   AND (starts_at IS NULL OR starts_at <= NOW())
                   AND (ends_at IS NULL OR ends_at >= NOW())
                 LIMIT 1',
                ['cc' => $referral['campaign_code']]
            );
        }

        $tierMultiplier = 1.0;
        $tierBonusCash = 0.0;
        $tierBonusPoints = 0;
        $referrerStats = $this->db->fetchOne(
            'SELECT COUNT(*) AS q_cnt, COALESCE(SUM(qualifying_spend_total), 0) AS q_vol
             FROM referrals WHERE referrer_user_id = :ruid AND status = "qualified"',
            ['ruid' => $referrerId]
        );
        $tier = $this->resolveReferrerTier(
            (int)($referrerStats['q_cnt'] ?? 0),
            (float)($referrerStats['q_vol'] ?? 0)
        );
        if ($tier) {
            $tierMultiplier = max(1.0, (float)($tier['reward_multiplier'] ?? 1.0));
        }

        // Compute base reward cash & points according to active reward_mode
        $mode = (string)($campaign['reward_mode'] ?? $cfg['reward_mode'] ?? 'fixed');
        $rewardCash = 0.0;
        $rewardPoints = 0;

        switch ($mode) {
            case 'percent_of_spend':
                $pct = $campaign ? (float)$campaign['reward_value'] : (float)$cfg['percent_of_spend'];
                $rewardCash = round($gross * ($pct / 100), 2);
                break;
            case 'percent_of_margin':
                $pct = $campaign ? (float)$campaign['reward_value'] : (float)$cfg['percent_of_margin'];
                $rewardCash = $netMargin > 0 ? round($netMargin * ($pct / 100), 2) : 0.0;
                break;
            case 'points':
                $rewardPoints = (int)$cfg['points_per_qualifying_tx'] + (int)floor(($gross / 1000.0) * (int)$cfg['points_per_1000_naira']);
                break;
            case 'hybrid':
                $rewardCash = (float)$cfg['flat_reward_naira'];
                $rewardPoints = (int)$cfg['points_per_qualifying_tx'];
                break;
            case 'tier':
                $rewardCash = round((float)$cfg['flat_reward_naira'] * $tierMultiplier, 2) + $tierBonusCash;
                $rewardPoints = (int)round((int)$cfg['points_per_qualifying_tx'] * $tierMultiplier) + $tierBonusPoints;
                break;
            case 'milestone':
                $rewardCash = (float)$cfg['flat_reward_naira'];
                if ($priorAwards === 0 && (((int)($referrerStats['q_cnt'] ?? 0) + 1) % 5) === 0) {
                    $rewardCash = round($rewardCash * 2, 2);
                    $rewardPoints = (int)$cfg['points_per_qualifying_tx'] * 2;
                }
                break;
            case 'campaign':
                $rewardCash = $campaign ? (float)$campaign['reward_value'] : (float)$cfg['flat_reward_naira'];
                $rewardPoints = $campaign ? (int)$campaign['points_bonus'] : (int)$cfg['points_per_qualifying_tx'];
                break;
            case 'fixed':
            default:
                $rewardCash = (float)$cfg['flat_reward_naira'];
                if ($campaign && (float)$campaign['reward_value'] > 0) {
                    $rewardCash = (float)$campaign['reward_value'];
                }
                if ($campaign && (int)$campaign['points_bonus'] > 0) {
                    $rewardPoints += (int)$campaign['points_bonus'];
                }
                break;
        }

        if ($mode === 'tier' || ($cfg['reward_mode'] === 'tier' && $tierMultiplier > 1.0)) {
            $rewardCash = round($rewardCash * $tierMultiplier, 2);
        }

        // Campaign budget cap check
        if ($campaign && (float)$campaign['budget_cap'] > 0) {
            $remainingBudget = (float)$campaign['budget_cap'] - (float)$campaign['spent_budget'];
            if ($remainingBudget <= 0) {
                $rewardCash = min($rewardCash, (float)$cfg['flat_reward_naira']);
            } else {
                $rewardCash = min($rewardCash, $remainingBudget);
            }
        }

        // Profit-margin guard: prevent reward payout exceeding realised profit
        $status = 'pending';
        $statusReason = 'Awaiting settlement hold window.';
        if (!$isSignupEvent && !empty($cfg['protect_negative_margin']) && $rewardCash > 0) {
            $maxSafeCash = round($netMargin - (float)$cfg['min_net_margin_naira'], 2);
            if ($maxSafeCash <= 0) {
                $status = 'skipped';
                $statusReason = sprintf(
                    'Blocked by profit guard: net margin (₦%.2f) below minimum protected threshold (₦%.2f).',
                    $netMargin,
                    (float)$cfg['min_net_margin_naira']
                );
                $rewardCash = 0.0;
                $rewardPoints = 0;
            } elseif ($rewardCash > $maxSafeCash) {
                $rewardCash = $maxSafeCash;
                $statusReason = 'Capped dynamically to protect transaction net contribution.';
            }
        }

        $holdHours = (int)$cfg['settlement_hold_hours'];
        $settleImmediate = ($status !== 'skipped' && $holdHours === 0);
        if ($settleImmediate) {
            $status = 'available';
            $statusReason = 'Settled immediately (0h hold policy).';
        }

        $settlesAt = date('Y-m-d H:i:s', time() + ($holdHours * 3600));
        $rewardId = Security::generateUuid();

        $this->db->withTransaction(function (Database $db) use (
            $rewardId, $referrerId, $referredUserId, $referral, $category, $serviceKey,
            $sourceRef, $gross, $wholesale, $gatewayFee, $netMargin, $mode,
            $rewardCash, $rewardPoints, $status, $statusReason, $settlesAt, $settleImmediate, $campaign
        ) {
            $this->ensureBalanceRow($referrerId);

            $db->execute(
                'INSERT INTO referral_rewards
                 (id, referrer_user_id, referred_user_id, referral_id, campaign_code, service_category, service_key,
                  source_reference, gross_amount, wholesale_cost, gateway_fee, net_margin, reward_mode,
                  reward_cash, reward_points, status, status_reason, settles_at, settled_at, created_at)
                 VALUES
                 (:id, :ruid, :duid, :rid, :camp, :cat, :skey, :sref, :gross, :wcost, :gfee, :nmar, :rmode,
                  :rcash, :rpts, :st, :sres, :sat, :sedat, NOW())',
                [
                    'id' => $rewardId,
                    'ruid' => $referrerId,
                    'duid' => $referredUserId,
                    'rid' => $referral['id'],
                    'camp' => $referral['campaign_code'] ?? null,
                    'cat' => $category,
                    'skey' => $serviceKey,
                    'sref' => $sourceRef,
                    'gross' => $gross,
                    'wcost' => $wholesale,
                    'gfee' => $gatewayFee,
                    'nmar' => $netMargin,
                    'rmode' => $mode,
                    'rcash' => $rewardCash,
                    'rpts' => $rewardPoints,
                    'st' => $status,
                    'sres' => $statusReason,
                    'sat' => $settlesAt,
                    'sedat' => $settleImmediate ? date('Y-m-d H:i:s') : null,
                ]
            );

            if ($status !== 'skipped') {
                // Lock balance row FOR UPDATE
                $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $referrerId]);
                if ($bal) {
                    if ($settleImmediate) {
                        $db->execute(
                            'UPDATE referral_balances
                             SET available_balance = available_balance + :cash,
                                 points_balance = points_balance + :pts
                             WHERE user_id = :uid',
                            ['cash' => $rewardCash, 'pts' => $rewardPoints, 'uid' => $referrerId]
                        );
                        if ($rewardPoints > 0) {
                            $beforePts = (int)$bal['points_balance'];
                            $afterPts = $beforePts + $rewardPoints;
                            $db->execute(
                                'INSERT INTO referral_points_ledger
                                 (id, user_id, entry_type, points, balance_before, balance_after, reference, naira_value, conversion_rate, description, created_at)
                                 VALUES (:id, :uid, "CREDIT", :pts, :bb, :ba, :ref, 0.00, 1.0000, :desc, NOW())',
                                [
                                    'id' => Security::generateUuid(),
                                    'uid' => $referrerId,
                                    'pts' => $rewardPoints,
                                    'bb' => $beforePts,
                                    'ba' => $afterPts,
                                    'ref' => 'PTS_' . $sourceRef,
                                    'desc' => "Points earned from referral transaction ({$category})",
                                ]
                            );
                        }
                    } else {
                        $db->execute(
                            'UPDATE referral_balances SET pending_balance = pending_balance + :cash WHERE user_id = :uid',
                            ['cash' => $rewardCash, 'uid' => $referrerId]
                        );
                    }
                }

                $db->execute(
                    'UPDATE referrals
                     SET status = "qualified",
                         qualifying_tx_count = qualifying_tx_count + 1,
                         qualifying_spend_total = qualifying_spend_total + :gross,
                         reward_earned_total = reward_earned_total + :rcash,
                         qualified_at = COALESCE(qualified_at, NOW()),
                         updated_at = NOW()
                     WHERE id = :rid',
                    ['gross' => $gross, 'rcash' => $rewardCash, 'rid' => $referral['id']]
                );

                if ($campaign && $rewardCash > 0) {
                    $db->execute(
                        'UPDATE referral_campaigns SET spent_budget = spent_budget + :rcash WHERE id = :cid',
                        ['rcash' => $rewardCash, 'cid' => $campaign['id']]
                    );
                }
            }
        });

        // Notify referrer (non-blocking)
        if ($status !== 'skipped' && ($rewardCash > 0 || $rewardPoints > 0)) {
            $this->notifyReferralEvent(
                $referrerId,
                'Referral Reward Recorded',
                $settleImmediate
                    ? sprintf('You earned ₦%s%s from a referred transaction (%s). Available now in your Referral Centre.', number_format($rewardCash, 2), $rewardPoints > 0 ? " + {$rewardPoints} pts" : '', $category)
                    : sprintf('A pending referral reward of ₦%s%s has been recorded for %s and enters your hold window.', number_format($rewardCash, 2), $rewardPoints > 0 ? " + {$rewardPoints} pts" : '', $category),
                !empty($cfg['notify_email_on_reward'])
            );
        }

        return [
            'awarded' => ($status !== 'skipped'),
            'reward_id' => $rewardId,
            'status' => $status,
            'reward_cash' => $rewardCash,
            'reward_points' => $rewardPoints,
        ];
    }

    /**
     * Promotes pending referral rewards whose hold window has elapsed into available_balance.
     */
    public function settleMatureRewards(?string $userId = null): int
    {
        $settledCount = 0;

        $this->db->withTransaction(function (Database $db) use ($userId, &$settledCount) {
            $sql = 'SELECT rr.* FROM referral_rewards rr
                    LEFT JOIN referrals r ON r.id = rr.referral_id
                    WHERE rr.status = "pending"
                      AND rr.settles_at IS NOT NULL
                      AND rr.settles_at <= NOW()
                      AND (r.status IS NULL OR r.status NOT IN ("blocked", "flagged"))';
            $params = [];
            if ($userId !== null && $userId !== '') {
                $sql .= ' AND rr.referrer_user_id = :uid';
                $params['uid'] = $userId;
            }
            $sql .= ' LIMIT 100 FOR UPDATE';

            $dueRows = $db->fetchAll($sql, $params);
            foreach ($dueRows as $row) {
                $ruid = (string)$row['referrer_user_id'];
                $cash = (float)$row['reward_cash'];
                $pts = (int)$row['reward_points'];

                $this->ensureBalanceRow($ruid);
                $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $ruid]);
                if (!$bal) {
                    continue;
                }

                $newPending = max(0.0, round((float)$bal['pending_balance'] - $cash, 2));
                $newAvail = round((float)$bal['available_balance'] + $cash, 2);
                $beforePts = (int)$bal['points_balance'];
                $afterPts = $beforePts + $pts;

                $db->execute(
                    'UPDATE referral_balances
                     SET pending_balance = :pend, available_balance = :avail, points_balance = :pts
                     WHERE user_id = :uid',
                    ['pend' => $newPending, 'avail' => $newAvail, 'pts' => $afterPts, 'uid' => $ruid]
                );

                if ($pts > 0) {
                    $db->execute(
                        'INSERT IGNORE INTO referral_points_ledger
                         (id, user_id, entry_type, points, balance_before, balance_after, reference, naira_value, conversion_rate, description, created_at)
                         VALUES (:id, :uid, "CREDIT", :pts, :bb, :ba, :ref, 0.00, 1.0000, :desc, NOW())',
                        [
                            'id' => Security::generateUuid(),
                            'uid' => $ruid,
                            'pts' => $pts,
                            'bb' => $beforePts,
                            'ba' => $afterPts,
                            'ref' => 'PTS_' . $row['source_reference'],
                            'desc' => "Settled referral points ({$row['service_category']})",
                        ]
                    );
                }

                $db->execute(
                    'UPDATE referral_rewards
                     SET status = "available", status_reason = "Hold window completed and reward settled.", settled_at = NOW(), updated_at = NOW()
                     WHERE id = :id',
                    ['id' => $row['id']]
                );
                $settledCount++;
            }
        });

        return $settledCount;
    }

    /**
     * Clawback/Reversal when an underlying transaction is refunded, cancelled, or fails.
     */
    public function reverseRewardsForSource(string $sourceReference, string $reason, ?string $actorId = null): int
    {
        $sourceReference = trim($sourceReference);
        if ($sourceReference === '') {
            return 0;
        }

        $reversedCount = 0;
        $this->db->withTransaction(function (Database $db) use ($sourceReference, $reason, $actorId, &$reversedCount) {
            $rows = $db->fetchAll(
                'SELECT * FROM referral_rewards WHERE source_reference = :sr AND status IN ("pending", "available") FOR UPDATE',
                ['sr' => $sourceReference]
            );
            foreach ($rows as $row) {
                $ruid = (string)$row['referrer_user_id'];
                $cash = (float)$row['reward_cash'];
                $pts = (int)$row['reward_points'];
                $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $ruid]);

                if ($bal) {
                    $pend = (float)$bal['pending_balance'];
                    $avail = (float)$bal['available_balance'];
                    $ptsBal = (int)$bal['points_balance'];

                    if ($row['status'] === 'pending') {
                        $pend = max(0.0, round($pend - $cash, 2));
                    } else {
                        $avail = max(0.0, round($avail - $cash, 2));
                    }

                    $newPts = $pts > 0 ? max(0, $ptsBal - $pts) : $ptsBal;
                    if ($pts > 0 && $ptsBal > 0) {
                        $db->execute(
                            'INSERT IGNORE INTO referral_points_ledger
                             (id, user_id, entry_type, points, balance_before, balance_after, reference, naira_value, conversion_rate, description, created_at)
                             VALUES (:id, :uid, "REVERSAL", :pts, :bb, :ba, :ref, 0.00, 1.0000, :desc, NOW())',
                            [
                                'id' => Security::generateUuid(),
                                'uid' => $ruid,
                                'pts' => $pts,
                                'bb' => $ptsBal,
                                'ba' => $newPts,
                                'ref' => 'REV_PTS_' . $row['source_reference'],
                                'desc' => "Clawback: {$reason}",
                            ]
                        );
                    }

                    $db->execute(
                        'UPDATE referral_balances
                         SET pending_balance = :pend, available_balance = :avail, points_balance = :pts, reversed_total = reversed_total + :rev
                         WHERE user_id = :uid',
                        ['pend' => $pend, 'avail' => $avail, 'pts' => $newPts, 'rev' => $cash, 'uid' => $ruid]
                    );
                }

                $db->execute(
                    'UPDATE referral_rewards
                     SET status = "reversed", status_reason = :r, reversed_at = NOW(), updated_at = NOW()
                     WHERE id = :id',
                    ['r' => $reason, 'id' => $row['id']]
                );

                if (!empty($row['referral_id'])) {
                    $db->execute(
                        'UPDATE referrals SET reward_earned_total = GREATEST(0, reward_earned_total - :cash) WHERE id = :rid',
                        ['cash' => $cash, 'rid' => $row['referral_id']]
                    );
                }

                $this->logAudit($actorId, null, $ruid, 'REFERRAL_REWARD_REVERSED', 'referral_reward', (string)$row['id'], [
                    'source_reference' => $sourceReference,
                    'amount' => $cash,
                    'points' => $pts,
                    'reason' => $reason,
                ]);
                $reversedCount++;
            }
        });

        return $reversedCount;
    }

    public function convertEarningsToWallet(string $userId, float $amount, string $idempotencyKey = '', string $ip = ''): array
    {
        $cfg = $this->getConfig();
        if (empty($cfg['enabled']) || empty($cfg['wallet_conversion_enabled'])) {
            Response::error('Referral wallet conversion is currently disabled by administrator.', 403);
        }

        $this->settleMatureRewards($userId);

        $minConv = (float)$cfg['min_wallet_conversion_naira'];
        $fee = (float)$cfg['wallet_conversion_fee_naira'];
        if ($amount < $minConv) {
            Response::error('Minimum referral conversion amount is ₦' . number_format($minConv, 2) . '.', 422);
        }

        $netCredit = round($amount - $fee, 2);
        if ($netCredit <= 0) {
            Response::error('Conversion amount after fee must be positive.', 422);
        }

        $ref = $idempotencyKey !== ''
            ? 'REFCONV_' . substr(preg_replace('/[^A-Za-z0-9_-]/', '', $idempotencyKey) ?? '', 0, 80)
            : 'REFCONV_' . strtoupper(bin2hex(random_bytes(6)));

        $result = $this->db->withTransaction(function (Database $db) use ($userId, $amount, $fee, $netCredit, $ref) {
            // Check duplicate wallet transaction first
            $dupTx = $db->fetchOne('SELECT id, reference, balance_after FROM transactions WHERE reference = :ref LIMIT 1', ['ref' => $ref]);
            if ($dupTx) {
                $bal = $db->fetchOne('SELECT available_balance FROM referral_balances WHERE user_id = :uid', ['uid' => $userId]);
                return [
                    'duplicate' => true,
                    'reference' => $dupTx['reference'],
                    'wallet_balance_after' => (float)$dupTx['balance_after'],
                    'available_referral_balance' => (float)($bal['available_balance'] ?? 0),
                    'gross_converted' => $amount,
                    'fee' => $fee,
                    'net_credited' => $netCredit,
                ];
            }

            $this->ensureBalanceRow($userId);
            $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $userId]);
            $available = (float)($bal['available_balance'] ?? 0);
            if ($available < $amount) {
                throw new RuntimeException('Insufficient available referral balance. Available: ₦' . number_format($available, 2));
            }

            $newAvail = round($available - $amount, 2);
            $db->execute(
                'UPDATE referral_balances
                 SET available_balance = :avail, transferred_to_wallet_total = transferred_to_wallet_total + :gross
                 WHERE user_id = :uid',
                ['avail' => $newAvail, 'gross' => $amount, 'uid' => $userId]
            );

            $creditRes = $this->walletService->credit(
                $userId,
                $netCredit,
                'referral_conversion',
                $ref,
                sprintf('Referral earnings converted to main wallet (Gross ₦%s, Fee ₦%s)', number_format($amount, 2), number_format($fee, 2)),
                'internal',
                ['gross_converted' => $amount, 'conversion_fee' => $fee]
            );

            return [
                'duplicate' => false,
                'reference' => $ref,
                'wallet_balance_after' => (float)$creditRes['balance_after'],
                'available_referral_balance' => $newAvail,
                'gross_converted' => $amount,
                'fee' => $fee,
                'net_credited' => $netCredit,
            ];
        });

        if (empty($result['duplicate'])) {
            $this->logAudit($userId, null, $userId, 'REFERRAL_WALLET_CONVERSION', 'referral_balance', $ref, [
                'gross' => $amount,
                'fee' => $fee,
                'net_credited' => $netCredit,
                'ip' => $ip,
            ]);
        }

        return $result;
    }

    public function convertPointsToWallet(string $userId, int $points, string $ip = ''): array
    {
        $cfg = $this->getConfig();
        if (empty($cfg['enabled']) || empty($cfg['wallet_conversion_enabled'])) {
            Response::error('Points conversion is currently disabled by administrator.', 403);
        }

        $this->settleMatureRewards($userId);
        $minPts = (int)$cfg['min_points_conversion'];
        $rate = (float)$cfg['point_value_naira'];
        if ($points < $minPts) {
            Response::error("Minimum convertible points is {$minPts} pts.", 422);
        }

        $nairaValue = round($points * $rate, 2);
        if ($nairaValue <= 0) {
            Response::error('Converted wallet value must be positive.', 422);
        }

        $ref = 'PTSCONV_' . strtoupper(bin2hex(random_bytes(6)));

        $res = $this->db->withTransaction(function (Database $db) use ($userId, $points, $rate, $nairaValue, $ref) {
            $this->ensureBalanceRow($userId);
            $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $userId]);
            $curPts = (int)($bal['points_balance'] ?? 0);
            if ($curPts < $points) {
                throw new RuntimeException("Insufficient points balance. Available: {$curPts} pts.");
            }

            $newPts = $curPts - $points;
            $db->execute(
                'UPDATE referral_balances
                 SET points_balance = :np, points_redeemed_total = points_redeemed_total + :pts, transferred_to_wallet_total = transferred_to_wallet_total + :nv
                 WHERE user_id = :uid',
                ['np' => $newPts, 'pts' => $points, 'nv' => $nairaValue, 'uid' => $userId]
            );

            $db->execute(
                'INSERT INTO referral_points_ledger
                 (id, user_id, entry_type, points, balance_before, balance_after, reference, naira_value, conversion_rate, description, created_at)
                 VALUES (:id, :uid, "DEBIT", :pts, :bb, :ba, :ref, :nv, :cr, :desc, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'pts' => $points,
                    'bb' => $curPts,
                    'ba' => $newPts,
                    'ref' => $ref,
                    'nv' => $nairaValue,
                    'cr' => $rate,
                    'desc' => "Converted {$points} referral points to wallet (₦" . number_format($nairaValue, 2) . ')',
                ]
            );

            $walletRes = $this->walletService->credit(
                $userId,
                $nairaValue,
                'points_conversion',
                $ref,
                "Referral points redemption ({$points} pts @ ₦{$rate}/pt)",
                'internal',
                ['points_redeemed' => $points, 'rate' => $rate]
            );

            return [
                'reference' => $ref,
                'points_converted' => $points,
                'points_remaining' => $newPts,
                'naira_credited' => $nairaValue,
                'wallet_balance_after' => (float)$walletRes['balance_after'],
            ];
        });

        $this->logAudit($userId, null, $userId, 'POINTS_WALLET_CONVERSION', 'referral_points', $ref, [
            'points' => $points,
            'naira_credited' => $nairaValue,
            'ip' => $ip,
        ]);

        return $res;
    }

    public function requestWithdrawal(string $userId, array $input, string $ip = ''): array
    {
        $cfg = $this->getConfig();
        if (empty($cfg['enabled']) || empty($cfg['withdrawal_enabled'])) {
            Response::error('Cash bank withdrawals are currently paused by administrator.', 403);
        }

        $this->settleMatureRewards($userId);

        $user = $this->db->fetchOne('SELECT id, email, full_name, kyc_level, tier, status FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
        if (!$user || ($user['status'] ?? 'active') !== 'active') {
            Response::forbidden('Account is not eligible for withdrawals.');
        }

        $reqKyc = (int)$cfg['require_kyc_level_for_withdrawal'];
        $userKyc = max((int)($user['kyc_level'] ?? 1), (int)($user['tier'] ?? 1));
        if ($userKyc < $reqKyc) {
            Response::error("KYC Level {$reqKyc} is required before submitting bank withdrawal requests.", 403);
        }

        $amount = round((float)($input['amount'] ?? 0), 2);
        $bankName = trim((string)($input['bank_name'] ?? ''));
        $accountNumber = preg_replace('/\D/', '', (string)($input['account_number'] ?? '')) ?? '';
        $accountName = trim((string)($input['account_name'] ?? ''));
        $idempotencyKey = substr(trim((string)($input['idempotency_key'] ?? '')), 0, 120);

        if ($bankName === '' || !preg_match('/^\d{10}$/', $accountNumber) || $accountName === '') {
            Response::error('Valid bank name, 10-digit NUBAN account number, and account name are required.', 422);
        }

        $minW = (float)$cfg['min_withdrawal_naira'];
        $maxW = (float)$cfg['max_withdrawal_naira'];
        if ($amount < $minW || $amount > $maxW) {
            Response::error('Withdrawal amount must be between ₦' . number_format($minW, 2) . ' and ₦' . number_format($maxW, 2) . '.', 422);
        }

        $feeVal = (float)$cfg['withdrawal_fee_value'];
        $feeAmount = ($cfg['withdrawal_fee_type'] ?? 'flat') === 'percent'
            ? round($amount * ($feeVal / 100), 2)
            : round($feeVal, 2);
        $netAmount = round($amount - $feeAmount, 2);
        if ($netAmount <= 0) {
            Response::error('Net withdrawal amount after fees must be positive.', 422);
        }

        if ($idempotencyKey !== '') {
            $dup = $this->db->fetchOne(
                'SELECT * FROM referral_withdrawals WHERE user_id = :uid AND idempotency_key = :ik LIMIT 1',
                ['uid' => $userId, 'ik' => $idempotencyKey]
            );
            if ($dup) {
                return ['duplicate' => true, 'withdrawal' => $dup];
            }
        }

        $wId = Security::generateUuid();
        $wNumber = 'WDR-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));

        $row = $this->db->withTransaction(function (Database $db) use (
            $userId, $amount, $feeAmount, $netAmount, $bankName, $accountNumber, $accountName,
            $idempotencyKey, $wId, $wNumber, $cfg
        ) {
            // Check 24h daily withdrawal limit
            $dailyRow = $db->fetchOne(
                'SELECT COALESCE(SUM(gross_amount), 0) AS today_total
                 FROM referral_withdrawals
                 WHERE user_id = :uid AND status IN ("pending", "approved", "processing", "paid")
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)',
                ['uid' => $userId]
            );
            $todayTotal = (float)($dailyRow['today_total'] ?? 0);
            if (($todayTotal + $amount) > (float)$cfg['daily_withdrawal_limit_naira']) {
                throw new RuntimeException('Daily withdrawal limit of ₦' . number_format((float)$cfg['daily_withdrawal_limit_naira'], 2) . ' exceeded.');
            }

            $this->ensureBalanceRow($userId);
            $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $userId]);
            $avail = (float)($bal['available_balance'] ?? 0);
            if ($avail < $amount) {
                throw new RuntimeException('Insufficient available referral earnings. Available: ₦' . number_format($avail, 2));
            }

            // Atomically reserve requested funds
            $db->execute(
                'UPDATE referral_balances
                 SET available_balance = available_balance - :amt1,
                     reserved_for_withdrawal = reserved_for_withdrawal + :amt2
                 WHERE user_id = :uid',
                ['amt1' => $amount, 'amt2' => $amount, 'uid' => $userId]
            );

            $db->execute(
                'INSERT INTO referral_withdrawals
                 (id, withdrawal_number, user_id, bank_name, account_number, account_name,
                  gross_amount, fee_amount, net_amount, status, idempotency_key, created_at)
                 VALUES
                 (:id, :wno, :uid, :bn, :an, :anam, :ga, :fa, :na, "pending", :ik, NOW())',
                [
                    'id' => $wId,
                    'wno' => $wNumber,
                    'uid' => $userId,
                    'bn' => $bankName,
                    'an' => $accountNumber,
                    'anam' => $accountName,
                    'ga' => $amount,
                    'fa' => $feeAmount,
                    'na' => $netAmount,
                    'ik' => $idempotencyKey !== '' ? $idempotencyKey : null,
                ]
            );

            return $db->fetchOne('SELECT * FROM referral_withdrawals WHERE id = :id LIMIT 1', ['id' => $wId]);
        });

        $this->logAudit($userId, $user['email'], $userId, 'WITHDRAWAL_REQUESTED', 'referral_withdrawal', $wId, [
            'withdrawal_number' => $wNumber,
            'gross' => $amount,
            'fee' => $feeAmount,
            'net' => $netAmount,
            'bank_name' => $bankName,
            'ip' => $ip,
        ]);

        $this->notifyReferralEvent(
            $userId,
            'Withdrawal Request Received',
            sprintf('Your referral bank withdrawal %s for ₦%s (Net payout ₦%s) is pending Super Admin review.', $wNumber, number_format($amount, 2), number_format($netAmount, 2)),
            !empty($cfg['notify_email_on_withdrawal'])
        );

        return ['duplicate' => false, 'withdrawal' => $row];
    }

    public function cancelCustomerWithdrawal(string $userId, string $withdrawalId, string $ip = ''): array
    {
        $row = $this->db->withTransaction(function (Database $db) use ($userId, $withdrawalId) {
            $w = $db->fetchOne(
                'SELECT * FROM referral_withdrawals WHERE (id = :id1 OR withdrawal_number = :id2) AND user_id = :uid LIMIT 1 FOR UPDATE',
                ['id1' => $withdrawalId, 'id2' => $withdrawalId, 'uid' => $userId]
            );
            if (!$w) {
                throw new RuntimeException('Withdrawal request not found.');
            }
            if ($w['status'] !== 'pending') {
                throw new RuntimeException("Only pending withdrawals can be cancelled (current status: {$w['status']}).");
            }

            $gross = (float)$w['gross_amount'];
            $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $userId]);
            if ($bal) {
                $newRes = max(0.0, round((float)$bal['reserved_for_withdrawal'] - $gross, 2));
                $newAvail = round((float)$bal['available_balance'] + $gross, 2);
                $db->execute(
                    'UPDATE referral_balances SET reserved_for_withdrawal = :res, available_balance = :av WHERE user_id = :uid',
                    ['res' => $newRes, 'av' => $newAvail, 'uid' => $userId]
                );
            }

            $db->execute(
                'UPDATE referral_withdrawals SET status = "cancelled", admin_note = "Cancelled by customer prior to approval", updated_at = NOW() WHERE id = :id',
                ['id' => $w['id']]
            );
            return $db->fetchOne('SELECT * FROM referral_withdrawals WHERE id = :id', ['id' => $w['id']]);
        });

        $this->logAudit($userId, null, $userId, 'WITHDRAWAL_CANCELLED_BY_CUSTOMER', 'referral_withdrawal', (string)$row['id'], ['ip' => $ip]);
        return $row;
    }

    public function adminProcessWithdrawal(string $withdrawalId, string $action, array $payload, array $admin, string $ip = ''): array
    {
        $action = strtolower(trim($action));
        $note = trim((string)($payload['admin_note'] ?? $payload['note'] ?? ''));
        $reason = trim((string)($payload['rejection_reason'] ?? $payload['reason'] ?? ''));
        $payRef = trim((string)($payload['payment_reference'] ?? ''));
        $receiptUrl = trim((string)($payload['receipt_url'] ?? ''));

        $allowedActions = ['approve', 'process', 'mark_paid', 'reject', 'fail'];
        if (!in_array($action, $allowedActions, true)) {
            Response::error('Invalid withdrawal action. Allowed: approve, process, mark_paid, reject, fail.', 422);
        }

        if ($action === 'mark_paid' && $payRef === '') {
            Response::error('A bank payment/transfer reference is required before marking a withdrawal as Paid.', 422);
        }
        if (in_array($action, ['reject', 'fail'], true) && $reason === '' && $note === '') {
            Response::error('Please provide a clear reason before rejecting or failing a withdrawal.', 422);
        }

        $updated = $this->db->withTransaction(function (Database $db) use ($withdrawalId, $action, $note, $reason, $payRef, $receiptUrl, $admin) {
            $w = $db->fetchOne(
                'SELECT * FROM referral_withdrawals WHERE id = :id1 OR withdrawal_number = :id2 LIMIT 1 FOR UPDATE',
                ['id1' => $withdrawalId, 'id2' => $withdrawalId]
            );
            if (!$w) {
                throw new RuntimeException('Withdrawal request not found.');
            }

            $curStatus = (string)$w['status'];
            $uid = (string)$w['user_id'];
            $gross = (float)$w['gross_amount'];

            if (in_array($curStatus, ['paid', 'rejected', 'failed', 'cancelled'], true)) {
                throw new RuntimeException("Withdrawal {$w['withdrawal_number']} is already finalized ({$curStatus}).");
            }

            $bal = $db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid FOR UPDATE', ['uid' => $uid]);

            if ($action === 'approve') {
                if ($curStatus !== 'pending') {
                    throw new RuntimeException("Can only approve pending withdrawals (current: {$curStatus}).");
                }
                // Approved does NOT auto-mark paid; funds remain reserved awaiting manual payout reference
                $db->execute(
                    'UPDATE referral_withdrawals
                     SET status = "approved", admin_note = COALESCE(NULLIF(:note, ""), admin_note),
                         reviewed_by = :rby, reviewed_at = NOW(), updated_at = NOW()
                     WHERE id = :id',
                    ['note' => $note, 'rby' => $admin['email'], 'id' => $w['id']]
                );
            } elseif ($action === 'process') {
                if (!in_array($curStatus, ['pending', 'approved'], true)) {
                    throw new RuntimeException("Can only move pending/approved withdrawals to processing.");
                }
                $db->execute(
                    'UPDATE referral_withdrawals
                     SET status = "processing", admin_note = COALESCE(NULLIF(:note, ""), admin_note),
                         reviewed_by = COALESCE(reviewed_by, :rby), reviewed_at = COALESCE(reviewed_at, NOW()), updated_at = NOW()
                     WHERE id = :id',
                    ['note' => $note, 'rby' => $admin['email'], 'id' => $w['id']]
                );
            } elseif ($action === 'mark_paid') {
                if (!in_array($curStatus, ['pending', 'approved', 'processing'], true)) {
                    throw new RuntimeException("Cannot mark withdrawal {$curStatus} as paid.");
                }
                if ($bal) {
                    $newRes = max(0.0, round((float)$bal['reserved_for_withdrawal'] - $gross, 2));
                    $db->execute(
                        'UPDATE referral_balances
                         SET reserved_for_withdrawal = :res, total_withdrawn = total_withdrawn + :gross
                         WHERE user_id = :uid',
                        ['res' => $newRes, 'gross' => $gross, 'uid' => $uid]
                    );
                }
                $db->execute(
                    'UPDATE referral_withdrawals
                     SET status = "paid",
                         payment_reference = :pref,
                         receipt_url = COALESCE(NULLIF(:rurl, ""), receipt_url),
                         admin_note = COALESCE(NULLIF(:note, ""), admin_note),
                         reviewed_by = COALESCE(reviewed_by, :rby),
                         reviewed_at = COALESCE(reviewed_at, NOW()),
                         paid_by = :pby,
                         paid_at = NOW(),
                         updated_at = NOW()
                     WHERE id = :id',
                    [
                        'pref' => $payRef,
                        'rurl' => $receiptUrl,
                        'note' => $note,
                        'rby' => $admin['email'],
                        'pby' => $admin['email'],
                        'id' => $w['id'],
                    ]
                );
            } elseif (in_array($action, ['reject', 'fail'], true)) {
                $targetStatus = $action === 'reject' ? 'rejected' : 'failed';
                if ($bal) {
                    $newRes = max(0.0, round((float)$bal['reserved_for_withdrawal'] - $gross, 2));
                    $newAvail = round((float)$bal['available_balance'] + $gross, 2);
                    $db->execute(
                        'UPDATE referral_balances
                         SET reserved_for_withdrawal = :res, available_balance = :av
                         WHERE user_id = :uid',
                        ['res' => $newRes, 'av' => $newAvail, 'uid' => $uid]
                    );
                }
                $db->execute(
                    'UPDATE referral_withdrawals
                     SET status = :st,
                         rejection_reason = :rr,
                         admin_note = COALESCE(NULLIF(:note, ""), admin_note),
                         reviewed_by = :rby,
                         reviewed_at = NOW(),
                         updated_at = NOW()
                     WHERE id = :id',
                    [
                        'st' => $targetStatus,
                        'rr' => $reason ?: $note,
                        'note' => $note,
                        'rby' => $admin['email'],
                        'id' => $w['id'],
                    ]
                );
            }

            return $db->fetchOne('SELECT * FROM referral_withdrawals WHERE id = :id', ['id' => $w['id']]);
        });

        $this->logAudit($admin['id'], $admin['email'], (string)$updated['user_id'], 'ADMIN_WITHDRAWAL_' . strtoupper($action), 'referral_withdrawal', (string)$updated['id'], [
            'status' => $updated['status'],
            'payment_reference' => $payRef ?: null,
            'reason' => $reason ?: $note,
            'ip' => $ip,
        ]);

        $cfg = $this->getConfig();
        $msgMap = [
            'approved' => "Your withdrawal {$updated['withdrawal_number']} (₦" . number_format((float)$updated['net_amount'], 2) . ") has been approved and queued for bank settlement.",
            'processing' => "Your withdrawal {$updated['withdrawal_number']} is now being processed for bank payout.",
            'paid' => "Your withdrawal {$updated['withdrawal_number']} (Net ₦" . number_format((float)$updated['net_amount'], 2) . ") has been paid! Ref: {$payRef}.",
            'rejected' => "Your withdrawal {$updated['withdrawal_number']} was rejected ({$updated['rejection_reason']}). Reserved funds returned to your available referral balance.",
            'failed' => "Your withdrawal {$updated['withdrawal_number']} failed ({$updated['rejection_reason']}). Reserved funds returned to your available referral balance.",
        ];
        if (!empty($msgMap[$updated['status']])) {
            $this->notifyReferralEvent(
                (string)$updated['user_id'],
                'Withdrawal Update: ' . strtoupper((string)$updated['status']),
                $msgMap[$updated['status']],
                !empty($cfg['notify_email_on_withdrawal'])
            );
        }

        return $updated;
    }

    public function getCustomerDashboard(string $userId): array
    {
        $this->settleMatureRewards($userId);
        $this->ensureBalanceRow($userId);

        $user = $this->db->fetchOne('SELECT id, full_name, email, referral_code, kyc_level, tier FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
        $bal = $this->db->fetchOne('SELECT * FROM referral_balances WHERE user_id = :uid LIMIT 1', ['uid' => $userId]);

        $refStats = $this->db->fetchOne(
            'SELECT
                COUNT(*) AS total_referrals,
                SUM(CASE WHEN status = "qualified" THEN 1 ELSE 0 END) AS qualified_referrals,
                SUM(CASE WHEN status = "registered" THEN 1 ELSE 0 END) AS pending_referrals,
                COALESCE(SUM(qualifying_spend_total), 0) AS referred_volume,
                COALESCE(SUM(reward_earned_total), 0) AS lifetime_earned
             FROM referrals WHERE referrer_user_id = :uid',
            ['uid' => $userId]
        );

        $tier = $this->resolveReferrerTier(
            (int)($refStats['qualified_referrals'] ?? 0),
            (float)($refStats['referred_volume'] ?? 0)
        );
        $tiers = $this->db->fetchAll('SELECT * FROM referral_tiers WHERE is_active = 1 ORDER BY display_order ASC');

        // Privacy-masked referred users (no full email, phone, or wholesale provider cost exposed)
        $referredRows = $this->db->fetchAll(
            'SELECT r.id, r.status, r.attribution_channel, r.campaign_code, r.qualifying_tx_count,
                    r.qualifying_spend_total, r.reward_earned_total, r.qualified_at, r.created_at,
                    u.full_name, u.phone_number
             FROM referrals r
             INNER JOIN users u ON u.id = r.referred_user_id
             WHERE r.referrer_user_id = :uid
             ORDER BY r.created_at DESC
             LIMIT 100',
            ['uid' => $userId]
        );
        foreach ($referredRows as &$rr) {
            $rr['customer_label'] = self::maskName((string)$rr['full_name']);
            $rr['phone_masked'] = self::maskPhone((string)$rr['phone_number']);
            $rr['qualifying_tx_count'] = (int)$rr['qualifying_tx_count'];
            $rr['qualifying_spend_total'] = (float)$rr['qualifying_spend_total'];
            $rr['reward_earned_total'] = (float)$rr['reward_earned_total'];
            unset($rr['full_name'], $rr['phone_number']);
        }

        // Rewards ledger (strip internal wholesale_cost/gateway_fee/net_margin from customer payload!)
        $rewardRows = $this->db->fetchAll(
            'SELECT rr.id, rr.service_category, rr.service_key, rr.source_reference, rr.gross_amount,
                    rr.reward_mode, rr.reward_cash, rr.reward_points, rr.status, rr.status_reason,
                    rr.settles_at, rr.settled_at, rr.reversed_at, rr.created_at,
                    u.full_name AS referred_name
             FROM referral_rewards rr
             LEFT JOIN users u ON u.id = rr.referred_user_id
             WHERE rr.referrer_user_id = :uid
             ORDER BY rr.created_at DESC
             LIMIT 100',
            ['uid' => $userId]
        );
        foreach ($rewardRows as &$rw) {
            $rw['referred_customer'] = self::maskName((string)($rw['referred_name'] ?? 'Customer'));
            $rw['gross_amount'] = (float)$rw['gross_amount'];
            $rw['reward_cash'] = (float)$rw['reward_cash'];
            $rw['reward_points'] = (int)$rw['reward_points'];
            unset($rw['referred_name']);
        }

        $withdrawals = $this->db->fetchAll(
            'SELECT id, withdrawal_number, bank_name, account_number, account_name,
                    gross_amount, fee_amount, net_amount, status, payment_reference,
                    rejection_reason, admin_note, reviewed_at, paid_at, created_at
             FROM referral_withdrawals
             WHERE user_id = :uid
             ORDER BY created_at DESC
             LIMIT 50',
            ['uid' => $userId]
        );
        foreach ($withdrawals as &$w) {
            $w['gross_amount'] = (float)$w['gross_amount'];
            $w['fee_amount'] = (float)$w['fee_amount'];
            $w['net_amount'] = (float)$w['net_amount'];
        }

        $pointsLedger = $this->db->fetchAll(
            'SELECT id, entry_type, points, balance_before, balance_after, reference, naira_value, conversion_rate, description, created_at
             FROM referral_points_ledger WHERE user_id = :uid ORDER BY created_at DESC LIMIT 50',
            ['uid' => $userId]
        );

        $trend = $this->db->fetchAll(
            'SELECT DATE(created_at) AS day, COUNT(*) AS referrals_count,
                    SUM(CASE WHEN status = "qualified" THEN 1 ELSE 0 END) AS qualified_count,
                    COALESCE(SUM(reward_earned_total), 0) AS rewards_total
             FROM referrals
             WHERE referrer_user_id = :uid AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY DATE(created_at)
             ORDER BY day ASC',
            ['uid' => $userId]
        );

        $baseUrl = ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https://' : 'https://') . ($_SERVER['HTTP_HOST'] ?? 'hambaktech.com.ng');
        $refCode = (string)($user['referral_code'] ?? '');
        $refLink = rtrim($baseUrl, '/') . '/?ref=' . rawurlencode($refCode);

        return [
            'referral_code' => $refCode,
            'referral_link' => $refLink,
            'balance' => [
                'pending_balance' => (float)($bal['pending_balance'] ?? 0),
                'available_balance' => (float)($bal['available_balance'] ?? 0),
                'reserved_for_withdrawal' => (float)($bal['reserved_for_withdrawal'] ?? 0),
                'transferred_to_wallet_total' => (float)($bal['transferred_to_wallet_total'] ?? 0),
                'total_withdrawn' => (float)($bal['total_withdrawn'] ?? 0),
                'reversed_total' => (float)($bal['reversed_total'] ?? 0),
                'points_balance' => (int)($bal['points_balance'] ?? 0),
                'points_redeemed_total' => (int)($bal['points_redeemed_total'] ?? 0),
            ],
            'stats' => [
                'total_referrals' => (int)($refStats['total_referrals'] ?? 0),
                'qualified_referrals' => (int)($refStats['qualified_referrals'] ?? 0),
                'pending_referrals' => (int)($refStats['pending_referrals'] ?? 0),
                'referred_volume' => (float)($refStats['referred_volume'] ?? 0),
                'lifetime_earned' => (float)($refStats['lifetime_earned'] ?? 0),
            ],
            'current_tier' => $tier,
            'tiers' => $tiers,
            'referred_users' => $referredRows,
            'rewards' => $rewardRows,
            'withdrawals' => $withdrawals,
            'points_ledger' => $pointsLedger,
            'trend' => $trend,
            'config' => $this->getPublicConfig(),
        ];
    }

    /**
     * Complete Company Referral Growth & ROI Report (Report #12) + Admin Overview Metrics
     */
    public function getReferralGrowthReport(array $filters = []): array
    {
        $this->settleMatureRewards(null);

        $dateClauseRef = '';
        $dateClauseRew = '';
        $params = [];

        if (!empty($filters['start_date'])) {
            $dateClauseRef .= ' AND r.created_at >= :sdate';
            $dateClauseRew .= ' AND rr.created_at >= :sdate';
            $params['sdate'] = $filters['start_date'] . ' 00:00:00';
        }
        if (!empty($filters['end_date'])) {
            $dateClauseRef .= ' AND r.created_at <= :edate';
            $dateClauseRew .= ' AND rr.created_at <= :edate';
            $params['edate'] = $filters['end_date'] . ' 23:59:59';
        }
        if (!empty($filters['campaign_code'])) {
            $dateClauseRef .= ' AND r.campaign_code = :ccode';
            $dateClauseRew .= ' AND rr.campaign_code = :ccode';
            $params['ccode'] = strtoupper(trim((string)$filters['campaign_code']));
        }
        if (!empty($filters['service_category'])) {
            $dateClauseRew .= ' AND rr.service_category = :scat';
            $params['scat'] = trim((string)$filters['service_category']);
        }

        $funnel = $this->db->fetchOne(
            "SELECT
                COUNT(*) AS total_signups,
                SUM(CASE WHEN r.status = 'qualified' THEN 1 ELSE 0 END) AS qualified_signups,
                SUM(CASE WHEN r.status = 'flagged' THEN 1 ELSE 0 END) AS flagged_signups,
                SUM(CASE WHEN r.status = 'blocked' THEN 1 ELSE 0 END) AS blocked_signups,
                COUNT(DISTINCT r.referrer_user_id) AS active_referrers
             FROM referrals r WHERE 1=1 {$dateClauseRef}",
            $params
        );

        $economics = $this->db->fetchOne(
            "SELECT
                COUNT(*) AS qualifying_transactions,
                COALESCE(SUM(CASE WHEN rr.status IN ('pending', 'available', 'paid_out') THEN rr.gross_amount ELSE 0 END), 0) AS referred_revenue,
                COALESCE(SUM(CASE WHEN rr.status IN ('pending', 'available', 'paid_out') THEN rr.wholesale_cost ELSE 0 END), 0) AS wholesale_cost,
                COALESCE(SUM(CASE WHEN rr.status IN ('pending', 'available', 'paid_out') THEN rr.gateway_fee ELSE 0 END), 0) AS gateway_fees,
                COALESCE(SUM(CASE WHEN rr.status = 'pending' THEN rr.reward_cash ELSE 0 END), 0) AS pending_reward_liability,
                COALESCE(SUM(CASE WHEN rr.status IN ('available', 'paid_out') THEN rr.reward_cash ELSE 0 END), 0) AS approved_rewards_naira,
                COALESCE(SUM(CASE WHEN rr.status = 'reversed' THEN rr.reward_cash ELSE 0 END), 0) AS reversed_rewards_naira,
                COALESCE(SUM(CASE WHEN rr.status IN ('pending', 'available', 'paid_out') THEN rr.reward_points ELSE 0 END), 0) AS total_points_issued
             FROM referral_rewards rr WHERE 1=1 {$dateClauseRew}",
            $params
        );

        $payoutStats = $this->db->fetchOne(
            'SELECT
                COALESCE(SUM(CASE WHEN status IN ("pending", "approved", "processing") THEN gross_amount ELSE 0 END), 0) AS reserved_withdrawals,
                COALESCE(SUM(CASE WHEN status = "paid" THEN net_amount ELSE 0 END), 0) AS total_cash_paid_out,
                COUNT(CASE WHEN status IN ("pending", "approved", "processing") THEN 1 END) AS pending_withdrawal_count
             FROM referral_withdrawals'
        );

        $balancesAgg = $this->db->fetchOne(
            'SELECT
                COALESCE(SUM(pending_balance), 0) AS total_pending_balances,
                COALESCE(SUM(available_balance), 0) AS total_available_balances,
                COALESCE(SUM(reserved_for_withdrawal), 0) AS total_reserved_balances,
                COALESCE(SUM(transferred_to_wallet_total), 0) AS total_converted_to_wallet,
                COALESCE(SUM(points_balance), 0) AS outstanding_points_liability
             FROM referral_balances'
        );

        $grossRev = (float)($economics['referred_revenue'] ?? 0);
        $wCost = (float)($economics['wholesale_cost'] ?? 0);
        $gFee = (float)($economics['gateway_fees'] ?? 0);
        $approvedRew = (float)($economics['approved_rewards_naira'] ?? 0);
        $pendRew = (float)($economics['pending_reward_liability'] ?? 0);
        $totalRewardCost = round($approvedRew + $pendRew, 2);
        $netContribution = round($grossRev - $wCost - $gFee - $totalRewardCost, 2);
        $roiPercent = $totalRewardCost > 0 ? round(($netContribution / $totalRewardCost) * 100, 2) : ($netContribution > 0 ? 100.0 : 0.0);

        $totalSignups = (int)($funnel['total_signups'] ?? 0);
        $qualifiedSignups = (int)($funnel['qualified_signups'] ?? 0);
        $conversionRate = $totalSignups > 0 ? round(($qualifiedSignups / $totalSignups) * 100, 2) : 0.0;

        $serviceBreakdown = $this->db->fetchAll(
            "SELECT rr.service_category,
                    COUNT(*) AS tx_count,
                    COALESCE(SUM(rr.gross_amount), 0) AS revenue,
                    COALESCE(SUM(rr.wholesale_cost), 0) AS wholesale_cost,
                    COALESCE(SUM(rr.net_margin), 0) AS net_margin,
                    COALESCE(SUM(rr.reward_cash), 0) AS rewards_cost
             FROM referral_rewards rr
             WHERE rr.status IN ('pending', 'available', 'paid_out') {$dateClauseRew}
             GROUP BY rr.service_category
             ORDER BY revenue DESC",
            $params
        );

        $topReferrers = $this->db->fetchAll(
            'SELECT u.id, u.full_name, u.email, u.referral_code,
                    COUNT(r.id) AS total_referred,
                    SUM(CASE WHEN r.status = "qualified" THEN 1 ELSE 0 END) AS qualified_count,
                    COALESCE(SUM(r.qualifying_spend_total), 0) AS generated_revenue,
                    COALESCE(SUM(r.reward_earned_total), 0) AS rewards_earned,
                    COALESCE(rb.available_balance, 0) AS available_balance,
                    COALESCE(rb.points_balance, 0) AS points_balance
             FROM referrals r
             INNER JOIN users u ON u.id = r.referrer_user_id
             LEFT JOIN referral_balances rb ON rb.user_id = u.id
             GROUP BY u.id, u.full_name, u.email, u.referral_code, rb.available_balance, rb.points_balance
             ORDER BY generated_revenue DESC, qualified_count DESC
             LIMIT 15'
        );

        $campaignStats = $this->db->fetchAll(
            'SELECT c.id, c.campaign_code, c.name, c.reward_mode, c.reward_value, c.budget_cap, c.spent_budget, c.is_active,
                    COUNT(r.id) AS signups,
                    SUM(CASE WHEN r.status = "qualified" THEN 1 ELSE 0 END) AS qualified_signups,
                    COALESCE(SUM(r.qualifying_spend_total), 0) AS generated_revenue
             FROM referral_campaigns c
             LEFT JOIN referrals r ON r.campaign_code = c.campaign_code
             GROUP BY c.id, c.campaign_code, c.name, c.reward_mode, c.reward_value, c.budget_cap, c.spent_budget, c.is_active
             ORDER BY generated_revenue DESC'
        );

        return [
            'generated_at' => date('c'),
            'summary' => [
                'total_referrals' => $totalSignups,
                'qualified_referrals' => $qualifiedSignups,
                'flagged_referrals' => (int)($funnel['flagged_signups'] ?? 0),
                'blocked_referrals' => (int)($funnel['blocked_signups'] ?? 0),
                'active_referrers' => (int)($funnel['active_referrers'] ?? 0),
                'conversion_rate_percent' => $conversionRate,
                'qualifying_transactions' => (int)($economics['qualifying_transactions'] ?? 0),
                'referred_revenue' => $grossRev,
                'wholesale_cost' => $wCost,
                'gateway_fees' => $gFee,
                'pending_reward_liability' => $pendRew,
                'approved_rewards_naira' => $approvedRew,
                'reversed_rewards_naira' => (float)($economics['reversed_rewards_naira'] ?? 0),
                'total_reward_cost' => $totalRewardCost,
                'net_referral_contribution' => $netContribution,
                'roi_percent' => $roiPercent,
                'total_converted_to_wallet' => (float)($balancesAgg['total_converted_to_wallet'] ?? 0),
                'total_cash_paid_out' => (float)($payoutStats['total_cash_paid_out'] ?? 0),
                'pending_withdrawal_amount' => (float)($payoutStats['reserved_withdrawals'] ?? 0),
                'pending_withdrawal_count' => (int)($payoutStats['pending_withdrawal_count'] ?? 0),
                'outstanding_available_balances' => (float)($balancesAgg['total_available_balances'] ?? 0),
                'outstanding_points_liability' => (int)($balancesAgg['outstanding_points_liability'] ?? 0),
            ],
            'service_breakdown' => $serviceBreakdown,
            'top_referrers' => $topReferrers,
            'campaigns' => $campaignStats,
        ];
    }

    public function resolveReferrerTier(int $qualifiedReferrals, float $referredVolume): ?array
    {
        $tiers = $this->db->fetchAll('SELECT * FROM referral_tiers WHERE is_active = 1 ORDER BY min_qualified_referrals DESC, min_referred_volume DESC');
        foreach ($tiers as $t) {
            if ($qualifiedReferrals >= (int)$t['min_qualified_referrals'] && $referredVolume >= (float)$t['min_referred_volume']) {
                return $t;
            }
        }
        return $tiers ? end($tiers) : null;
    }

    public static function maskName(string $name): string
    {
        $parts = preg_split('/\s+/', trim($name)) ?: [];
        $masked = [];
        foreach ($parts as $p) {
            $len = strlen($p);
            if ($len <= 1) {
                $masked[] = $p . '*';
            } elseif ($len === 2) {
                $masked[] = $p[0] . '*';
            } else {
                $masked[] = $p[0] . str_repeat('*', min(5, $len - 2)) . $p[$len - 1];
            }
        }
        return implode(' ', $masked) ?: 'Customer';
    }

    public static function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if (strlen($digits) < 6) {
            return '****';
        }
        return substr($digits, 0, 3) . '****' . substr($digits, -3);
    }

    private function notifyReferralEvent(string $userId, string $title, string $message, bool $sendEmail = true): void
    {
        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                 VALUES (:id, :uid, :t, :m, "info", 0, NOW())',
                ['id' => Security::generateUuid(), 'uid' => $userId, 't' => $title, 'm' => $message]
            );
            if ($sendEmail) {
                $u = $this->db->fetchOne('SELECT email, full_name FROM users WHERE id = :id LIMIT 1', ['id' => $userId]);
                if ($u && !empty($u['email'])) {
                    $mail = new MailService();
                    $mail->send(
                        (string)$u['email'],
                        (string)($u['full_name'] ?? 'Customer'),
                        "HAMBAKTECH — {$title}",
                        "<p>Hello " . htmlspecialchars((string)$u['full_name']) . ",</p><p>" . htmlspecialchars($message) . "</p>"
                    );
                }
            }
        } catch (\Throwable) {
        }
    }

    public function logAudit(?string $actorId, ?string $actorEmail, ?string $targetUserId, string $action, string $entityType, ?string $entityId, array $details): void
    {
        try {
            $this->db->execute(
                'INSERT INTO referral_audit_logs (id, actor_user_id, actor_email, target_user_id, action, entity_type, entity_id, details, ip_address, created_at)
                 VALUES (:id, :aid, :aem, :tuid, :act, :et, :eid, :det, :ip, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'aid' => $actorId,
                    'aem' => $actorEmail,
                    'tuid' => $targetUserId,
                    'act' => $action,
                    'et' => $entityType,
                    'eid' => $entityId,
                    'det' => json_encode($details),
                    'ip' => substr((string)($details['ip'] ?? ($_SERVER['REMOTE_ADDR'] ?? '')), 0, 45),
                ]
            );
        } catch (\Throwable) {
        }
    }
}
