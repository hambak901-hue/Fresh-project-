<?php
/**
 * @file AccountingService.php
 * Integrated Business Management & Double-Perspective Accounting Engine for HAMBAKTECH.
 * Connects existing MySQL website transactions/wallets/orders with physical counter sales,
 * expenses, other income, inventory/COGS, Cash/POS/Bank reconciliations, and automated
 * 12:00 PM Africa/Lagos daily financial email reporting.
 */

declare(strict_types=1);

namespace HambakTech\Services;

use DateTimeImmutable;
use DateTimeZone;
use HambakTech\Core\Database;
use HambakTech\Core\SchemaSync;
use HambakTech\Core\Security;
use RuntimeException;
use Throwable;

class AccountingService
{
    private Database $db;
    private DateTimeZone $lagosTz;
    private DateTimeZone $utcTz;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
        $this->lagosTz = new DateTimeZone('Africa/Lagos');
        $this->utcTz = new DateTimeZone('UTC');
        SchemaSync::syncAccountingSchema($this->db);
    }

    // =========================================================================
    // 1. TIMEZONE & CONFIGURATION HELPERS
    // =========================================================================

    public function lagosNow(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', $this->lagosTz);
    }

    /**
     * Converts any MySQL UTC timestamp ('Y-m-d H:i:s') to Africa/Lagos DateTimeImmutable.
     */
    private function utcToLagos(string $utcDateTime): DateTimeImmutable
    {
        $clean = trim($utcDateTime);
        if ($clean === '') {
            return $this->lagosNow();
        }
        try {
            $dt = new DateTimeImmutable($clean, $this->utcTz);
            return $dt->setTimezone($this->lagosTz);
        } catch (Throwable) {
            return $this->lagosNow();
        }
    }

    /**
     * Converts a Lagos date range [dateFrom .. dateTo] (Y-m-d) into exact UTC SQL bounds.
     *
     * @return array{date_from: string, date_to: string, start_utc: string, end_utc: string, start_lagos: string, end_lagos: string}
     */
    public function resolveLagosDateWindow(?string $dateFrom = null, ?string $dateTo = null, ?string $endTimeLagos = null): array
    {
        $todayLagos = $this->lagosNow()->format('Y-m-d');
        $from = ($dateFrom && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) ? $dateFrom : $todayLagos;
        $to = ($dateTo && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) ? $dateTo : $from;

        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $endClock = ($endTimeLagos && preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $endTimeLagos))
            ? (strlen($endTimeLagos) === 5 ? $endTimeLagos . ':59' : $endTimeLagos)
            : '23:59:59';

        $startLagos = new DateTimeImmutable("{$from} 00:00:00", $this->lagosTz);
        $endLagos = new DateTimeImmutable("{$to} {$endClock}", $this->lagosTz);

        return [
            'date_from' => $from,
            'date_to' => $to,
            'start_utc' => $startLagos->setTimezone($this->utcTz)->format('Y-m-d H:i:s'),
            'end_utc' => $endLagos->setTimezone($this->utcTz)->format('Y-m-d H:i:s'),
            'start_lagos' => $startLagos->format('Y-m-d H:i:s'),
            'end_lagos' => $endLagos->format('Y-m-d H:i:s'),
        ];
    }

    public function getConfig(): array
    {
        $defaults = [
            'business_currency' => 'NGN',
            'timezone' => 'Africa/Lagos',
            'daily_email_enabled' => true,
            'daily_email_hour_lagos' => 12,
            'daily_email_minute_lagos' => 0,
            'daily_email_cutoff_time' => '11:59',
            'daily_email_recipients' => ['admin@hambaktech.com.ng'],
            'report_sections' => [
                'executive_kpis' => true,
                'previous_day_final' => true,
                'today_morning_midday' => true,
                'website_service_breakdown' => true,
                'physical_business_sales' => true,
                'wallet_liability_summary' => true,
                'expenses_and_other_income' => true,
                'cash_pos_bank_reconciliation' => true,
                'low_stock_alerts' => true,
                'refunds_and_exceptions' => true,
            ],
            'pos_fee_percent' => 0.50,
            'pos_fee_cap' => 100.00,
            'paystack_fee_percent' => 1.50,
            'paystack_flat_fee' => 100.00,
            'paystack_flat_threshold' => 2500.00,
            'paystack_fee_cap' => 2000.00,
            'flutterwave_fee_percent' => 1.40,
            'flutterwave_fee_cap' => 2000.00,
            'gateway_fee_borne_by' => 'company',
            'low_stock_alert_default' => 5,
            'variance_alert_threshold' => 500.00,
            'restrict_reversals_to_superadmin' => true,
            'restrict_config_to_superadmin' => true,
            'exclude_internal_admin_wallets_from_liability' => true,
            'auto_sync_on_dashboard_load' => true,
            'cron_secret_token' => '',
        ];

        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "accounting_settings" LIMIT 1');
            if ($row && !empty($row['setting_value'])) {
                $decoded = json_decode((string)$row['setting_value'], true);
                if (is_array($decoded)) {
                    $defaults = array_replace_recursive($defaults, $decoded);
                }
            }
        } catch (Throwable) {
        }

        // Normalize recipients list
        $recs = [];
        foreach ((array)($defaults['daily_email_recipients'] ?? []) as $r) {
            $email = strtolower(trim((string)$r));
            if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $recs[] = $email;
            }
        }
        $defaults['daily_email_recipients'] = !empty($recs) ? array_values(array_unique($recs)) : ['admin@hambaktech.com.ng'];
        return $defaults;
    }

    public function updateConfig(array $payload, array $actor): array
    {
        $current = $this->getConfig();

        if (isset($payload['daily_email_enabled'])) {
            $current['daily_email_enabled'] = (bool)$payload['daily_email_enabled'];
        }
        if (isset($payload['daily_email_hour_lagos'])) {
            $current['daily_email_hour_lagos'] = max(0, min(23, (int)$payload['daily_email_hour_lagos']));
        }
        if (isset($payload['daily_email_minute_lagos'])) {
            $current['daily_email_minute_lagos'] = max(0, min(59, (int)$payload['daily_email_minute_lagos']));
        }
        if (!empty($payload['daily_email_cutoff_time']) && preg_match('/^\d{2}:\d{2}(:\d{2})?$/', (string)$payload['daily_email_cutoff_time'])) {
            $current['daily_email_cutoff_time'] = substr((string)$payload['daily_email_cutoff_time'], 0, 5);
        }
        if (isset($payload['daily_email_recipients'])) {
            $rawList = is_string($payload['daily_email_recipients'])
                ? preg_split('/[\s,;]+/', $payload['daily_email_recipients'])
                : (array)$payload['daily_email_recipients'];
            $clean = [];
            foreach ((array)$rawList as $item) {
                $em = strtolower(trim((string)$item));
                if ($em !== '' && filter_var($em, FILTER_VALIDATE_EMAIL)) {
                    $clean[] = $em;
                }
            }
            if (empty($clean)) {
                throw new RuntimeException('Provide at least one valid recipient email address.');
            }
            $current['daily_email_recipients'] = array_values(array_unique($clean));
        }
        if (isset($payload['report_sections']) && is_array($payload['report_sections'])) {
            foreach ($current['report_sections'] as $k => $v) {
                if (array_key_exists($k, $payload['report_sections'])) {
                    $current['report_sections'][$k] = (bool)$payload['report_sections'][$k];
                }
            }
        }
        foreach ([
            'pos_fee_percent',
            'pos_fee_cap',
            'paystack_fee_percent',
            'paystack_flat_fee',
            'paystack_flat_threshold',
            'paystack_fee_cap',
            'flutterwave_fee_percent',
            'flutterwave_fee_cap',
            'variance_alert_threshold',
        ] as $numKey) {
            if (isset($payload[$numKey])) {
                $current[$numKey] = max(0.0, round((float)$payload[$numKey], 2));
            }
        }
        if (isset($payload['low_stock_alert_default'])) {
            $current['low_stock_alert_default'] = max(0, (int)$payload['low_stock_alert_default']);
        }
        if (isset($payload['gateway_fee_borne_by']) && in_array($payload['gateway_fee_borne_by'], ['company', 'customer'], true)) {
            $current['gateway_fee_borne_by'] = $payload['gateway_fee_borne_by'];
        }
        foreach ([
            'restrict_reversals_to_superadmin',
            'restrict_config_to_superadmin',
            'exclude_internal_admin_wallets_from_liability',
            'auto_sync_on_dashboard_load',
        ] as $boolKey) {
            if (isset($payload[$boolKey])) {
                $current[$boolKey] = (bool)$payload[$boolKey];
            }
        }

        $json = json_encode($current, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES (:id, "accounting_settings", :val1, "accounting", "HAMBAKTECH Integrated Business Management & Accounting Configuration", NOW())
             ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
            ['id' => Security::generateUuid(), 'val1' => $json, 'val2' => $json]
        );

        $this->recordAudit($actor, 'ACCOUNTING_CONFIG_UPDATED', ['updated_keys' => array_keys($payload)]);
        return $current;
    }

    public function getAccounts(): array
    {
        return $this->db->fetchAll('SELECT * FROM accounting_accounts ORDER BY FIELD(account_type, "cash", "pos", "bank", "gateway", "liability"), account_name ASC');
    }

    public function updateAccount(string $accountCode, array $payload, array $actor): array
    {
        $acc = $this->db->fetchOne('SELECT * FROM accounting_accounts WHERE account_code = :code LIMIT 1', ['code' => $accountCode]);
        if (!$acc) {
            throw new RuntimeException('Accounting account not found.');
        }

        $fields = [];
        $params = ['code' => $accountCode];

        if (isset($payload['opening_balance'])) {
            $fields[] = 'opening_balance = :ob';
            $params['ob'] = number_format((float)$payload['opening_balance'], 2, '.', '');
        }
        if (!empty($payload['opening_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$payload['opening_date'])) {
            $fields[] = 'opening_date = :od';
            $params['od'] = $payload['opening_date'];
        }
        if (isset($payload['bank_name'])) {
            $fields[] = 'bank_name = :bn';
            $params['bn'] = substr(trim((string)$payload['bank_name']), 0, 100);
        }
        if (isset($payload['account_number'])) {
            $fields[] = 'account_number = :an';
            $params['an'] = substr(trim((string)$payload['account_number']), 0, 50);
        }
        if (isset($payload['account_name']) && trim((string)$payload['account_name']) !== '') {
            $fields[] = 'account_name = :nm';
            $params['nm'] = substr(trim((string)$payload['account_name']), 0, 120);
        }
        if (isset($payload['notes'])) {
            $fields[] = 'notes = :nt';
            $params['nt'] = trim((string)$payload['notes']);
        }
        if (isset($payload['is_active'])) {
            $fields[] = 'is_active = :ia';
            $params['ia'] = !empty($payload['is_active']) ? 1 : 0;
        }

        if (!empty($fields)) {
            $this->db->execute('UPDATE accounting_accounts SET ' . implode(', ', $fields) . ', updated_at = NOW() WHERE account_code = :code', $params);
        }

        $this->recordAudit($actor, 'ACCOUNTING_ACCOUNT_UPDATED', ['account_code' => $accountCode, 'changes' => array_keys($payload)]);
        return $this->db->fetchOne('SELECT * FROM accounting_accounts WHERE account_code = :code LIMIT 1', ['code' => $accountCode]) ?? $acc;
    }

    // =========================================================================
    // 2. AUTOMATIC WEBSITE TRANSACTION ACCOUNTING SYNC (NON-DUPLICATIVE)
    // =========================================================================

    private function estimateGatewayFee(string $gateway, float $amount, array $cfg): float
    {
        if (($cfg['gateway_fee_borne_by'] ?? 'company') !== 'company' || $amount <= 0) {
            return 0.0;
        }
        $gw = strtolower($gateway);
        if ($gw === 'paystack') {
            $pct = (float)($cfg['paystack_fee_percent'] ?? 1.50);
            $flat = (float)($cfg['paystack_flat_fee'] ?? 100.00);
            $thresh = (float)($cfg['paystack_flat_threshold'] ?? 2500.00);
            $cap = (float)($cfg['paystack_fee_cap'] ?? 2000.00);
            $fee = ($amount * ($pct / 100.0)) + ($amount >= $thresh ? $flat : 0.0);
            return round(min($cap, $fee), 2);
        }
        if ($gw === 'flutterwave') {
            $pct = (float)($cfg['flutterwave_fee_percent'] ?? 1.40);
            $cap = (float)($cfg['flutterwave_fee_cap'] ?? 2000.00);
            $fee = $amount * ($pct / 100.0);
            return round(min($cap, $fee), 2);
        }
        return 0.0;
    }

    private function classifyServiceDomain(string $category, string $reference, ?array $telecomOrder, ?array $verRecord, ?array $modReq, ?array $enrOrder, ?array $footprint = null): string
    {
        if ($telecomOrder && !empty($telecomOrder['service_type'])) {
            return strtolower((string)$telecomOrder['service_type']);
        }
        if ($verRecord) {
            $sk = strtolower((string)($verRecord['service_key'] ?? ''));
            $tp = strtolower((string)($verRecord['type'] ?? ''));
            if (str_contains($sk, 'bvn') || str_contains($tp, 'bvn')) {
                return 'bvn_verification';
            }
            return 'nin_verification';
        }
        if ($modReq) {
            $it = strtolower((string)($modReq['identity_type'] ?? ''));
            return $it === 'bvn' ? 'bvn_modification' : 'nin_modification';
        }
        if ($enrOrder) {
            return 'enrolment';
        }
        if ($footprint && !empty($footprint['service_type'])) {
            $fpSvc = strtolower(trim((string)$footprint['service_type']));
            if (str_contains($fpSvc, 'bvn_mod')) return 'bvn_modification';
            if (str_contains($fpSvc, 'bvn')) return 'bvn_verification';
            if (str_contains($fpSvc, 'nin_mod')) return 'nin_modification';
            if (str_contains($fpSvc, 'nin') || str_contains($fpSvc, 'phone_v') || str_contains($fpSvc, 'vnin') || str_contains($fpSvc, 'demog')) return 'nin_verification';
            if (in_array($fpSvc, ['data', 'airtime', 'airtime_pin', 'data_pin', 'cable', 'electricity', 'exam', 'bulksms'], true)) return $fpSvc;
        }
        $cat = strtolower(trim($category));
        $ref = strtoupper(trim($reference));
        if (str_contains($cat, 'bvn_mod') || str_starts_with($ref, 'MOD_BVN')) return 'bvn_modification';
        if (str_contains($cat, 'nin_mod') || str_contains($cat, 'modification') || str_starts_with($ref, 'MOD_')) return 'nin_modification';
        if (str_contains($cat, 'enrol') || str_starts_with($ref, 'ENR_')) return 'enrolment';
        if (str_contains($cat, 'bvn')) return 'bvn_verification';
        if (str_contains($cat, 'nin') || str_contains($cat, 'verification') || str_starts_with($ref, 'VRF_')) return 'nin_verification';
        if (str_contains($cat, 'data_pin') || str_contains($cat, 'datapin')) return 'data_pin';
        if (str_contains($cat, 'airtime_pin') || str_contains($cat, 'airtimepin')) return 'airtime_pin';
        if (str_contains($cat, 'data')) return 'data';
        if (str_contains($cat, 'airtime')) return 'airtime';
        if (str_contains($cat, 'cable')) return 'cable';
        if (str_contains($cat, 'electric')) return 'electricity';
        if (str_contains($cat, 'exam')) return 'exam';
        if (str_contains($cat, 'sms')) return 'bulksms';
        return $cat !== '' ? $cat : 'website_service';
    }

    /**
     * Idempotently synchronizes existing live website MySQL records (`transactions` and paid `referral_withdrawals`)
     * into `accounting_entries` without duplicating or altering any customer, wallet, or Paystack data.
     */
    public function syncWebsiteTransactions(bool $forceFullRefresh = false): array
    {
        $cfg = $this->getConfig();
        $excludeInternal = !empty($cfg['exclude_internal_admin_wallets_from_liability']);

        $txRows = $this->db->fetchAll(
            'SELECT t.*, u.full_name AS user_name, u.email AS user_email, u.role AS user_role
             FROM transactions t
             LEFT JOIN users u ON u.id = t.user_id
             WHERE t.status = "successful"
             ORDER BY t.created_at ASC, t.id ASC'
        );

        // Preload lookup maps for fast O(1) enrichment (zero N+1 queries)
        $telecomByRef = [];
        $telecomByUser = [];
        $claimedTelecomIds = [];
        foreach ($this->db->fetchAll('SELECT id, user_id, service_type, network, plan, amount, cost_price, profit, provider_id, provider_ref, idempotency_key, status, metadata, created_at FROM telecom_orders') as $o) {
            if (!empty($o['provider_ref'])) {
                $telecomByRef[(string)$o['provider_ref']] = $o;
            }
            if (!empty($o['idempotency_key'])) {
                $telecomByRef[(string)$o['idempotency_key']] = $o;
            }
            $telecomByRef[$o['id']] = $o;
            if (!empty($o['user_id'])) {
                $telecomByUser[(string)$o['user_id']][] = $o;
            }
        }

        $verifByRef = [];
        foreach ($this->db->fetchAll('SELECT id, user_id, type, service_key, provider, cost, provider_cost, status, reference FROM verification_records') as $v) {
            if (!empty($v['reference'])) {
                $verifByRef[(string)$v['reference']] = $v;
            }
            $verifByRef[$v['id']] = $v;
        }

        $modByRef = [];
        foreach ($this->db->fetchAll('SELECT id, user_id, identity_type, service_key, customer_price, provider_cost, status, payment_reference FROM modification_requests') as $m) {
            if (!empty($m['payment_reference'])) {
                $modByRef[(string)$m['payment_reference']] = $m;
            }
        }

        $enrByRef = [];
        foreach ($this->db->fetchAll('SELECT id, user_id, service_key, customer_price, provider_cost, status, payment_reference FROM enrolment_orders') as $e) {
            if (!empty($e['payment_reference'])) {
                $enrByRef[(string)$e['payment_reference']] = $e;
            }
        }

        $payByRef = [];
        foreach ($this->db->fetchAll('SELECT id, gateway, reference, amount, fee, status FROM payment_records') as $p) {
            if (!empty($p['reference'])) {
                $payByRef[(string)$p['reference']] = $p;
            }
        }

        // Preload authoritative activity_footprints, service_catalogue, and telecom_plans for historical cost attribution
        $footprintByRef = [];
        try {
            foreach ($this->db->fetchAll('SELECT reference, service_type, provider, status, amount, metadata FROM activity_footprints WHERE reference IS NOT NULL AND reference != "" ORDER BY FIELD(status, "successful", "processing", "pending", "failed") ASC, created_at DESC') as $fp) {
                $fRef = (string)$fp['reference'];
                if (!isset($footprintByRef[$fRef])) {
                    $footprintByRef[$fRef] = $fp;
                }
            }
        } catch (Throwable) {
        }

        $catalogueCostByKey = [];
        try {
            foreach ($this->db->fetchAll('SELECT service_key, wholesale_cost FROM service_catalogue') as $sc) {
                $catalogueCostByKey[strtolower((string)$sc['service_key'])] = round((float)$sc['wholesale_cost'], 2);
            }
        } catch (Throwable) {
        }

        $planCostByNetName = [];
        try {
            foreach ($this->db->fetchAll('SELECT network, name, price, wholesale_cost FROM telecom_plans') as $tp) {
                $k = strtoupper(trim((string)$tp['network'])) . '|' . strtolower(trim((string)$tp['name']));
                $planCostByNetName[$k] = [
                    'wholesale_cost' => round((float)$tp['wholesale_cost'], 2),
                    'price' => round((float)$tp['price'], 2),
                ];
            }
        } catch (Throwable) {
        }

        $txByRef = [];
        $refundedOrigRefs = [];
        foreach ($txRows as $tr) {
            if (!empty($tr['reference'])) {
                $tRef = (string)$tr['reference'];
                $txByRef[$tRef] = $tr;
                $upperTRef = strtoupper($tRef);
                if (str_starts_with($upperTRef, 'REFUND_VT_') || str_starts_with($upperTRef, 'REFUND_') || str_starts_with($upperTRef, 'REV_')) {
                    $orig = preg_replace('/^(REFUND_VT_|REFUND_|REV_)/i', '', $tRef) ?? '';
                    if ($orig !== '') {
                        $refundedOrigRefs[$orig] = true;
                    }
                }
            }
        }

        $existingEntries = [];
        foreach ($this->db->fetchAll('SELECT id, source_table, source_id, entry_category, is_reversed, reconciliation_status FROM accounting_entries WHERE source_origin = "website"') as $ee) {
            $k = $ee['source_table'] . '|' . $ee['source_id'] . '|' . $ee['entry_category'];
            $existingEntries[$k] = $ee;
        }

        $inserted = 0;
        $updated = 0;
        $skipped = 0;

        $upsertSql = 'INSERT INTO accounting_entries
            (id, entry_number, entry_date, occurred_at, occurred_lagos, source_origin, source_table, source_id, entry_category, service_domain, title, description, reference, gross_amount, revenue_amount, cost_amount, fee_amount, expense_amount, net_profit_impact, wallet_liability_delta, payment_channel, account_code, reconciliation_status, customer_id, customer_name, metadata)
            VALUES
            (:id, :eno, :edate, :occ_utc, :occ_lagos, "website", :stbl, :sid, :ecat, :sdom, :title, :desc, :ref, :gross, :rev, :cost, :fee, :exp, :profit, :liab, :pchan, :acode, :rstat, :cid, :cname, :meta)
            ON DUPLICATE KEY UPDATE
                entry_date = IF(is_reversed = 1, entry_date, VALUES(entry_date)),
                occurred_at = IF(is_reversed = 1, occurred_at, VALUES(occurred_at)),
                occurred_lagos = IF(is_reversed = 1, occurred_lagos, VALUES(occurred_lagos)),
                service_domain = IF(is_reversed = 1, service_domain, VALUES(service_domain)),
                title = IF(is_reversed = 1, title, VALUES(title)),
                description = IF(is_reversed = 1, description, VALUES(description)),
                gross_amount = IF(is_reversed = 1, gross_amount, VALUES(gross_amount)),
                revenue_amount = IF(is_reversed = 1, revenue_amount, VALUES(revenue_amount)),
                cost_amount = IF(is_reversed = 1, cost_amount, VALUES(cost_amount)),
                fee_amount = IF(is_reversed = 1, fee_amount, VALUES(fee_amount)),
                expense_amount = IF(is_reversed = 1, expense_amount, VALUES(expense_amount)),
                net_profit_impact = IF(is_reversed = 1, net_profit_impact, VALUES(net_profit_impact)),
                wallet_liability_delta = IF(is_reversed = 1, wallet_liability_delta, VALUES(wallet_liability_delta)),
                payment_channel = IF(is_reversed = 1, payment_channel, VALUES(payment_channel)),
                account_code = IF(is_reversed = 1, account_code, VALUES(account_code)),
                metadata = IF(is_reversed = 1, metadata, VALUES(metadata))';

        foreach ($txRows as $tx) {
            $ref = (string)($tx['reference'] ?? '');
            $cat = strtolower((string)($tx['category'] ?? ''));
            $type = strtolower((string)($tx['type'] ?? ''));
            $gateway = strtolower((string)($tx['gateway'] ?? 'internal'));
            $amount = round((float)($tx['amount'] ?? 0), 2);
            $userRole = strtolower((string)($tx['user_role'] ?? 'customer'));
            $isCustomer = $userRole === 'customer' || !$excludeInternal;

            $metaArr = is_string($tx['metadata'] ?? null) ? json_decode((string)$tx['metadata'], true) : (is_array($tx['metadata'] ?? null) ? $tx['metadata'] : []);
            $orderIdMeta = is_array($metaArr) ? (string)($metaArr['order_id'] ?? '') : '';

            $utcStr = (string)($tx['created_at'] ?? gmdate('Y-m-d H:i:s'));
            $lagosDt = $this->utcToLagos($utcStr);
            $entryDate = $lagosDt->format('Y-m-d');
            $occurredLagos = $lagosDt->format('Y-m-d H:i:s');

            $entryCategory = 'website_service_sale';
            $serviceDomain = 'website_service';
            $title = (string)($tx['description'] ?: ucfirst(str_replace('_', ' ', $cat)));
            $revenue = 0.0;
            $cost = 0.0;
            $fee = 0.0;
            $grossOut = $amount;
            $expense = 0.0;
            $liabilityDelta = 0.0;
            $paymentChannel = $gateway !== '' ? $gateway : 'wallet';
            $accountCode = 'LIABILITY_CUSTOMER_WALLETS';
            $reconcileStatus = 'na';
            $costVerified = true;
            $costSource = 'not_applicable';
            $providerRawWalletDelta = null;

            $isRefundRef = str_starts_with(strtoupper($ref), 'REFUND_') || str_starts_with(strtoupper($ref), 'REV_') || $cat === 'reversal';
            $tOrder = null;
            $vRec = null;
            $mReq = null;
            $eOrd = null;
            $fp = $footprintByRef[$ref] ?? null;

            if ($type === 'credit') {
                if ($isRefundRef) {
                    // Identify original reference
                    $origRef = preg_replace('/^(REFUND_VT_|REFUND_|REV_)/i', '', $ref) ?? $ref;
                    $origTx = $txByRef[$origRef] ?? null;
                    $tOrder = $telecomByRef[$origRef] ?? null;
                    $vRec = $verifByRef[$origRef] ?? null;
                    $mReq = $modByRef[$origRef] ?? null;
                    $eOrd = $enrByRef[$origRef] ?? null;
                    $origFp = $footprintByRef[$origRef] ?? null;

                    if (($origTx && strtolower((string)$origTx['type']) === 'debit') || $tOrder || $vRec || $mReq || $eOrd) {
                        $entryCategory = 'customer_refund';
                        $serviceDomain = $this->classifyServiceDomain((string)($origTx['category'] ?? $cat), $origRef, $tOrder, $vRec, $mReq, $eOrd, $origFp);
                        $revenue = -$amount;
                        $cost = 0.0;
                        $costSource = 'customer_refund';
                        $liabilityDelta = $isCustomer ? $amount : 0.0;
                        $paymentChannel = 'wallet';
                        $accountCode = 'LIABILITY_CUSTOMER_WALLETS';
                    } else {
                        $entryCategory = 'wallet_refund_adjustment';
                        $serviceDomain = 'wallet_adjustment';
                        $revenue = 0.0;
                        $liabilityDelta = $isCustomer ? $amount : 0.0;
                        $paymentChannel = 'wallet';
                        $accountCode = 'LIABILITY_CUSTOMER_WALLETS';
                    }
                } else {
                    // Wallet funding, bank transfer deposit, referral reward conversion, or admin credit: NEVER revenue!
                    $entryCategory = ($cat === 'referral_conversion' || $cat === 'referral_reward')
                        ? 'referral_wallet_credit'
                        : (($cat === 'manual_adjustment' || $cat === 'administrative_adjustment') ? 'wallet_credit_adjustment' : 'wallet_funding');
                    $serviceDomain = 'wallet_funding';
                    $revenue = 0.0; // Strictly NEVER count wallet funding as revenue
                    $liabilityDelta = $isCustomer ? $amount : 0.0;

                    if ($gateway === 'paystack') {
                        $paymentChannel = (is_array($metaArr) && ($metaArr['funding_method'] ?? '') === 'paystack_dva')
                            ? 'paystack_dva'
                            : 'paystack';
                        $accountCode = 'GATEWAY_PAYSTACK';
                        $reconcileStatus = 'unreconciled';
                        $recordedFee = isset($payByRef[$ref]['fee']) ? (float)$payByRef[$ref]['fee'] : 0.0;
                        $metaFee = is_array($metaArr) ? (float)($metaArr['paystack_fee'] ?? $metaArr['gateway_fee'] ?? 0) : 0.0;
                        $metaGross = is_array($metaArr) ? (float)($metaArr['gross_amount'] ?? 0) : 0.0;
                        if ($metaGross > 0) {
                            $grossOut = $metaGross;
                        }
                        $actualFee = $recordedFee > 0 ? $recordedFee : ($metaFee > 0 ? $metaFee : $this->estimateGatewayFee('paystack', $grossOut, $cfg));
                        $feeBearer = is_array($metaArr) ? strtolower((string)($metaArr['fee_bearer'] ?? '')) : '';
                        // If customer bore the Paystack fee, net wallet credit ($amount) already excludes the fee so platform net impact is 0 rather than double-deducted
                        $fee = ($feeBearer === 'customer') ? 0.0 : $actualFee;
                    } elseif ($gateway === 'flutterwave') {
                        $paymentChannel = 'flutterwave';
                        $accountCode = 'GATEWAY_FLUTTERWAVE';
                        $reconcileStatus = 'unreconciled';
                        $recordedFee = isset($payByRef[$ref]['fee']) ? (float)$payByRef[$ref]['fee'] : 0.0;
                        $fee = $recordedFee > 0 ? $recordedFee : $this->estimateGatewayFee('flutterwave', $amount, $cfg);
                    } elseif ($gateway === 'manual_transfer' || str_contains($cat, 'bank')) {
                        $paymentChannel = 'bank_transfer';
                        $accountCode = 'BANK_MAIN';
                        $reconcileStatus = 'unreconciled';
                    } else {
                        $paymentChannel = 'wallet';
                        $accountCode = 'LIABILITY_CUSTOMER_WALLETS';
                    }
                }
            } elseif ($type === 'debit') {
                $tOrder = $telecomByRef[$ref] ?? ($orderIdMeta !== '' ? ($telecomByRef[$orderIdMeta] ?? null) : null);
                if (!$tOrder && !empty($tx['user_id']) && !empty($telecomByUser[(string)$tx['user_id']])) {
                    $txTs = strtotime($utcStr) ?: 0;
                    foreach ($telecomByUser[(string)$tx['user_id']] as $cand) {
                        if (isset($claimedTelecomIds[$cand['id']])) {
                            continue;
                        }
                        $candTs = strtotime((string)($cand['created_at'] ?? '')) ?: 0;
                        if (abs((float)$cand['amount'] - $amount) < 0.05 && abs($candTs - $txTs) <= 20) {
                            $tOrder = $cand;
                            break;
                        }
                    }
                }
                if ($tOrder && !empty($tOrder['id'])) {
                    $claimedTelecomIds[$tOrder['id']] = true;
                }
                $vRec = $verifByRef[$ref] ?? null;
                $mReq = $modByRef[$ref] ?? null;
                $eOrd = $enrByRef[$ref] ?? null;

                $isAdminDebitAdj = in_array($cat, ['manual_adjustment', 'administrative_adjustment', 'withdrawal'], true) && !$tOrder && !$vRec && !$mReq && !$eOrd;
                if ($isAdminDebitAdj) {
                    $entryCategory = 'wallet_debit_adjustment';
                    $serviceDomain = 'wallet_adjustment';
                    $revenue = 0.0;
                    $cost = 0.0;
                    $liabilityDelta = $isCustomer ? -$amount : 0.0;
                    $paymentChannel = 'wallet';
                    $accountCode = 'LIABILITY_CUSTOMER_WALLETS';
                } else {
                    $entryCategory = 'website_service_sale';
                    $serviceDomain = $this->classifyServiceDomain($cat, $ref, $tOrder, $vRec, $mReq, $eOrd, $fp);
                    $revenue = $amount;
                    $liabilityDelta = $isCustomer ? -$amount : 0.0;
                    $paymentChannel = 'wallet';
                    $accountCode = 'LIABILITY_CUSTOMER_WALLETS';

                    $hasMatchingRefund = isset($refundedOrigRefs[$ref]);
                    $orderFailed = ($tOrder && strtolower((string)($tOrder['status'] ?? '')) !== 'successful')
                        || ($vRec && strtolower((string)($vRec['status'] ?? '')) !== 'completed')
                        || ($mReq && in_array(strtolower((string)($mReq['status'] ?? '')), ['failed', 'rejected', 'refunded'], true))
                        || ($eOrd && in_array(strtolower((string)($eOrd['status'] ?? '')), ['failed', 'rejected', 'refunded'], true));

                    if ($hasMatchingRefund || $orderFailed) {
                        $cost = 0.0;
                        $costVerified = true;
                        $costSource = 'refunded_or_failed_order';
                    } elseif ($tOrder && strtolower((string)($tOrder['status'] ?? '')) === 'successful') {
                        $cost = round((float)($tOrder['cost_price'] ?? 0), 2);
                        $tMeta = is_string($tOrder['metadata'] ?? null) ? json_decode((string)$tOrder['metadata'], true) : (is_array($tOrder['metadata'] ?? null) ? $tOrder['metadata'] : []);
                        if (is_array($tMeta) && isset($tMeta['raw']['old_balance'], $tMeta['raw']['new_balance'])) {
                            $delta = round((float)$tMeta['raw']['old_balance'] - (float)$tMeta['raw']['new_balance'], 2);
                            if ($delta > 0) {
                                $providerRawWalletDelta = $delta;
                            }
                        }
                        if ($cost > 0) {
                            $costVerified = true;
                            $costSource = 'telecom_orders';
                        } else {
                            $costVerified = false;
                            $costSource = 'unverified_telecom_zero_cost';
                        }
                    } elseif ($vRec && strtolower((string)($vRec['status'] ?? '')) === 'completed') {
                        $cost = round((float)($vRec['provider_cost'] ?? 0), 2);
                        if ($cost > 0) {
                            $costVerified = true;
                            $costSource = 'verification_records';
                        } else {
                            $vKey = strtolower((string)($vRec['service_key'] ?? ''));
                            if ($vKey !== '' && ($catalogueCostByKey[$vKey] ?? 0) > 0) {
                                $cost = $catalogueCostByKey[$vKey];
                                $costVerified = true;
                                $costSource = 'verification_records+service_catalogue';
                            } else {
                                $costVerified = false;
                                $costSource = 'unverified_verification_zero_cost';
                            }
                        }
                    } elseif ($mReq && !in_array(strtolower((string)($mReq['status'] ?? '')), ['failed', 'rejected', 'refunded'], true)) {
                        $cost = round((float)($mReq['provider_cost'] ?? 0), 2);
                        $costVerified = $cost > 0;
                        $costSource = $costVerified ? 'modification_requests' : 'unverified_mod_zero_cost';
                    } elseif ($eOrd && !in_array(strtolower((string)($eOrd['status'] ?? '')), ['failed', 'rejected', 'refunded'], true)) {
                        $cost = round((float)($eOrd['provider_cost'] ?? 0), 2);
                        $costVerified = $cost > 0;
                        $costSource = $costVerified ? 'enrolment_orders' : 'unverified_enrolment_zero_cost';
                    } elseif ($fp && strtolower((string)($fp['status'] ?? '')) === 'successful') {
                        // Authoritative match via existing activity_footprints + catalogue / plan table
                        $fpSvc = strtolower(trim((string)($fp['service_type'] ?? '')));
                        $fpMeta = is_string($fp['metadata'] ?? null) ? json_decode((string)$fp['metadata'], true) : (is_array($fp['metadata'] ?? null) ? $fp['metadata'] : []);
                        if ($fpSvc !== '' && ($catalogueCostByKey[$fpSvc] ?? 0) > 0) {
                            $cost = $catalogueCostByKey[$fpSvc];
                            $costVerified = true;
                            $costSource = 'activity_footprint+service_catalogue';
                        } elseif ($fpSvc === 'data' && is_array($fpMeta) && !empty($fpMeta['network']) && !empty($fpMeta['plan'])) {
                            $planKey = strtoupper(trim((string)$fpMeta['network'])) . '|' . strtolower(trim((string)$fpMeta['plan']));
                            if (isset($planCostByNetName[$planKey]) && $planCostByNetName[$planKey]['wholesale_cost'] > 0) {
                                $cost = $planCostByNetName[$planKey]['wholesale_cost'];
                                $costVerified = true;
                                $costSource = 'activity_footprint+telecom_plans';
                            } else {
                                $costVerified = false;
                                $costSource = 'unverified_no_provider_record';
                            }
                        } else {
                            $costVerified = false;
                            $costSource = 'unverified_no_provider_record';
                        }
                    } else {
                        $costVerified = false;
                        $costSource = 'unverified_no_provider_record';
                    }
                }
            }

            // Never report unverified profit on completed sales lacking reliable provider cost records
            if ($entryCategory === 'website_service_sale' && !$costVerified) {
                $cost = 0.0;
                $netProfitImpact = 0.0;
            } else {
                $netProfitImpact = round($revenue - $cost - $fee - $expense, 2);
            }
            $lookupKey = 'transactions|' . $tx['id'] . '|' . $entryCategory;
            $exists = $existingEntries[$lookupKey] ?? null;

            if ($exists && !$forceFullRefresh) {
                // Skip already-synced entries unless forceFullRefresh or pending cost update on recent transactions
                if (strtotime($utcStr) < (time() - 86400 * 7)) {
                    $skipped++;
                    continue;
                }
            }

            $entryNumber = 'ACC-WEB-' . substr(strtoupper(md5($tx['id'] . ':' . $entryCategory)), 0, 12);
            $metaOut = [
                'original_category' => $tx['category'] ?? '',
                'original_type' => $tx['type'] ?? '',
                'gateway' => $gateway,
                'user_role' => $userRole,
                'order_status' => $tOrder['status'] ?? ($vRec['status'] ?? ($mReq['status'] ?? ($eOrd['status'] ?? ($fp['status'] ?? null)))),
                'cost_verified' => $costVerified,
                'cost_source' => $costSource,
            ];
            if ($providerRawWalletDelta !== null) {
                $metaOut['provider_raw_wallet_delta'] = $providerRawWalletDelta;
            }

            $this->db->execute($upsertSql, [
                'id' => $exists ? $exists['id'] : Security::generateUuid(),
                'eno' => $entryNumber,
                'edate' => $entryDate,
                'occ_utc' => $utcStr,
                'occ_lagos' => $occurredLagos,
                'stbl' => 'transactions',
                'sid' => (string)$tx['id'],
                'ecat' => $entryCategory,
                'sdom' => $serviceDomain,
                'title' => mb_substr($title, 0, 190),
                'desc' => (string)($tx['description'] ?? ''),
                'ref' => $ref !== '' ? $ref : (string)$tx['id'],
                'gross' => number_format($grossOut, 2, '.', ''),
                'rev' => number_format($revenue, 2, '.', ''),
                'cost' => number_format($cost, 2, '.', ''),
                'fee' => number_format($fee, 2, '.', ''),
                'exp' => number_format($expense, 2, '.', ''),
                'profit' => number_format($netProfitImpact, 2, '.', ''),
                'liab' => number_format($liabilityDelta, 2, '.', ''),
                'pchan' => $paymentChannel,
                'acode' => $accountCode,
                'rstat' => $reconcileStatus,
                'cid' => (string)($tx['user_id'] ?? ''),
                'cname' => (string)($tx['user_name'] ?? $tx['user_email'] ?? 'Customer'),
                'meta' => json_encode($metaOut),
            ]);

            if ($exists) {
                $updated++;
            } else {
                $inserted++;
            }
        }

        // Sync paid referral cash withdrawals as bank payout expenses
        try {
            $paidWithdrawals = $this->db->fetchAll(
                'SELECT rw.*, u.full_name AS user_name, u.email AS user_email
                 FROM referral_withdrawals rw
                 LEFT JOIN users u ON u.id = rw.user_id
                 WHERE rw.status = "paid"'
            );
            foreach ($paidWithdrawals as $rw) {
                $utcStr = (string)($rw['paid_at'] ?: $rw['updated_at'] ?: $rw['created_at']);
                $lagosDt = $this->utcToLagos($utcStr);
                $netAmt = round((float)($rw['net_amount'] ?? 0), 2);
                $feeAmt = round((float)($rw['fee_amount'] ?? 0), 2);
                $profitImpact = round(-$netAmt, 2);
                $lookupKey = 'referral_withdrawals|' . $rw['id'] . '|referral_payout';
                $exists = $existingEntries[$lookupKey] ?? null;
                $entryNumber = 'ACC-RWD-' . substr(strtoupper(md5($rw['id'])), 0, 10);

                $this->db->execute($upsertSql, [
                    'id' => $exists ? $exists['id'] : Security::generateUuid(),
                    'eno' => $entryNumber,
                    'edate' => $lagosDt->format('Y-m-d'),
                    'occ_utc' => $utcStr,
                    'occ_lagos' => $lagosDt->format('Y-m-d H:i:s'),
                    'stbl' => 'referral_withdrawals',
                    'sid' => (string)$rw['id'],
                    'ecat' => 'referral_payout',
                    'sdom' => 'referral_payout',
                    'title' => 'Referral Cash Payout (' . ($rw['withdrawal_number'] ?? $rw['id']) . ')',
                    'desc' => 'Bank payout to ' . ($rw['account_name'] ?? '') . ' - ' . ($rw['bank_name'] ?? ''),
                    'ref' => (string)($rw['payment_reference'] ?: $rw['withdrawal_number'] ?: $rw['id']),
                    'gross' => number_format((float)($rw['gross_amount'] ?? $netAmt), 2, '.', ''),
                    'rev' => '0.00',
                    'cost' => '0.00',
                    'fee' => number_format($feeAmt, 2, '.', ''),
                    'exp' => number_format($netAmt, 2, '.', ''),
                    'profit' => number_format($profitImpact, 2, '.', ''),
                    'liab' => '0.00',
                    'pchan' => 'bank_transfer',
                    'acode' => 'BANK_MAIN',
                    'rstat' => 'unreconciled',
                    'cid' => (string)($rw['user_id'] ?? ''),
                    'cname' => (string)($rw['user_name'] ?? $rw['user_email'] ?? 'Partner'),
                    'meta' => json_encode(['withdrawal_number' => $rw['withdrawal_number'] ?? null]),
                ]);
                if ($exists) {
                    $updated++;
                } else {
                    $inserted++;
                }
            }
        } catch (Throwable) {
        }

        return [
            'synced_at_lagos' => $this->lagosNow()->format('Y-m-d H:i:s'),
            'inserted' => $inserted,
            'updated' => $updated,
            'skipped' => $skipped,
            'total_source_transactions' => count($txRows),
        ];
    }

    // =========================================================================
    // 3. CORE FINANCIAL SUMMARY ENGINE (WAT / AFRICA/LAGOS)
    // =========================================================================

    public function computePeriodSummary(string $startUtc, string $endUtc, ?string $dateFrom = null, ?string $dateTo = null): array
    {
        $row = $this->db->fetchOne(
            'SELECT
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category IN ("website_service_sale", "customer_refund") THEN revenue_amount ELSE 0 END), 0) AS website_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "website_service_sale" THEN gross_amount ELSE 0 END), 0) AS website_gross_sales,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "customer_refund" THEN gross_amount ELSE 0 END), 0) AS website_refunds,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND source_origin = "physical" THEN revenue_amount ELSE 0 END), 0) AS physical_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND source_origin = "income" THEN revenue_amount ELSE 0 END), 0) AS other_income,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "website_service_sale" THEN cost_amount ELSE 0 END), 0) AS provider_costs,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND source_origin IN ("physical", "inventory") THEN cost_amount ELSE 0 END), 0) AS direct_inventory_cogs,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN fee_amount ELSE 0 END), 0) AS gateway_pos_fees,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND (source_origin = "expense" OR entry_category = "referral_payout") THEN expense_amount ELSE 0 END), 0) AS operating_expenses,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category IN ("wallet_funding", "referral_wallet_credit", "wallet_credit_adjustment") THEN gross_amount ELSE 0 END), 0) AS wallet_funding_inflow,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "wallet_funding" AND wallet_liability_delta > 0 THEN gross_amount ELSE 0 END), 0) AS customer_wallet_deposits,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN wallet_liability_delta ELSE 0 END), 0) AS net_wallet_liability_delta,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "website_service_sale" AND JSON_EXTRACT(metadata, "$.cost_verified") = false THEN revenue_amount ELSE 0 END), 0) AS unverified_cost_revenue,
                COUNT(CASE WHEN is_reversed = 0 AND entry_category = "website_service_sale" AND JSON_EXTRACT(metadata, "$.cost_verified") = false THEN 1 END) AS unverified_cost_count,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN net_profit_impact ELSE 0 END), 0) AS net_profit,
                COUNT(CASE WHEN is_reversed = 0 THEN 1 END) AS active_entries_count,
                COUNT(CASE WHEN is_reversed = 0 AND entry_category = "website_service_sale" THEN 1 END) AS website_sales_count,
                COUNT(CASE WHEN is_reversed = 0 AND entry_category = "customer_refund" THEN 1 END) AS refunds_count,
                COUNT(CASE WHEN is_reversed = 0 AND source_origin = "physical" AND revenue_amount > 0 THEN 1 END) AS physical_sales_count
             FROM accounting_entries
             WHERE occurred_at >= :s1 AND occurred_at <= :e1',
            ['s1' => $startUtc, 'e1' => $endUtc]
        ) ?: [];

        $websiteRev = round((float)($row['website_revenue'] ?? 0), 2);
        $physicalRev = round((float)($row['physical_revenue'] ?? 0), 2);
        $otherIncome = round((float)($row['other_income'] ?? 0), 2);
        $totalBusinessRevenue = round($websiteRev + $physicalRev + $otherIncome, 2);

        $providerCosts = round((float)($row['provider_costs'] ?? 0), 2);
        $directCogs = round((float)($row['direct_inventory_cogs'] ?? 0), 2);
        $fees = round((float)($row['gateway_pos_fees'] ?? 0), 2);
        $opExpenses = round((float)($row['operating_expenses'] ?? 0), 2);
        $unverifiedCostRevenue = round((float)($row['unverified_cost_revenue'] ?? 0), 2);
        $unverifiedCostCount = (int)($row['unverified_cost_count'] ?? 0);
        $totalCostsAndExpenses = round($providerCosts + $directCogs + $fees + $opExpenses, 2);
        // Never report unverified profit for transactions lacking reliable provider cost records
        $netProfit = round($totalBusinessRevenue - $unverifiedCostRevenue - $totalCostsAndExpenses, 2);
        $grossMargin = round($totalBusinessRevenue - $unverifiedCostRevenue - $providerCosts - $directCogs, 2);
        $verifiedRevenue = max(0.0, round($totalBusinessRevenue - $unverifiedCostRevenue, 2));
        $profitMarginPct = $verifiedRevenue > 0 ? round(($netProfit / $verifiedRevenue) * 100, 2) : 0.0;

        // Channel breakdown (Physical + Website Funding Inflows)
        $channelRows = $this->db->fetchAll(
            'SELECT
                payment_channel,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND (revenue_amount > 0 OR entry_category IN ("wallet_funding", "other_business_income")) THEN gross_amount ELSE 0 END), 0) AS inflow_total,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND (expense_amount > 0 OR entry_category IN ("operating_expense", "inventory_purchase", "referral_payout")) THEN (expense_amount + CASE WHEN entry_category = "inventory_purchase" THEN gross_amount ELSE 0 END) ELSE 0 END), 0) AS outflow_total,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN fee_amount ELSE 0 END), 0) AS fees_total
             FROM accounting_entries
             WHERE occurred_at >= :s1 AND occurred_at <= :e1
             GROUP BY payment_channel',
            ['s1' => $startUtc, 'e1' => $endUtc]
        );

        $channels = [];
        foreach ($channelRows as $cr) {
            $ch = (string)$cr['payment_channel'];
            $channels[$ch] = [
                'inflow' => round((float)$cr['inflow_total'], 2),
                'outflow' => round((float)$cr['outflow_total'], 2),
                'fees' => round((float)$cr['fees_total'], 2),
            ];
        }

        // Physical cash / POS / bank breakdown from physical sales directly
        $physPayment = $this->db->fetchOne(
            'SELECT
                COALESCE(SUM(CASE WHEN status = "completed" THEN cash_amount ELSE 0 END), 0) AS cash_sales,
                COALESCE(SUM(CASE WHEN status = "completed" THEN pos_amount ELSE 0 END), 0) AS pos_sales,
                COALESCE(SUM(CASE WHEN status = "completed" THEN transfer_amount ELSE 0 END), 0) AS transfer_sales,
                COALESCE(SUM(CASE WHEN status = "completed" THEN pos_fee ELSE 0 END), 0) AS pos_fees
             FROM accounting_physical_sales
             WHERE occurred_at >= :s1 AND occurred_at <= :e1',
            ['s1' => $startUtc, 'e1' => $endUtc]
        ) ?: [];

        // Website service breakdown by domain
        $domainRows = $this->db->fetchAll(
            'SELECT
                service_domain,
                COUNT(CASE WHEN entry_category = "website_service_sale" AND is_reversed = 0 THEN 1 END) AS tx_count,
                COUNT(CASE WHEN entry_category = "customer_refund" AND is_reversed = 0 THEN 1 END) AS refund_count,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "website_service_sale" THEN gross_amount ELSE 0 END), 0) AS gross_sales,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "customer_refund" THEN gross_amount ELSE 0 END), 0) AS refunds,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category IN ("website_service_sale", "customer_refund") THEN revenue_amount ELSE 0 END), 0) AS net_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "website_service_sale" THEN cost_amount ELSE 0 END), 0) AS provider_cost,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category IN ("website_service_sale", "customer_refund") THEN net_profit_impact ELSE 0 END), 0) AS net_profit
             FROM accounting_entries
             WHERE occurred_at >= :s1 AND occurred_at <= :e1
               AND entry_category IN ("website_service_sale", "customer_refund")
             GROUP BY service_domain
             ORDER BY net_revenue DESC',
            ['s1' => $startUtc, 'e1' => $endUtc]
        );

        return [
            'period' => [
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'start_utc' => $startUtc,
                'end_utc' => $endUtc,
            ],
            'website_gross_sales' => round((float)($row['website_gross_sales'] ?? 0), 2),
            'website_refunds' => round((float)($row['website_refunds'] ?? 0), 2),
            'website_revenue' => $websiteRev,
            'physical_revenue' => $physicalRev,
            'other_income' => $otherIncome,
            'total_business_revenue' => $totalBusinessRevenue,
            'provider_costs' => $providerCosts,
            'direct_inventory_cogs' => $directCogs,
            'gateway_pos_fees' => $fees,
            'operating_expenses' => $opExpenses,
            'total_costs_and_expenses' => $totalCostsAndExpenses,
            'unverified_cost_count' => $unverifiedCostCount,
            'unverified_cost_revenue' => $unverifiedCostRevenue,
            'gross_margin' => $grossMargin,
            'net_profit' => $netProfit,
            'profit_margin_percent' => $profitMarginPct,
            'wallet_funding_inflow' => round((float)($row['wallet_funding_inflow'] ?? 0), 2),
            'customer_wallet_deposits' => round((float)($row['customer_wallet_deposits'] ?? 0), 2),
            'net_wallet_liability_delta' => round((float)($row['net_wallet_liability_delta'] ?? 0), 2),
            'counts' => [
                'active_entries' => (int)($row['active_entries_count'] ?? 0),
                'website_sales' => (int)($row['website_sales_count'] ?? 0),
                'refunds' => (int)($row['refunds_count'] ?? 0),
                'physical_sales' => (int)($row['physical_sales_count'] ?? 0),
            ],
            'physical_payment_split' => [
                'cash' => round((float)($physPayment['cash_sales'] ?? 0), 2),
                'pos' => round((float)($physPayment['pos_sales'] ?? 0), 2),
                'transfer' => round((float)($physPayment['transfer_sales'] ?? 0), 2),
                'pos_fees' => round((float)($physPayment['pos_fees'] ?? 0), 2),
            ],
            'channels' => $channels,
            'website_domains' => array_map(static fn(array $d) => [
                'service_domain' => (string)$d['service_domain'],
                'tx_count' => (int)$d['tx_count'],
                'refund_count' => (int)$d['refund_count'],
                'gross_sales' => round((float)$d['gross_sales'], 2),
                'refunds' => round((float)$d['refunds'], 2),
                'net_revenue' => round((float)$d['net_revenue'], 2),
                'provider_cost' => round((float)$d['provider_cost'], 2),
                'net_profit' => round((float)$d['net_profit'], 2),
            ], $domainRows),
        ];
    }

    // =========================================================================
    // 4. MODULE 1: FINANCIAL OVERVIEW DASHBOARD
    // =========================================================================

    public function getOverview(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $cfg = $this->getConfig();
        $syncResult = !empty($cfg['auto_sync_on_dashboard_load']) ? $this->syncWebsiteTransactions(false) : null;

        $todayLagos = $this->lagosNow()->format('Y-m-d');
        $selectedFrom = ($dateFrom && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) ? $dateFrom : $this->lagosNow()->modify('-29 days')->format('Y-m-d');
        $selectedTo = ($dateTo && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) ? $dateTo : $todayLagos;

        $selectedWin = $this->resolveLagosDateWindow($selectedFrom, $selectedTo);
        $todayWin = $this->resolveLagosDateWindow($todayLagos, $todayLagos);
        $yesterdayDate = $this->lagosNow()->modify('-1 day')->format('Y-m-d');
        $yesterdayWin = $this->resolveLagosDateWindow($yesterdayDate, $yesterdayDate);
        $monthWin = $this->resolveLagosDateWindow($this->lagosNow()->format('Y-m-01'), $todayLagos);

        $periodSummary = $this->computePeriodSummary($selectedWin['start_utc'], $selectedWin['end_utc'], $selectedWin['date_from'], $selectedWin['date_to']);
        $todaySummary = $this->computePeriodSummary($todayWin['start_utc'], $todayWin['end_utc'], $todayLagos, $todayLagos);
        $yesterdaySummary = $this->computePeriodSummary($yesterdayWin['start_utc'], $yesterdayWin['end_utc'], $yesterdayDate, $yesterdayDate);
        $monthSummary = $this->computePeriodSummary($monthWin['start_utc'], $monthWin['end_utc'], $monthWin['date_from'], $monthWin['date_to']);

        $walletLiabilities = $this->getWalletLiabilitySummary();
        $channelBalances = $this->getChannelBalances();
        $lowStockItems = $this->getLowStockItems();

        // Daily trend series for selected range (up to 60 days)
        $trend = $this->db->fetchAll(
            'SELECT
                entry_date,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category IN ("website_service_sale", "customer_refund") THEN revenue_amount ELSE 0 END), 0) AS website_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND source_origin = "physical" THEN revenue_amount ELSE 0 END), 0) AS physical_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND source_origin = "income" THEN revenue_amount ELSE 0 END), 0) AS other_income,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN cost_amount ELSE 0 END), 0) AS cogs,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN (fee_amount + expense_amount) ELSE 0 END), 0) AS expenses_fees,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN net_profit_impact ELSE 0 END), 0) AS net_profit,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "wallet_funding" THEN gross_amount ELSE 0 END), 0) AS wallet_funding
             FROM accounting_entries
             WHERE occurred_at >= :s1 AND occurred_at <= :e1
             GROUP BY entry_date
             ORDER BY entry_date ASC',
            ['s1' => $selectedWin['start_utc'], 'e1' => $selectedWin['end_utc']]
        );

        $recentEntries = $this->db->fetchAll(
            'SELECT * FROM accounting_entries ORDER BY occurred_at DESC, created_at DESC LIMIT 12'
        );

        return [
            'lagos_now' => $this->lagosNow()->format('Y-m-d H:i:s'),
            'sync_result' => $syncResult,
            'period_summary' => $periodSummary,
            'today_summary' => $todaySummary,
            'yesterday_summary' => $yesterdaySummary,
            'month_summary' => $monthSummary,
            'wallet_liabilities' => $walletLiabilities['summary'],
            'channel_balances' => $channelBalances,
            'low_stock_count' => count($lowStockItems),
            'low_stock_items' => $lowStockItems,
            'daily_trend' => $trend,
            'recent_entries' => $recentEntries,
        ];
    }

    // =========================================================================
    // 5. MODULE 2: AUTOMATIC WEBSITE TRANSACTION ACCOUNTING
    // =========================================================================

    public function getWebsiteTransactionsReport(array $filters = []): array
    {
        $this->syncWebsiteTransactions(false);

        $win = $this->resolveLagosDateWindow($filters['date_from'] ?? $this->lagosNow()->modify('-29 days')->format('Y-m-d'), $filters['date_to'] ?? $this->lagosNow()->format('Y-m-d'));
        $where = ['occurred_at >= :s1', 'occurred_at <= :e1', 'source_origin = "website"'];
        $params = ['s1' => $win['start_utc'], 'e1' => $win['end_utc']];

        if (!empty($filters['entry_category']) && $filters['entry_category'] !== 'all') {
            $where[] = 'entry_category = :ecat';
            $params['ecat'] = (string)$filters['entry_category'];
        }
        if (!empty($filters['service_domain']) && $filters['service_domain'] !== 'all') {
            $where[] = 'service_domain = :sdom';
            $params['sdom'] = (string)$filters['service_domain'];
        }
        if (!empty($filters['search'])) {
            $q = '%' . trim((string)$filters['search']) . '%';
            $where[] = '(title LIKE :q1 OR reference LIKE :q2 OR customer_name LIKE :q3 OR entry_number LIKE :q4)';
            $params['q1'] = $q;
            $params['q2'] = $q;
            $params['q3'] = $q;
            $params['q4'] = $q;
        }

        $whereSql = implode(' AND ', $where);
        $limit = max(10, min(500, (int)($filters['limit'] ?? 150)));
        $entries = $this->db->fetchAll(
            "SELECT * FROM accounting_entries WHERE {$whereSql} ORDER BY occurred_at DESC LIMIT {$limit}",
            $params
        );

        $summary = $this->computePeriodSummary($win['start_utc'], $win['end_utc'], $win['date_from'], $win['date_to']);

        // Manual funding queue discontinued; keep zeroed field for response shape compatibility
        $pendingGateway = $this->db->fetchOne(
            'SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total_amt FROM payment_records WHERE status = "pending"'
        ) ?: ['cnt' => 0, 'total_amt' => 0];

        return [
            'period' => $win,
            'summary' => $summary,
            'entries' => $entries,
            'pending_manual_funding' => [
                'count' => 0,
                'amount' => 0.0,
            ],
            'pending_gateway_payments' => [
                'count' => (int)($pendingGateway['cnt'] ?? 0),
                'amount' => round((float)($pendingGateway['total_amt'] ?? 0), 2),
            ],
        ];
    }

    // =========================================================================
    // 6. MODULE 3: CUSTOMER WALLET & LIABILITY MONITORING
    // =========================================================================

    public function getWalletLiabilitySummary(): array
    {
        $customerRow = $this->db->fetchOne(
            'SELECT
                COUNT(u.id) AS total_customers,
                COUNT(CASE WHEN COALESCE(w.balance, u.wallet_balance, 0) > 0 THEN 1 END) AS funded_wallets_count,
                COALESCE(SUM(COALESCE(w.balance, u.wallet_balance, 0)), 0) AS total_customer_liability,
                COALESCE(SUM(CASE WHEN COALESCE(w.balance, u.wallet_balance, 0) < 0 THEN COALESCE(w.balance, u.wallet_balance, 0) ELSE 0 END), 0) AS negative_exposure,
                COUNT(CASE WHEN COALESCE(w.balance, u.wallet_balance, 0) < 0 THEN 1 END) AS negative_wallets_count
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             WHERE u.role = "customer"'
        ) ?: [];

        $internalRow = $this->db->fetchOne(
            'SELECT
                COUNT(u.id) AS internal_count,
                COALESCE(SUM(COALESCE(w.balance, u.wallet_balance, 0)), 0) AS internal_balance_total
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             WHERE u.role IN ("admin", "superadmin")'
        ) ?: [];

        // Wallet ledger consistency check (users.wallet_balance vs wallets.balance)
        $mismatches = $this->db->fetchAll(
            'SELECT u.id, u.full_name, u.email, u.role, u.wallet_balance AS user_table_balance, COALESCE(w.balance, 0) AS wallet_table_balance,
                    (COALESCE(w.balance, 0) - u.wallet_balance) AS drift
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             WHERE ABS(COALESCE(w.balance, 0) - u.wallet_balance) > 0.01'
        );

        // Referral cash liability (pending + available + reserved)
        $refLiability = $this->db->fetchOne(
            'SELECT
                COALESCE(SUM(pending_balance), 0) AS pending_rewards,
                COALESCE(SUM(available_balance), 0) AS available_rewards,
                COALESCE(SUM(reserved_for_withdrawal), 0) AS reserved_withdrawals
             FROM referral_balances'
        ) ?: ['pending_rewards' => 0, 'available_rewards' => 0, 'reserved_withdrawals' => 0];

        $holders = $this->db->fetchAll(
            'SELECT u.id, u.full_name, u.email, u.phone_number, u.role, u.status,
                    COALESCE(w.balance, u.wallet_balance, 0) AS balance,
                    w.status AS wallet_status,
                    COALESCE(dep.total_funded, 0) AS lifetime_funded,
                    COALESCE(sp.total_spent, 0) AS lifetime_spent,
                    COALESCE(rf.total_refunded, 0) AS lifetime_refunded
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             LEFT JOIN (
                 SELECT user_id, SUM(amount) AS total_funded
                 FROM transactions
                 WHERE type = "credit" AND status = "successful" AND reference NOT LIKE "REFUND_%" AND reference NOT LIKE "REV_%" AND category != "reversal"
                 GROUP BY user_id
             ) dep ON dep.user_id = u.id
             LEFT JOIN (
                 SELECT user_id, SUM(amount) AS total_spent
                 FROM transactions
                 WHERE type = "debit" AND status = "successful"
                 GROUP BY user_id
             ) sp ON sp.user_id = u.id
             LEFT JOIN (
                 SELECT user_id, SUM(amount) AS total_refunded
                 FROM transactions
                 WHERE type = "credit" AND status = "successful" AND (reference LIKE "REFUND_%" OR reference LIKE "REV_%" OR category = "reversal")
                 GROUP BY user_id
             ) rf ON rf.user_id = u.id
             WHERE u.role = "customer"
             ORDER BY COALESCE(w.balance, u.wallet_balance, 0) DESC
             LIMIT 100'
        );

        $recentMovements = $this->db->fetchAll(
            'SELECT wl.id, wl.user_id, wl.entry_type, wl.amount, wl.balance_before, wl.balance_after, wl.reference, wl.category, wl.description, wl.created_at,
                    u.full_name, u.email, u.role
             FROM wallet_ledger wl
             LEFT JOIN users u ON u.id = wl.user_id
             ORDER BY wl.created_at DESC
             LIMIT 80'
        );

        return [
            'summary' => [
                'total_customer_liability' => round((float)($customerRow['total_customer_liability'] ?? 0), 2),
                'total_customers' => (int)($customerRow['total_customers'] ?? 0),
                'funded_wallets_count' => (int)($customerRow['funded_wallets_count'] ?? 0),
                'negative_wallets_count' => (int)($customerRow['negative_wallets_count'] ?? 0),
                'negative_exposure' => round((float)($customerRow['negative_exposure'] ?? 0), 2),
                'internal_admin_wallets_total' => round((float)($internalRow['internal_balance_total'] ?? 0), 2),
                'internal_admin_wallets_count' => (int)($internalRow['internal_count'] ?? 0),
                'balance_mismatch_count' => count($mismatches),
                'referral_liability_total' => round(
                    (float)($refLiability['pending_rewards'] ?? 0) +
                    (float)($refLiability['available_rewards'] ?? 0) +
                    (float)($refLiability['reserved_withdrawals'] ?? 0),
                    2
                ),
                'referral_available_liability' => round((float)($refLiability['available_rewards'] ?? 0), 2),
                'referral_reserved_withdrawal' => round((float)($refLiability['reserved_withdrawals'] ?? 0), 2),
            ],
            'mismatches' => $mismatches,
            'holders' => $holders,
            'recent_movements' => $recentMovements,
        ];
    }

    // =========================================================================
    // 7. MODULE 4: INCOME & EXPENSE MANAGEMENT
    // =========================================================================

    public function listExpensesIncome(array $filters = []): array
    {
        $win = $this->resolveLagosDateWindow($filters['date_from'] ?? $this->lagosNow()->modify('-29 days')->format('Y-m-d'), $filters['date_to'] ?? $this->lagosNow()->format('Y-m-d'));
        $where = ['occurred_at >= :s1', 'occurred_at <= :e1'];
        $params = ['s1' => $win['start_utc'], 'e1' => $win['end_utc']];

        if (!empty($filters['record_type']) && in_array($filters['record_type'], ['expense', 'other_income'], true)) {
            $where[] = 'record_type = :rtype';
            $params['rtype'] = $filters['record_type'];
        }
        if (!empty($filters['category']) && $filters['category'] !== 'all') {
            $where[] = 'category = :cat';
            $params['cat'] = (string)$filters['category'];
        }
        if (!empty($filters['status']) && $filters['status'] !== 'all') {
            $where[] = 'status = :st';
            $params['st'] = (string)$filters['status'];
        }

        $whereSql = implode(' AND ', $where);
        $records = $this->db->fetchAll(
            "SELECT * FROM accounting_expenses_income WHERE {$whereSql} ORDER BY occurred_at DESC, created_at DESC LIMIT 250",
            $params
        );

        $totals = $this->db->fetchOne(
            "SELECT
                COALESCE(SUM(CASE WHEN record_type = 'expense' AND status = 'active' THEN amount ELSE 0 END), 0) AS total_expenses,
                COALESCE(SUM(CASE WHEN record_type = 'other_income' AND status = 'active' THEN amount ELSE 0 END), 0) AS total_other_income,
                COALESCE(SUM(CASE WHEN status = 'active' THEN fee_amount ELSE 0 END), 0) AS total_fees,
                COUNT(CASE WHEN record_type = 'expense' AND status = 'active' THEN 1 END) AS expense_count,
                COUNT(CASE WHEN record_type = 'other_income' AND status = 'active' THEN 1 END) AS income_count
             FROM accounting_expenses_income
             WHERE {$whereSql}",
            $params
        ) ?: [];

        $byCategory = $this->db->fetchAll(
            "SELECT record_type, category, COUNT(*) AS items_count, COALESCE(SUM(amount), 0) AS total_amount
             FROM accounting_expenses_income
             WHERE {$whereSql} AND status = 'active'
             GROUP BY record_type, category
             ORDER BY total_amount DESC",
            $params
        );

        return [
            'period' => $win,
            'summary' => [
                'total_expenses' => round((float)($totals['total_expenses'] ?? 0), 2),
                'total_other_income' => round((float)($totals['total_other_income'] ?? 0), 2),
                'total_fees' => round((float)($totals['total_fees'] ?? 0), 2),
                'expense_count' => (int)($totals['expense_count'] ?? 0),
                'income_count' => (int)($totals['income_count'] ?? 0),
            ],
            'by_category' => $byCategory,
            'records' => $records,
        ];
    }

    public function createExpenseOrIncome(array $payload, array $actor): array
    {
        $recordType = strtolower(trim((string)($payload['record_type'] ?? 'expense')));
        if (!in_array($recordType, ['expense', 'other_income'], true)) {
            throw new RuntimeException('record_type must be expense or other_income.');
        }

        $title = trim((string)($payload['title'] ?? ''));
        $category = trim((string)($payload['category'] ?? 'general'));
        $amount = round((float)($payload['amount'] ?? 0), 2);
        $fee = max(0.0, round((float)($payload['fee_amount'] ?? 0), 2));
        if ($title === '' || $amount <= 0) {
            throw new RuntimeException('Title and a positive amount are required.');
        }

        $paymentMethod = strtolower(trim((string)($payload['payment_method'] ?? 'cash')));
        if (!in_array($paymentMethod, ['cash', 'pos', 'bank_transfer', 'wallet', 'other'], true)) {
            $paymentMethod = 'cash';
        }
        $accountCode = $this->resolveAccountCodeForPayment($paymentMethod, $payload['account_code'] ?? null);

        $entryDate = !empty($payload['entry_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$payload['entry_date'])
            ? (string)$payload['entry_date']
            : $this->lagosNow()->format('Y-m-d');

        $lagosDt = new DateTimeImmutable($entryDate . ' ' . $this->lagosNow()->format('H:i:s'), $this->lagosTz);
        $occurredUtc = $lagosDt->setTimezone($this->utcTz)->format('Y-m-d H:i:s');
        $occurredLagos = $lagosDt->format('Y-m-d H:i:s');

        $id = Security::generateUuid();
        $voucherNo = ($recordType === 'expense' ? 'EXP-' : 'INC-') . $lagosDt->format('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));

        $this->db->withTransaction(function (Database $db) use (
            $id,
            $voucherNo,
            $recordType,
            $entryDate,
            $occurredUtc,
            $occurredLagos,
            $category,
            $title,
            $payload,
            $amount,
            $fee,
            $paymentMethod,
            $accountCode,
            $actor
        ) {
            $db->execute(
                'INSERT INTO accounting_expenses_income
                 (id, voucher_number, record_type, entry_date, occurred_at, category, title, description, party_name, amount, fee_amount, payment_method, account_code, reference, attachment_note, recorded_by, recorded_by_name, status)
                 VALUES
                 (:id, :vno, :rtype, :edate, :occ, :cat, :title, :desc, :party, :amt, :fee, :pmeth, :acode, :ref, :att, :rby, :rname, "active")',
                [
                    'id' => $id,
                    'vno' => $voucherNo,
                    'rtype' => $recordType,
                    'edate' => $entryDate,
                    'occ' => $occurredUtc,
                    'cat' => substr($category, 0, 64),
                    'title' => substr($title, 0, 191),
                    'desc' => trim((string)($payload['description'] ?? '')),
                    'party' => substr(trim((string)($payload['party_name'] ?? '')), 0, 191),
                    'amt' => number_format($amount, 2, '.', ''),
                    'fee' => number_format($fee, 2, '.', ''),
                    'pmeth' => $paymentMethod,
                    'acode' => $accountCode,
                    'ref' => substr(trim((string)($payload['reference'] ?? $voucherNo)), 0, 120),
                    'att' => substr(trim((string)($payload['attachment_note'] ?? '')), 0, 255),
                    'rby' => $actor['id'],
                    'rname' => $actor['full_name'] ?? $actor['email'],
                ]
            );

            $isExpense = $recordType === 'expense';
            $entryOrigin = $isExpense ? 'expense' : 'income';
            $entryCategory = $isExpense ? 'operating_expense' : 'other_business_income';
            $rev = $isExpense ? 0.0 : $amount;
            $exp = $isExpense ? $amount : 0.0;
            $netProfit = round($rev - $exp - $fee, 2);

            $db->execute(
                'INSERT INTO accounting_entries
                 (id, entry_number, entry_date, occurred_at, occurred_lagos, source_origin, source_table, source_id, entry_category, service_domain, title, description, reference, gross_amount, revenue_amount, cost_amount, fee_amount, expense_amount, net_profit_impact, wallet_liability_delta, payment_channel, account_code, reconciliation_status, customer_name, staff_user_id, staff_name, metadata)
                 VALUES
                 (:id, :eno, :edate, :occ_utc, :occ_lagos, :orig, "accounting_expenses_income", :sid, :ecat, :sdom, :title, :desc, :ref, :gross, :rev, 0.00, :fee, :exp, :profit, 0.00, :pchan, :acode, "unreconciled", :party, :suid, :sname, :meta)',
                [
                    'id' => Security::generateUuid(),
                    'eno' => 'ACC-' . $voucherNo,
                    'edate' => $entryDate,
                    'occ_utc' => $occurredUtc,
                    'occ_lagos' => $occurredLagos,
                    'orig' => $entryOrigin,
                    'sid' => $id,
                    'ecat' => $entryCategory,
                    'sdom' => $category,
                    'title' => substr($title, 0, 191),
                    'desc' => trim((string)($payload['description'] ?? '')),
                    'ref' => $voucherNo,
                    'gross' => number_format($amount, 2, '.', ''),
                    'rev' => number_format($rev, 2, '.', ''),
                    'fee' => number_format($fee, 2, '.', ''),
                    'exp' => number_format($exp, 2, '.', ''),
                    'profit' => number_format($netProfit, 2, '.', ''),
                    'pchan' => $paymentMethod,
                    'acode' => $accountCode,
                    'party' => substr(trim((string)($payload['party_name'] ?? '')), 0, 191),
                    'suid' => $actor['id'],
                    'sname' => $actor['full_name'] ?? $actor['email'],
                    'meta' => json_encode(['voucher_number' => $voucherNo, 'category' => $category]),
                ]
            );
        });

        $this->recordAudit($actor, $recordType === 'expense' ? 'ACCOUNTING_EXPENSE_RECORDED' : 'ACCOUNTING_INCOME_RECORDED', [
            'id' => $id,
            'voucher_number' => $voucherNo,
            'amount' => $amount,
            'category' => $category,
        ]);

        return $this->db->fetchOne('SELECT * FROM accounting_expenses_income WHERE id = :id LIMIT 1', ['id' => $id]) ?? ['id' => $id];
    }

    public function voidExpenseOrIncome(string $id, string $reason, array $actor): array
    {
        $rec = $this->db->fetchOne('SELECT * FROM accounting_expenses_income WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$rec) {
            throw new RuntimeException('Record not found.');
        }
        if ($rec['status'] === 'voided') {
            throw new RuntimeException('Record is already voided.');
        }

        $cleanReason = trim($reason) !== '' ? trim($reason) : 'Voided by administrator';
        $this->db->withTransaction(function (Database $db) use ($id, $cleanReason, $actor) {
            $db->execute(
                'UPDATE accounting_expenses_income SET status = "voided", void_reason = :vr, voided_by = :vb, voided_at = NOW() WHERE id = :id',
                ['vr' => $cleanReason, 'vb' => $actor['id'], 'id' => $id]
            );
            $db->execute(
                'UPDATE accounting_entries SET is_reversed = 1, reversed_by = :rb, reversed_at = NOW() WHERE source_table = "accounting_expenses_income" AND source_id = :sid',
                ['rb' => $actor['id'], 'sid' => $id]
            );
        });

        $this->recordAudit($actor, 'ACCOUNTING_EXPENSE_INCOME_VOIDED', ['id' => $id, 'voucher_number' => $rec['voucher_number'], 'reason' => $cleanReason]);
        return $this->db->fetchOne('SELECT * FROM accounting_expenses_income WHERE id = :id LIMIT 1', ['id' => $id]) ?? $rec;
    }

    // =========================================================================
    // 8. MODULE 5: PHYSICAL BUSINESS SALES & RECEPTIONIST RECORDS
    // =========================================================================

    public function listPhysicalSales(array $filters = []): array
    {
        $win = $this->resolveLagosDateWindow($filters['date_from'] ?? $this->lagosNow()->modify('-29 days')->format('Y-m-d'), $filters['date_to'] ?? $this->lagosNow()->format('Y-m-d'));
        $where = ['occurred_at >= :s1', 'occurred_at <= :e1'];
        $params = ['s1' => $win['start_utc'], 'e1' => $win['end_utc']];

        if (!empty($filters['service_category']) && $filters['service_category'] !== 'all') {
            $where[] = 'service_category = :scat';
            $params['scat'] = (string)$filters['service_category'];
        }
        if (!empty($filters['payment_mode']) && $filters['payment_mode'] !== 'all') {
            $where[] = 'payment_mode = :pmode';
            $params['pmode'] = (string)$filters['payment_mode'];
        }
        if (!empty($filters['status']) && $filters['status'] !== 'all') {
            $where[] = 'status = :st';
            $params['st'] = (string)$filters['status'];
        }
        if (!empty($filters['search'])) {
            $q = '%' . trim((string)$filters['search']) . '%';
            $where[] = '(receipt_number LIKE :q1 OR service_name LIKE :q2 OR customer_name LIKE :q3 OR attendant_name LIKE :q4)';
            $params['q1'] = $q;
            $params['q2'] = $q;
            $params['q3'] = $q;
            $params['q4'] = $q;
        }

        $whereSql = implode(' AND ', $where);
        $sales = $this->db->fetchAll(
            "SELECT * FROM accounting_physical_sales WHERE {$whereSql} ORDER BY occurred_at DESC, created_at DESC LIMIT 300",
            $params
        );

        $summary = $this->db->fetchOne(
            "SELECT
                COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count,
                COUNT(CASE WHEN status != 'completed' THEN 1 END) AS voided_count,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN gross_amount ELSE 0 END), 0) AS gross_sales,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN discount_amount ELSE 0 END), 0) AS discounts,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN net_amount ELSE 0 END), 0) AS net_revenue,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN direct_cost ELSE 0 END), 0) AS direct_cost,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN pos_fee ELSE 0 END), 0) AS pos_fees,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN (net_amount - direct_cost - pos_fee) ELSE 0 END), 0) AS net_profit,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN cash_amount ELSE 0 END), 0) AS cash_total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN pos_amount ELSE 0 END), 0) AS pos_total,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN transfer_amount ELSE 0 END), 0) AS transfer_total
             FROM accounting_physical_sales WHERE {$whereSql}",
            $params
        ) ?: [];

        $byService = $this->db->fetchAll(
            "SELECT service_category, COUNT(*) AS sales_count, COALESCE(SUM(net_amount), 0) AS net_revenue, COALESCE(SUM(direct_cost), 0) AS direct_cost
             FROM accounting_physical_sales
             WHERE {$whereSql} AND status = 'completed'
             GROUP BY service_category
             ORDER BY net_revenue DESC",
            $params
        );

        $byStaff = $this->db->fetchAll(
            "SELECT COALESCE(attendant_name, 'Staff') AS attendant_name, COUNT(*) AS sales_count, COALESCE(SUM(net_amount), 0) AS net_revenue
             FROM accounting_physical_sales
             WHERE {$whereSql} AND status = 'completed'
             GROUP BY attendant_user_id, attendant_name
             ORDER BY net_revenue DESC",
            $params
        );

        return [
            'period' => $win,
            'summary' => [
                'completed_count' => (int)($summary['completed_count'] ?? 0),
                'voided_count' => (int)($summary['voided_count'] ?? 0),
                'gross_sales' => round((float)($summary['gross_sales'] ?? 0), 2),
                'discounts' => round((float)($summary['discounts'] ?? 0), 2),
                'net_revenue' => round((float)($summary['net_revenue'] ?? 0), 2),
                'direct_cost' => round((float)($summary['direct_cost'] ?? 0), 2),
                'pos_fees' => round((float)($summary['pos_fees'] ?? 0), 2),
                'net_profit' => round((float)($summary['net_profit'] ?? 0), 2),
                'cash_total' => round((float)($summary['cash_total'] ?? 0), 2),
                'pos_total' => round((float)($summary['pos_total'] ?? 0), 2),
                'transfer_total' => round((float)($summary['transfer_total'] ?? 0), 2),
            ],
            'by_service' => $byService,
            'by_staff' => $byStaff,
            'sales' => $sales,
        ];
    }

    public function createPhysicalSale(array $payload, array $actor): array
    {
        $serviceCategory = trim((string)($payload['service_category'] ?? 'printing'));
        $serviceName = trim((string)($payload['service_name'] ?? ''));
        if ($serviceName === '') {
            throw new RuntimeException('Service or item name is required.');
        }

        $quantity = max(0.01, round((float)($payload['quantity'] ?? 1), 2));
        $unitPrice = max(0.0, round((float)($payload['unit_price'] ?? 0), 2));
        $grossAmount = round($quantity * $unitPrice, 2);
        if (isset($payload['net_amount']) && (float)$payload['net_amount'] > 0 && $unitPrice <= 0) {
            $grossAmount = round((float)$payload['net_amount'], 2);
            $unitPrice = round($grossAmount / $quantity, 2);
        }

        $discount = max(0.0, min($grossAmount, round((float)($payload['discount_amount'] ?? 0), 2)));
        $netAmount = round($grossAmount - $discount, 2);
        if ($netAmount <= 0) {
            throw new RuntimeException('Net sale amount must be greater than zero.');
        }

        $paymentMode = strtolower(trim((string)($payload['payment_mode'] ?? 'cash')));
        if (!in_array($paymentMode, ['cash', 'pos', 'transfer', 'split'], true)) {
            $paymentMode = 'cash';
        }

        $cashAmt = 0.0;
        $posAmt = 0.0;
        $transferAmt = 0.0;
        if ($paymentMode === 'cash') {
            $cashAmt = $netAmount;
        } elseif ($paymentMode === 'pos') {
            $posAmt = $netAmount;
        } elseif ($paymentMode === 'transfer') {
            $transferAmt = $netAmount;
        } else {
            $cashAmt = max(0.0, round((float)($payload['cash_amount'] ?? 0), 2));
            $posAmt = max(0.0, round((float)($payload['pos_amount'] ?? 0), 2));
            $transferAmt = max(0.0, round((float)($payload['transfer_amount'] ?? 0), 2));
            $splitSum = round($cashAmt + $posAmt + $transferAmt, 2);
            if (abs($splitSum - $netAmount) > 0.5) {
                throw new RuntimeException("Split payment amounts (₦{$splitSum}) must equal net sale total (₦{$netAmount}).");
            }
        }

        $cfg = $this->getConfig();
        $posFee = isset($payload['pos_fee'])
            ? max(0.0, round((float)$payload['pos_fee'], 2))
            : ($posAmt > 0 ? round(min((float)($cfg['pos_fee_cap'] ?? 100), $posAmt * ((float)($cfg['pos_fee_percent'] ?? 0.5) / 100.0)), 2) : 0.0);

        $directCost = max(0.0, round((float)($payload['direct_cost'] ?? 0), 2));
        $inventoryItemId = !empty($payload['inventory_item_id']) ? trim((string)$payload['inventory_item_id']) : null;
        $inventoryQtyUsed = $inventoryItemId ? max(0.0, round((float)($payload['inventory_qty_used'] ?? $quantity), 2)) : 0.0;

        $saleDate = !empty($payload['sale_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$payload['sale_date'])
            ? (string)$payload['sale_date']
            : $this->lagosNow()->format('Y-m-d');
        $lagosDt = new DateTimeImmutable($saleDate . ' ' . $this->lagosNow()->format('H:i:s'), $this->lagosTz);
        $occurredUtc = $lagosDt->setTimezone($this->utcTz)->format('Y-m-d H:i:s');
        $occurredLagos = $lagosDt->format('Y-m-d H:i:s');

        $id = Security::generateUuid();
        $receiptNumber = 'RCP-' . $lagosDt->format('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));

        $this->db->withTransaction(function (Database $db) use (
            $id,
            $receiptNumber,
            $saleDate,
            $occurredUtc,
            $occurredLagos,
            $payload,
            $serviceCategory,
            $serviceName,
            $quantity,
            $unitPrice,
            $grossAmount,
            $discount,
            $netAmount,
            &$directCost,
            $inventoryItemId,
            $inventoryQtyUsed,
            $paymentMode,
            $cashAmt,
            $posAmt,
            $transferAmt,
            $posFee,
            $actor
        ) {
            // Optional inventory deduction + automatic COGS calculation
            if ($inventoryItemId && $inventoryQtyUsed > 0) {
                $item = $db->fetchOne('SELECT * FROM accounting_inventory_items WHERE id = :id FOR UPDATE', ['id' => $inventoryItemId]);
                if (!$item) {
                    throw new RuntimeException('Selected inventory item was not found.');
                }
                $stockBefore = (float)$item['current_stock'];
                if ($stockBefore < $inventoryQtyUsed) {
                    throw new RuntimeException("Insufficient stock for {$item['name']}. Available: {$stockBefore} {$item['unit_label']}.");
                }
                $stockAfter = round($stockBefore - $inventoryQtyUsed, 2);
                $unitCost = (float)$item['average_unit_cost'];
                $invCogs = round($unitCost * $inventoryQtyUsed, 2);
                if ($directCost <= 0) {
                    $directCost = $invCogs;
                }

                $db->execute('UPDATE accounting_inventory_items SET current_stock = :st, updated_at = NOW() WHERE id = :id', [
                    'st' => number_format($stockAfter, 2, '.', ''),
                    'id' => $inventoryItemId,
                ]);
                $db->execute(
                    'INSERT INTO accounting_inventory_movements
                     (id, item_id, movement_type, quantity_delta, unit_cost, total_cost, selling_total, stock_before, stock_after, payment_method, reference, notes, recorded_by, recorded_by_name, entry_date, occurred_at)
                     VALUES
                     (:id, :iid, "sale_deduction", :qdelta, :uc, :tc, :stotal, :sb, :sa, :pm, :ref, :nt, :rby, :rn, :ed, :occ)',
                    [
                        'id' => Security::generateUuid(),
                        'iid' => $inventoryItemId,
                        'qdelta' => number_format(-$inventoryQtyUsed, 2, '.', ''),
                        'uc' => number_format($unitCost, 2, '.', ''),
                        'tc' => number_format($invCogs, 2, '.', ''),
                        'stotal' => number_format($netAmount, 2, '.', ''),
                        'sb' => number_format($stockBefore, 2, '.', ''),
                        'sa' => number_format($stockAfter, 2, '.', ''),
                        'pm' => $paymentMode,
                        'ref' => $receiptNumber,
                        'nt' => "Auto-deducted for physical sale {$receiptNumber} ({$serviceName})",
                        'rby' => $actor['id'],
                        'rn' => $actor['full_name'] ?? $actor['email'],
                        'ed' => $saleDate,
                        'occ' => $occurredUtc,
                    ]
                );
            }

            $db->execute(
                'INSERT INTO accounting_physical_sales
                 (id, receipt_number, sale_date, occurred_at, customer_name, customer_phone, service_category, service_name, description, quantity, unit_price, gross_amount, discount_amount, net_amount, direct_cost, inventory_item_id, inventory_qty_used, payment_mode, cash_amount, pos_amount, transfer_amount, pos_fee, pos_rrn, bank_reference, attendant_user_id, attendant_name, status)
                 VALUES
                 (:id, :rno, :sdate, :occ, :cname, :cphone, :scat, :sname, :desc, :qty, :uprice, :gross, :disc, :net, :dcost, :iid, :iqty, :pmode, :cash, :pos, :trf, :pfee, :rrn, :bref, :auid, :aname, "completed")',
                [
                    'id' => $id,
                    'rno' => $receiptNumber,
                    'sdate' => $saleDate,
                    'occ' => $occurredUtc,
                    'cname' => substr(trim((string)($payload['customer_name'] ?? 'Walk-in Customer')), 0, 191),
                    'cphone' => substr(trim((string)($payload['customer_phone'] ?? '')), 0, 30),
                    'scat' => substr($serviceCategory, 0, 64),
                    'sname' => substr($serviceName, 0, 191),
                    'desc' => trim((string)($payload['description'] ?? '')),
                    'qty' => number_format($quantity, 2, '.', ''),
                    'uprice' => number_format($unitPrice, 2, '.', ''),
                    'gross' => number_format($grossAmount, 2, '.', ''),
                    'disc' => number_format($discount, 2, '.', ''),
                    'net' => number_format($netAmount, 2, '.', ''),
                    'dcost' => number_format($directCost, 2, '.', ''),
                    'iid' => $inventoryItemId,
                    'iqty' => number_format($inventoryQtyUsed, 2, '.', ''),
                    'pmode' => $paymentMode,
                    'cash' => number_format($cashAmt, 2, '.', ''),
                    'pos' => number_format($posAmt, 2, '.', ''),
                    'trf' => number_format($transferAmt, 2, '.', ''),
                    'pfee' => number_format($posFee, 2, '.', ''),
                    'rrn' => substr(trim((string)($payload['pos_rrn'] ?? '')), 0, 100),
                    'bref' => substr(trim((string)($payload['bank_reference'] ?? '')), 0, 120),
                    'auid' => $actor['id'],
                    'aname' => $actor['full_name'] ?? $actor['email'],
                ]
            );

            // Insert one entry per payment leg (or single entry when unsplit) so Cash, POS & Bank reconciliations stay exact
            $legs = [];
            if ($cashAmt > 0) {
                $legs[] = ['leg' => 'cash', 'amt' => $cashAmt, 'fee' => 0.0, 'acode' => 'CASH_DRAWER'];
            }
            if ($posAmt > 0) {
                $legs[] = ['leg' => 'pos', 'amt' => $posAmt, 'fee' => $posFee, 'acode' => 'POS_TERMINAL'];
            }
            if ($transferAmt > 0) {
                $legs[] = ['leg' => 'bank_transfer', 'amt' => $transferAmt, 'fee' => 0.0, 'acode' => 'BANK_MAIN'];
            }

            $totalLegs = count($legs);
            foreach ($legs as $idx => $leg) {
                $legCost = ($idx === 0) ? $directCost : 0.0;
                $legProfit = round($leg['amt'] - $legCost - $leg['fee'], 2);
                $ecat = $totalLegs > 1 ? ('physical_sale_' . $leg['leg']) : 'physical_sale';
                $eno = 'ACC-' . $receiptNumber . ($totalLegs > 1 ? ('-' . strtoupper(substr($leg['leg'], 0, 3))) : '');

                $db->execute(
                    'INSERT INTO accounting_entries
                     (id, entry_number, entry_date, occurred_at, occurred_lagos, source_origin, source_table, source_id, entry_category, service_domain, title, description, reference, gross_amount, revenue_amount, cost_amount, fee_amount, expense_amount, net_profit_impact, wallet_liability_delta, payment_channel, account_code, reconciliation_status, customer_name, staff_user_id, staff_name, metadata)
                     VALUES
                     (:id, :eno, :edate, :occ_utc, :occ_lagos, "physical", "accounting_physical_sales", :sid, :ecat, :sdom, :title, :desc, :ref, :gross, :rev, :cost, :fee, 0.00, :profit, 0.00, :pchan, :acode, "unreconciled", :cname, :suid, :sname, :meta)',
                    [
                        'id' => Security::generateUuid(),
                        'eno' => $eno,
                        'edate' => $saleDate,
                        'occ_utc' => $occurredUtc,
                        'occ_lagos' => $occurredLagos,
                        'sid' => $id,
                        'ecat' => $ecat,
                        'sdom' => 'physical_' . $serviceCategory,
                        'title' => substr($serviceName, 0, 191),
                        'desc' => trim((string)($payload['description'] ?? "Walk-in {$serviceName} (Qty: {$quantity})")),
                        'ref' => $receiptNumber,
                        'gross' => number_format($leg['amt'], 2, '.', ''),
                        'rev' => number_format($leg['amt'], 2, '.', ''),
                        'cost' => number_format($legCost, 2, '.', ''),
                        'fee' => number_format($leg['fee'], 2, '.', ''),
                        'profit' => number_format($legProfit, 2, '.', ''),
                        'pchan' => $leg['leg'],
                        'acode' => $leg['acode'],
                        'cname' => substr(trim((string)($payload['customer_name'] ?? 'Walk-in Customer')), 0, 191),
                        'suid' => $actor['id'],
                        'sname' => $actor['full_name'] ?? $actor['email'],
                        'meta' => json_encode([
                            'receipt_number' => $receiptNumber,
                            'payment_mode' => $paymentMode,
                            'quantity' => $quantity,
                            'pos_rrn' => $payload['pos_rrn'] ?? null,
                            'bank_reference' => $payload['bank_reference'] ?? null,
                        ]),
                    ]
                );
            }
        });

        $this->recordAudit($actor, 'PHYSICAL_SALE_RECORDED', [
            'id' => $id,
            'receipt_number' => $receiptNumber,
            'service_name' => $serviceName,
            'net_amount' => $netAmount,
            'payment_mode' => $paymentMode,
        ]);

        return $this->db->fetchOne('SELECT * FROM accounting_physical_sales WHERE id = :id LIMIT 1', ['id' => $id]) ?? ['id' => $id];
    }

    public function voidPhysicalSale(string $id, string $reason, array $actor): array
    {
        $sale = $this->db->fetchOne('SELECT * FROM accounting_physical_sales WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$sale) {
            throw new RuntimeException('Physical sale record not found.');
        }
        if ($sale['status'] !== 'completed') {
            throw new RuntimeException('This physical sale is already voided/refunded.');
        }

        $cleanReason = trim($reason) !== '' ? trim($reason) : 'Voided by administrator';
        $this->db->withTransaction(function (Database $db) use ($id, $sale, $cleanReason, $actor) {
            $db->execute(
                'UPDATE accounting_physical_sales SET status = "voided", void_reason = :vr, voided_by = :vb, voided_at = NOW() WHERE id = :id',
                ['vr' => $cleanReason, 'vb' => $actor['id'], 'id' => $id]
            );
            $db->execute(
                'UPDATE accounting_entries SET is_reversed = 1, reversed_by = :rb, reversed_at = NOW() WHERE source_table = "accounting_physical_sales" AND source_id = :sid',
                ['rb' => $actor['id'], 'sid' => $id]
            );

            // Restore inventory stock if stock was deducted on this sale
            if (!empty($sale['inventory_item_id']) && (float)$sale['inventory_qty_used'] > 0) {
                $item = $db->fetchOne('SELECT * FROM accounting_inventory_items WHERE id = :id FOR UPDATE', ['id' => $sale['inventory_item_id']]);
                if ($item) {
                    $qtyBack = (float)$sale['inventory_qty_used'];
                    $sb = (float)$item['current_stock'];
                    $sa = round($sb + $qtyBack, 2);
                    $db->execute('UPDATE accounting_inventory_items SET current_stock = :st WHERE id = :id', [
                        'st' => number_format($sa, 2, '.', ''),
                        'id' => $item['id'],
                    ]);
                    $nowLagos = $this->lagosNow();
                    $db->execute(
                        'INSERT INTO accounting_inventory_movements
                         (id, item_id, movement_type, quantity_delta, unit_cost, total_cost, selling_total, stock_before, stock_after, reference, notes, recorded_by, recorded_by_name, entry_date, occurred_at)
                         VALUES
                         (:id, :iid, "adjustment_in", :qd, :uc, :tc, 0.00, :sb, :sa, :ref, :nt, :rby, :rn, :ed, :occ)',
                        [
                            'id' => Security::generateUuid(),
                            'iid' => $item['id'],
                            'qd' => number_format($qtyBack, 2, '.', ''),
                            'uc' => number_format((float)$item['average_unit_cost'], 2, '.', ''),
                            'tc' => number_format(round($qtyBack * (float)$item['average_unit_cost'], 2), 2, '.', ''),
                            'sb' => number_format($sb, 2, '.', ''),
                            'sa' => number_format($sa, 2, '.', ''),
                            'ref' => $sale['receipt_number'],
                            'nt' => 'Restored stock from voided physical sale: ' . $cleanReason,
                            'rby' => $actor['id'],
                            'rn' => $actor['full_name'] ?? $actor['email'],
                            'ed' => $nowLagos->format('Y-m-d'),
                            'occ' => $nowLagos->setTimezone($this->utcTz)->format('Y-m-d H:i:s'),
                        ]
                    );
                }
            }
        });

        $this->recordAudit($actor, 'PHYSICAL_SALE_VOIDED', ['id' => $id, 'receipt_number' => $sale['receipt_number'], 'reason' => $cleanReason]);
        return $this->db->fetchOne('SELECT * FROM accounting_physical_sales WHERE id = :id LIMIT 1', ['id' => $id]) ?? $sale;
    }

    // =========================================================================
    // 9. MODULE 6: INVENTORY & PURCHASE ACCOUNTING
    // =========================================================================

    public function getLowStockItems(): array
    {
        return $this->db->fetchAll(
            'SELECT * FROM accounting_inventory_items WHERE is_active = 1 AND current_stock <= reorder_level ORDER BY (current_stock - reorder_level) ASC'
        );
    }

    public function getInventoryOverview(): array
    {
        $items = $this->db->fetchAll('SELECT * FROM accounting_inventory_items ORDER BY is_active DESC, name ASC');
        $movements = $this->db->fetchAll(
            'SELECT m.*, i.name AS item_name, i.sku, i.unit_label
             FROM accounting_inventory_movements m
             LEFT JOIN accounting_inventory_items i ON i.id = m.item_id
             ORDER BY m.occurred_at DESC, m.created_at DESC
             LIMIT 120'
        );

        $valuation = 0.0;
        $potentialRetail = 0.0;
        $lowStockCount = 0;
        foreach ($items as $it) {
            $stk = (float)$it['current_stock'];
            $valuation += $stk * (float)$it['average_unit_cost'];
            $potentialRetail += $stk * (float)$it['default_selling_price'];
            if ((int)$it['is_active'] === 1 && $stk <= (float)$it['reorder_level']) {
                $lowStockCount++;
            }
        }

        return [
            'summary' => [
                'total_items' => count($items),
                'low_stock_count' => $lowStockCount,
                'total_stock_valuation' => round($valuation, 2),
                'potential_retail_value' => round($potentialRetail, 2),
            ],
            'items' => $items,
            'movements' => $movements,
        ];
    }

    public function saveInventoryItem(array $payload, array $actor, ?string $id = null): array
    {
        $name = trim((string)($payload['name'] ?? ''));
        if ($name === '') {
            throw new RuntimeException('Inventory item name is required.');
        }

        $sku = strtoupper(trim((string)($payload['sku'] ?? '')));
        if ($sku === '') {
            $sku = 'SKU-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
        }

        if ($id) {
            $existing = $this->db->fetchOne('SELECT * FROM accounting_inventory_items WHERE id = :id LIMIT 1', ['id' => $id]);
            if (!$existing) {
                throw new RuntimeException('Inventory item not found.');
            }
            $this->db->execute(
                'UPDATE accounting_inventory_items
                 SET sku = :sku, name = :nm, category = :cat, unit_label = :ul, reorder_level = :rl, default_selling_price = :sp, supplier_name = :sup, is_active = :ia, notes = :nt, updated_at = NOW()
                 WHERE id = :id',
                [
                    'sku' => $sku,
                    'nm' => substr($name, 0, 191),
                    'cat' => substr(trim((string)($payload['category'] ?? $existing['category'])), 0, 64),
                    'ul' => substr(trim((string)($payload['unit_label'] ?? $existing['unit_label'])), 0, 40),
                    'rl' => number_format(max(0, (float)($payload['reorder_level'] ?? $existing['reorder_level'])), 2, '.', ''),
                    'sp' => number_format(max(0, (float)($payload['default_selling_price'] ?? $existing['default_selling_price'])), 2, '.', ''),
                    'sup' => substr(trim((string)($payload['supplier_name'] ?? $existing['supplier_name'] ?? '')), 0, 191),
                    'ia' => isset($payload['is_active']) ? ((bool)$payload['is_active'] ? 1 : 0) : (int)$existing['is_active'],
                    'nt' => trim((string)($payload['notes'] ?? $existing['notes'] ?? '')),
                    'id' => $id,
                ]
            );
            $this->recordAudit($actor, 'INVENTORY_ITEM_UPDATED', ['id' => $id, 'name' => $name]);
            return $this->db->fetchOne('SELECT * FROM accounting_inventory_items WHERE id = :id LIMIT 1', ['id' => $id]) ?? $existing;
        }

        $newId = Security::generateUuid();
        $openingQty = max(0.0, round((float)($payload['initial_stock'] ?? $payload['current_stock'] ?? 0), 2));
        $unitCost = max(0.0, round((float)($payload['average_unit_cost'] ?? $payload['unit_cost'] ?? 0), 2));
        $sellingPrice = max(0.0, round((float)($payload['default_selling_price'] ?? 0), 2));
        $reorderLevel = max(0.0, round((float)($payload['reorder_level'] ?? 5), 2));

        $this->db->withTransaction(function (Database $db) use ($newId, $sku, $name, $payload, $openingQty, $unitCost, $sellingPrice, $reorderLevel, $actor) {
            $db->execute(
                'INSERT INTO accounting_inventory_items
                 (id, sku, name, category, unit_label, current_stock, reorder_level, average_unit_cost, default_selling_price, supplier_name, is_active, notes)
                 VALUES
                 (:id, :sku, :nm, :cat, :ul, :stk, :rl, :uc, :sp, :sup, 1, :nt)',
                [
                    'id' => $newId,
                    'sku' => substr($sku, 0, 64),
                    'nm' => substr($name, 0, 191),
                    'cat' => substr(trim((string)($payload['category'] ?? 'consumable')), 0, 64),
                    'ul' => substr(trim((string)($payload['unit_label'] ?? 'pcs')), 0, 40),
                    'stk' => number_format($openingQty, 2, '.', ''),
                    'rl' => number_format($reorderLevel, 2, '.', ''),
                    'uc' => number_format($unitCost, 2, '.', ''),
                    'sp' => number_format($sellingPrice, 2, '.', ''),
                    'sup' => substr(trim((string)($payload['supplier_name'] ?? '')), 0, 191),
                    'nt' => trim((string)($payload['notes'] ?? '')),
                ]
            );

            if ($openingQty > 0) {
                $nowLagos = $this->lagosNow();
                $db->execute(
                    'INSERT INTO accounting_inventory_movements
                     (id, item_id, movement_type, quantity_delta, unit_cost, total_cost, selling_total, stock_before, stock_after, payment_method, supplier_name, reference, notes, recorded_by, recorded_by_name, entry_date, occurred_at)
                     VALUES
                     (:id, :iid, "adjustment_in", :qd, :uc, :tc, 0.00, 0.00, :sa, "opening", :sup, :ref, "Opening stock balance", :rb, :rn, :ed, :occ)',
                    [
                        'id' => Security::generateUuid(),
                        'iid' => $newId,
                        'qd' => number_format($openingQty, 2, '.', ''),
                        'uc' => number_format($unitCost, 2, '.', ''),
                        'tc' => number_format(round($openingQty * $unitCost, 2), 2, '.', ''),
                        'sa' => number_format($openingQty, 2, '.', ''),
                        'sup' => substr(trim((string)($payload['supplier_name'] ?? '')), 0, 191),
                        'ref' => $sku,
                        'rb' => $actor['id'],
                        'rn' => $actor['full_name'] ?? $actor['email'],
                        'ed' => $nowLagos->format('Y-m-d'),
                        'occ' => $nowLagos->setTimezone($this->utcTz)->format('Y-m-d H:i:s'),
                    ]
                );
            }
        });

        $this->recordAudit($actor, 'INVENTORY_ITEM_CREATED', ['id' => $newId, 'sku' => $sku, 'name' => $name]);
        return $this->db->fetchOne('SELECT * FROM accounting_inventory_items WHERE id = :id LIMIT 1', ['id' => $newId]) ?? ['id' => $newId];
    }

    public function recordInventoryPurchaseOrUsage(array $payload, array $actor): array
    {
        $itemId = trim((string)($payload['item_id'] ?? ''));
        $movementType = strtolower(trim((string)($payload['movement_type'] ?? 'purchase')));
        $quantity = round((float)($payload['quantity'] ?? 0), 2);

        if ($itemId === '' || $quantity <= 0) {
            throw new RuntimeException('Valid inventory item and positive quantity are required.');
        }
        if (!in_array($movementType, ['purchase', 'usage', 'wastage', 'adjustment_in', 'adjustment_out'], true)) {
            throw new RuntimeException('Unsupported inventory movement type.');
        }

        $entryDate = !empty($payload['entry_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$payload['entry_date'])
            ? (string)$payload['entry_date']
            : $this->lagosNow()->format('Y-m-d');
        $lagosDt = new DateTimeImmutable($entryDate . ' ' . $this->lagosNow()->format('H:i:s'), $this->lagosTz);
        $occurredUtc = $lagosDt->setTimezone($this->utcTz)->format('Y-m-d H:i:s');
        $occurredLagos = $lagosDt->format('Y-m-d H:i:s');

        $paymentMethod = strtolower(trim((string)($payload['payment_method'] ?? 'cash')));
        $accountCode = $this->resolveAccountCodeForPayment($paymentMethod, $payload['account_code'] ?? null);
        $recordAsExpense = isset($payload['record_as_expense']) ? (bool)$payload['record_as_expense'] : ($movementType === 'purchase');

        $movementId = Security::generateUuid();
        $ref = trim((string)($payload['reference'] ?? '')) ?: ('INV-' . $lagosDt->format('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6)));

        $this->db->withTransaction(function (Database $db) use (
            $itemId,
            $movementId,
            $movementType,
            $quantity,
            $payload,
            $entryDate,
            $occurredUtc,
            $occurredLagos,
            $paymentMethod,
            $accountCode,
            $recordAsExpense,
            $ref,
            $actor
        ) {
            $item = $db->fetchOne('SELECT * FROM accounting_inventory_items WHERE id = :id FOR UPDATE', ['id' => $itemId]);
            if (!$item) {
                throw new RuntimeException('Inventory item not found.');
            }

            $stockBefore = (float)$item['current_stock'];
            $curAvgCost = (float)$item['average_unit_cost'];
            $isInflow = in_array($movementType, ['purchase', 'adjustment_in'], true);

            if (!$isInflow && $stockBefore < $quantity) {
                throw new RuntimeException("Insufficient stock for {$item['name']}. Current stock: {$stockBefore} {$item['unit_label']}.");
            }

            $stockAfter = $isInflow ? round($stockBefore + $quantity, 2) : round($stockBefore - $quantity, 2);
            $unitCost = isset($payload['unit_cost']) && (float)$payload['unit_cost'] > 0
                ? round((float)$payload['unit_cost'], 2)
                : $curAvgCost;
            $totalCost = round($quantity * $unitCost, 2);

            $newAvgCost = $curAvgCost;
            if ($movementType === 'purchase' && $stockAfter > 0) {
                $existingVal = $stockBefore * $curAvgCost;
                $newAvgCost = round(($existingVal + $totalCost) / $stockAfter, 2);
            }

            $db->execute(
                'UPDATE accounting_inventory_items SET current_stock = :st, average_unit_cost = :uc, supplier_name = COALESCE(NULLIF(:sup, ""), supplier_name), updated_at = NOW() WHERE id = :id',
                [
                    'st' => number_format($stockAfter, 2, '.', ''),
                    'uc' => number_format($newAvgCost, 2, '.', ''),
                    'sup' => substr(trim((string)($payload['supplier_name'] ?? '')), 0, 191),
                    'id' => $itemId,
                ]
            );

            $qDelta = $isInflow ? $quantity : -$quantity;
            $db->execute(
                'INSERT INTO accounting_inventory_movements
                 (id, item_id, movement_type, quantity_delta, unit_cost, total_cost, selling_total, stock_before, stock_after, payment_method, account_code, supplier_name, reference, notes, recorded_by, recorded_by_name, entry_date, occurred_at)
                 VALUES
                 (:id, :iid, :mt, :qd, :uc, :tc, 0.00, :sb, :sa, :pm, :ac, :sup, :ref, :nt, :rb, :rn, :ed, :occ)',
                [
                    'id' => $movementId,
                    'iid' => $itemId,
                    'mt' => $movementType,
                    'qd' => number_format($qDelta, 2, '.', ''),
                    'uc' => number_format($unitCost, 2, '.', ''),
                    'tc' => number_format($totalCost, 2, '.', ''),
                    'sb' => number_format($stockBefore, 2, '.', ''),
                    'sa' => number_format($stockAfter, 2, '.', ''),
                    'pm' => $isInflow ? $paymentMethod : 'internal',
                    'ac' => $isInflow ? $accountCode : 'INVENTORY_STOCK',
                    'sup' => substr(trim((string)($payload['supplier_name'] ?? '')), 0, 191),
                    'ref' => $ref,
                    'nt' => trim((string)($payload['notes'] ?? '')),
                    'rb' => $actor['id'],
                    'rn' => $actor['full_name'] ?? $actor['email'],
                    'ed' => $entryDate,
                    'occ' => $occurredUtc,
                ]
            );

            // Financial accounting impact:
            // - Purchase: records cash/bank outflow (or purchase cost if expensed) so Cash/Bank reconciliation reflects stock outlay.
            // - Usage/Wastage: recognizes COGS/wastage cost against profit (unless already deducted via physical sale).
            if ($movementType === 'purchase' && $totalCost > 0) {
                $db->execute(
                    'INSERT INTO accounting_entries
                     (id, entry_number, entry_date, occurred_at, occurred_lagos, source_origin, source_table, source_id, entry_category, service_domain, title, description, reference, gross_amount, revenue_amount, cost_amount, fee_amount, expense_amount, net_profit_impact, wallet_liability_delta, payment_channel, account_code, reconciliation_status, customer_name, staff_user_id, staff_name, metadata)
                     VALUES
                     (:id, :eno, :edate, :occ_utc, :occ_lagos, "inventory", "accounting_inventory_movements", :sid, "inventory_purchase", "inventory_purchase", :title, :desc, :ref, :gross, 0.00, :cost, 0.00, 0.00, :profit, 0.00, :pchan, :acode, "unreconciled", :sup, :suid, :sname, :meta)',
                    [
                        'id' => Security::generateUuid(),
                        'eno' => 'ACC-' . $ref,
                        'edate' => $entryDate,
                        'occ_utc' => $occurredUtc,
                        'occ_lagos' => $occurredLagos,
                        'sid' => $movementId,
                        'title' => "Stock Purchase: {$item['name']} ({$quantity} {$item['unit_label']})",
                        'desc' => trim((string)($payload['notes'] ?? "Purchased from " . ($payload['supplier_name'] ?? 'Supplier'))),
                        'ref' => $ref,
                        'gross' => number_format($totalCost, 2, '.', ''),
                        'cost' => number_format($recordAsExpense ? $totalCost : 0.0, 2, '.', ''),
                        'profit' => number_format($recordAsExpense ? -$totalCost : 0.0, 2, '.', ''),
                        'pchan' => $paymentMethod,
                        'acode' => $accountCode,
                        'sup' => substr(trim((string)($payload['supplier_name'] ?? 'Supplier')), 0, 191),
                        'suid' => $actor['id'],
                        'sname' => $actor['full_name'] ?? $actor['email'],
                        'meta' => json_encode(['item_id' => $itemId, 'quantity' => $quantity, 'unit_cost' => $unitCost, 'expensed_on_purchase' => $recordAsExpense]),
                    ]
                );
            } elseif (in_array($movementType, ['usage', 'wastage', 'adjustment_out'], true) && $totalCost > 0) {
                $db->execute(
                    'INSERT INTO accounting_entries
                     (id, entry_number, entry_date, occurred_at, occurred_lagos, source_origin, source_table, source_id, entry_category, service_domain, title, description, reference, gross_amount, revenue_amount, cost_amount, fee_amount, expense_amount, net_profit_impact, wallet_liability_delta, payment_channel, account_code, reconciliation_status, staff_user_id, staff_name, metadata)
                     VALUES
                     (:id, :eno, :edate, :occ_utc, :occ_lagos, "inventory", "accounting_inventory_movements", :sid, :ecat, "inventory_cogs", :title, :desc, :ref, :gross, 0.00, :cost, 0.00, 0.00, :profit, 0.00, "internal", "INVENTORY_STOCK", "na", :suid, :sname, :meta)',
                    [
                        'id' => Security::generateUuid(),
                        'eno' => 'ACC-' . $ref,
                        'edate' => $entryDate,
                        'occ_utc' => $occurredUtc,
                        'occ_lagos' => $occurredLagos,
                        'sid' => $movementId,
                        'ecat' => 'inventory_' . $movementType,
                        'title' => "Inventory " . ucfirst(str_replace('_', ' ', $movementType)) . ": {$item['name']}",
                        'desc' => trim((string)($payload['notes'] ?? '')),
                        'ref' => $ref,
                        'gross' => number_format($totalCost, 2, '.', ''),
                        'cost' => number_format($totalCost, 2, '.', ''),
                        'profit' => number_format(-$totalCost, 2, '.', ''),
                        'suid' => $actor['id'],
                        'sname' => $actor['full_name'] ?? $actor['email'],
                        'meta' => json_encode(['item_id' => $itemId, 'quantity' => $quantity, 'unit_cost' => $unitCost]),
                    ]
                );
            }
        });

        $this->recordAudit($actor, 'INVENTORY_MOVEMENT_RECORDED', [
            'movement_id' => $movementId,
            'item_id' => $itemId,
            'movement_type' => $movementType,
            'quantity' => $quantity,
        ]);

        return $this->getInventoryOverview();
    }

    // =========================================================================
    // 10. MODULE 7: CASH, POS & BANK RECONCILIATION
    // =========================================================================

    private function resolveAccountCodeForPayment(string $paymentMethod, ?string $explicitCode = null): string
    {
        if ($explicitCode && trim($explicitCode) !== '') {
            return strtoupper(trim($explicitCode));
        }
        return match (strtolower(trim($paymentMethod))) {
            'cash' => 'CASH_DRAWER',
            'pos' => 'POS_TERMINAL',
            'bank_transfer', 'transfer' => 'BANK_MAIN',
            'paystack' => 'GATEWAY_PAYSTACK',
            'flutterwave' => 'GATEWAY_FLUTTERWAVE',
            default => 'CASH_DRAWER',
        };
    }

    public function getChannelBalances(): array
    {
        $accounts = $this->getAccounts();
        $flows = $this->db->fetchAll(
            'SELECT
                account_code,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND (revenue_amount > 0 OR entry_category IN ("wallet_funding", "other_business_income")) THEN gross_amount ELSE 0 END), 0) AS total_inflow,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND (expense_amount > 0 OR entry_category IN ("inventory_purchase", "operating_expense", "referral_payout")) THEN (expense_amount + CASE WHEN entry_category = "inventory_purchase" THEN gross_amount ELSE 0 END) ELSE 0 END), 0) AS total_outflow,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN fee_amount ELSE 0 END), 0) AS total_fees
             FROM accounting_entries
             WHERE account_code IS NOT NULL
             GROUP BY account_code'
        );

        $flowMap = [];
        foreach ($flows as $f) {
            $flowMap[$f['account_code']] = $f;
        }

        $result = [];
        foreach ($accounts as $acc) {
            $code = $acc['account_code'];
            if ($code === 'LIABILITY_CUSTOMER_WALLETS') {
                continue;
            }
            $f = $flowMap[$code] ?? ['total_inflow' => 0, 'total_outflow' => 0, 'total_fees' => 0];
            $opening = round((float)$acc['opening_balance'], 2);
            $inflow = round((float)$f['total_inflow'], 2);
            $outflow = round((float)$f['total_outflow'], 2);
            $fees = round((float)$f['total_fees'], 2);
            $expectedBalance = round($opening + $inflow - $outflow - $fees, 2);

            $result[] = [
                'account_code' => $code,
                'account_name' => $acc['account_name'],
                'account_type' => $acc['account_type'],
                'bank_name' => $acc['bank_name'],
                'account_number' => $acc['account_number'],
                'opening_balance' => $opening,
                'total_inflow' => $inflow,
                'total_outflow' => $outflow,
                'total_fees' => $fees,
                'expected_balance' => $expectedBalance,
            ];
        }

        return $result;
    }

    public function previewReconciliation(string $date, string $accountCode): array
    {
        $cleanDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : $this->lagosNow()->format('Y-m-d');
        $acc = $this->db->fetchOne('SELECT * FROM accounting_accounts WHERE account_code = :code LIMIT 1', ['code' => $accountCode]);
        if (!$acc) {
            throw new RuntimeException('Selected channel account not found.');
        }

        $win = $this->resolveLagosDateWindow($cleanDate, $cleanDate);

        // Prior closing balance (last approved/saved reconciliation before date, or opening + cumulative prior flows)
        $lastRec = $this->db->fetchOne(
            'SELECT actual_counted FROM accounting_reconciliations WHERE account_code = :code AND reconcile_date < :dt ORDER BY reconcile_date DESC, created_at DESC LIMIT 1',
            ['code' => $accountCode, 'dt' => $cleanDate]
        );

        if ($lastRec) {
            $openingBalance = round((float)$lastRec['actual_counted'], 2);
        } else {
            $priorFlow = $this->db->fetchOne(
                'SELECT
                    COALESCE(SUM(CASE WHEN is_reversed = 0 AND (revenue_amount > 0 OR entry_category IN ("wallet_funding", "other_business_income")) THEN gross_amount ELSE 0 END), 0) AS pin,
                    COALESCE(SUM(CASE WHEN is_reversed = 0 AND (expense_amount > 0 OR entry_category IN ("inventory_purchase", "operating_expense", "referral_payout")) THEN (expense_amount + CASE WHEN entry_category = "inventory_purchase" THEN gross_amount ELSE 0 END) ELSE 0 END), 0) AS pout,
                    COALESCE(SUM(CASE WHEN is_reversed = 0 THEN fee_amount ELSE 0 END), 0) AS pf
                 FROM accounting_entries
                 WHERE account_code = :code AND occurred_at < :s1',
                ['code' => $accountCode, 's1' => $win['start_utc']]
            ) ?: [];
            $openingBalance = round((float)$acc['opening_balance'] + (float)($priorFlow['pin'] ?? 0) - (float)($priorFlow['pout'] ?? 0) - (float)($priorFlow['pf'] ?? 0), 2);
        }

        $dayRow = $this->db->fetchOne(
            'SELECT
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND (revenue_amount > 0 OR entry_category IN ("wallet_funding", "other_business_income")) THEN gross_amount ELSE 0 END), 0) AS expected_inflow,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND (expense_amount > 0 OR entry_category IN ("inventory_purchase", "operating_expense", "referral_payout")) THEN (expense_amount + CASE WHEN entry_category = "inventory_purchase" THEN gross_amount ELSE 0 END) ELSE 0 END), 0) AS expected_outflow,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN fee_amount ELSE 0 END), 0) AS expected_fees
             FROM accounting_entries
             WHERE account_code = :code AND occurred_at >= :s1 AND occurred_at <= :e1',
            ['code' => $accountCode, 's1' => $win['start_utc'], 'e1' => $win['end_utc']]
        ) ?: [];

        $inflow = round((float)($dayRow['expected_inflow'] ?? 0), 2);
        $outflow = round((float)($dayRow['expected_outflow'] ?? 0), 2);
        $fees = round((float)($dayRow['expected_fees'] ?? 0), 2);
        $expectedClosing = round($openingBalance + $inflow - $outflow - $fees, 2);

        $entries = $this->db->fetchAll(
            'SELECT id, entry_number, occurred_lagos, entry_category, title, reference, gross_amount, fee_amount, expense_amount, reconciliation_status
             FROM accounting_entries
             WHERE account_code = :code AND occurred_at >= :s1 AND occurred_at <= :e1 AND is_reversed = 0
             ORDER BY occurred_at DESC',
            ['code' => $accountCode, 's1' => $win['start_utc'], 'e1' => $win['end_utc']]
        );

        return [
            'reconcile_date' => $cleanDate,
            'account' => $acc,
            'opening_balance' => $openingBalance,
            'expected_inflow' => $inflow,
            'expected_outflow' => $outflow,
            'expected_fees' => $fees,
            'expected_closing' => $expectedClosing,
            'entries' => $entries,
        ];
    }

    public function listReconciliations(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $this->syncWebsiteTransactions(false);
        $from = ($dateFrom && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) ? $dateFrom : $this->lagosNow()->modify('-30 days')->format('Y-m-d');
        $to = ($dateTo && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) ? $dateTo : $this->lagosNow()->format('Y-m-d');

        $records = $this->db->fetchAll(
            'SELECT * FROM accounting_reconciliations WHERE reconcile_date >= :df AND reconcile_date <= :dt ORDER BY reconcile_date DESC, created_at DESC LIMIT 120',
            ['df' => $from, 'dt' => $to]
        );

        return [
            'channel_balances' => $this->getChannelBalances(),
            'reconciliations' => $records,
        ];
    }

    public function submitReconciliation(array $payload, array $actor): array
    {
        $date = trim((string)($payload['reconcile_date'] ?? $this->lagosNow()->format('Y-m-d')));
        $accountCode = strtoupper(trim((string)($payload['account_code'] ?? 'CASH_DRAWER')));
        if (!isset($payload['actual_counted'])) {
            throw new RuntimeException('Actual counted/bank statement balance is required.');
        }
        $actualCounted = round((float)$payload['actual_counted'], 2);

        $preview = $this->previewReconciliation($date, $accountCode);
        $expectedClosing = (float)$preview['expected_closing'];
        $variance = round($actualCounted - $expectedClosing, 2);
        $status = abs($variance) < 0.01 ? 'balanced' : ($variance < 0 ? 'shortage' : 'surplus');

        $id = Security::generateUuid();
        $reconcileNumber = 'REC-' . str_replace('-', '', substr($date, 2)) . '-' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
        $win = $this->resolveLagosDateWindow($date, $date);

        $this->db->withTransaction(function (Database $db) use ($id, $reconcileNumber, $date, $accountCode, $preview, $expectedClosing, $actualCounted, $variance, $status, $payload, $actor, $win) {
            $db->execute(
                'INSERT INTO accounting_reconciliations
                 (id, reconcile_number, reconcile_date, account_code, channel_name, opening_balance, expected_inflow, expected_outflow, expected_fees, expected_closing, actual_counted, variance_amount, status, notes, submitted_by, submitted_by_name)
                 VALUES
                 (:id, :rno, :rdate, :acode, :cname, :ob, :ein, :eout, :efee, :eclose, :act, :var, :st, :nt, :sby, :sname)',
                [
                    'id' => $id,
                    'rno' => $reconcileNumber,
                    'rdate' => $date,
                    'acode' => $accountCode,
                    'cname' => $preview['account']['account_name'] ?? $accountCode,
                    'ob' => number_format((float)$preview['opening_balance'], 2, '.', ''),
                    'ein' => number_format((float)$preview['expected_inflow'], 2, '.', ''),
                    'eout' => number_format((float)$preview['expected_outflow'], 2, '.', ''),
                    'efee' => number_format((float)$preview['expected_fees'], 2, '.', ''),
                    'eclose' => number_format($expectedClosing, 2, '.', ''),
                    'act' => number_format($actualCounted, 2, '.', ''),
                    'var' => number_format($variance, 2, '.', ''),
                    'st' => $status,
                    'nt' => trim((string)($payload['notes'] ?? '')),
                    'sby' => $actor['id'],
                    'sname' => $actor['full_name'] ?? $actor['email'],
                ]
            );

            $entryStatus = abs($variance) < 0.01 ? 'reconciled' : 'flagged';
            $db->execute(
                'UPDATE accounting_entries
                 SET reconciliation_status = :rstat, reconciliation_id = :rid
                 WHERE account_code = :acode AND occurred_at >= :s1 AND occurred_at <= :e1 AND is_reversed = 0',
                [
                    'rstat' => $entryStatus,
                    'rid' => $id,
                    'acode' => $accountCode,
                    's1' => $win['start_utc'],
                    'e1' => $win['end_utc'],
                ]
            );
        });

        $this->recordAudit($actor, 'CHANNEL_RECONCILIATION_SUBMITTED', [
            'id' => $id,
            'reconcile_number' => $reconcileNumber,
            'account_code' => $accountCode,
            'variance' => $variance,
            'status' => $status,
        ]);

        return $this->db->fetchOne('SELECT * FROM accounting_reconciliations WHERE id = :id LIMIT 1', ['id' => $id]) ?? ['id' => $id];
    }

    public function approveReconciliation(string $id, array $actor): array
    {
        $rec = $this->db->fetchOne('SELECT * FROM accounting_reconciliations WHERE id = :id LIMIT 1', ['id' => $id]);
        if (!$rec) {
            throw new RuntimeException('Reconciliation record not found.');
        }
        $this->db->withTransaction(function (Database $db) use ($id, $actor) {
            $db->execute(
                'UPDATE accounting_reconciliations SET status = "approved", approved_by = :ab, approved_by_name = :an, approved_at = NOW() WHERE id = :id',
                ['ab' => $actor['id'], 'an' => $actor['full_name'] ?? $actor['email'], 'id' => $id]
            );
            $db->execute('UPDATE accounting_entries SET reconciliation_status = "reconciled" WHERE reconciliation_id = :rid', ['rid' => $id]);
        });
        $this->recordAudit($actor, 'CHANNEL_RECONCILIATION_APPROVED', ['id' => $id, 'reconcile_number' => $rec['reconcile_number']]);
        return $this->db->fetchOne('SELECT * FROM accounting_reconciliations WHERE id = :id LIMIT 1', ['id' => $id]) ?? $rec;
    }

    // =========================================================================
    // 11. MODULE 8: ACCOUNTING LEDGER, REVERSALS & CSV EXPORT
    // =========================================================================

    public function getLedger(array $filters = []): array
    {
        $this->syncWebsiteTransactions(false);

        $win = $this->resolveLagosDateWindow($filters['date_from'] ?? $this->lagosNow()->modify('-29 days')->format('Y-m-d'), $filters['date_to'] ?? $this->lagosNow()->format('Y-m-d'));
        $where = ['occurred_at >= :s1', 'occurred_at <= :e1'];
        $params = ['s1' => $win['start_utc'], 'e1' => $win['end_utc']];

        if (!empty($filters['source_origin']) && $filters['source_origin'] !== 'all') {
            $where[] = 'source_origin = :orig';
            $params['orig'] = (string)$filters['source_origin'];
        }
        if (!empty($filters['entry_category']) && $filters['entry_category'] !== 'all') {
            $where[] = 'entry_category = :ecat';
            $params['ecat'] = (string)$filters['entry_category'];
        }
        if (!empty($filters['payment_channel']) && $filters['payment_channel'] !== 'all') {
            $where[] = 'payment_channel = :pchan';
            $params['pchan'] = (string)$filters['payment_channel'];
        }
        if (!empty($filters['reconciliation_status']) && $filters['reconciliation_status'] !== 'all') {
            $where[] = 'reconciliation_status = :rstat';
            $params['rstat'] = (string)$filters['reconciliation_status'];
        }
        if (!empty($filters['search'])) {
            $q = '%' . trim((string)$filters['search']) . '%';
            $where[] = '(entry_number LIKE :q1 OR title LIKE :q2 OR reference LIKE :q3 OR customer_name LIKE :q4 OR staff_name LIKE :q5)';
            $params['q1'] = $q;
            $params['q2'] = $q;
            $params['q3'] = $q;
            $params['q4'] = $q;
            $params['q5'] = $q;
        }

        $whereSql = implode(' AND ', $where);
        $limit = max(20, min(2000, (int)($filters['limit'] ?? 200)));

        $entries = $this->db->fetchAll(
            "SELECT * FROM accounting_entries WHERE {$whereSql} ORDER BY occurred_at DESC, created_at DESC LIMIT {$limit}",
            $params
        );

        $totals = $this->db->fetchOne(
            "SELECT
                COUNT(*) AS entries_count,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN revenue_amount ELSE 0 END), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN cost_amount ELSE 0 END), 0) AS total_costs,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN fee_amount ELSE 0 END), 0) AS total_fees,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN expense_amount ELSE 0 END), 0) AS total_expenses,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN net_profit_impact ELSE 0 END), 0) AS total_net_profit,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN wallet_liability_delta ELSE 0 END), 0) AS net_wallet_delta
             FROM accounting_entries WHERE {$whereSql}",
            $params
        ) ?: [];

        return [
            'period' => $win,
            'totals' => [
                'entries_count' => (int)($totals['entries_count'] ?? 0),
                'total_revenue' => round((float)($totals['total_revenue'] ?? 0), 2),
                'total_costs' => round((float)($totals['total_costs'] ?? 0), 2),
                'total_fees' => round((float)($totals['total_fees'] ?? 0), 2),
                'total_expenses' => round((float)($totals['total_expenses'] ?? 0), 2),
                'total_net_profit' => round((float)($totals['total_net_profit'] ?? 0), 2),
                'net_wallet_delta' => round((float)($totals['net_wallet_delta'] ?? 0), 2),
            ],
            'entries' => $entries,
        ];
    }

    public function reverseLedgerEntry(string $entryId, string $reason, array $actor): array
    {
        $entry = $this->db->fetchOne('SELECT * FROM accounting_entries WHERE id = :id LIMIT 1', ['id' => $entryId]);
        if (!$entry) {
            throw new RuntimeException('Accounting entry not found.');
        }
        if ((int)$entry['is_reversed'] === 1) {
            throw new RuntimeException('This accounting entry has already been reversed.');
        }
        if ($entry['source_table'] === 'accounting_physical_sales' && !empty($entry['source_id'])) {
            return ['reversed_via' => 'physical_sale_void', 'sale' => $this->voidPhysicalSale((string)$entry['source_id'], $reason, $actor)];
        }
        if ($entry['source_table'] === 'accounting_expenses_income' && !empty($entry['source_id'])) {
            return ['reversed_via' => 'expense_income_void', 'record' => $this->voidExpenseOrIncome((string)$entry['source_id'], $reason, $actor)];
        }

        $cleanReason = trim($reason) !== '' ? trim($reason) : 'Manual accounting reversal';
        $contraId = Security::generateUuid();
        $nowLagos = $this->lagosNow();

        $this->db->withTransaction(function (Database $db) use ($entryId, $entry, $contraId, $cleanReason, $actor, $nowLagos) {
            $db->execute(
                'UPDATE accounting_entries SET is_reversed = 1, reversed_by = :rb, reversed_at = NOW() WHERE id = :id',
                ['rb' => $actor['id'], 'id' => $entryId]
            );
            // Insert explicit contra audit record (flagged is_reversed = 1 so totals stay zeroed without double-counting)
            $db->execute(
                'INSERT INTO accounting_entries
                 (id, entry_number, entry_date, occurred_at, occurred_lagos, source_origin, source_table, source_id, entry_category, service_domain, title, description, reference, gross_amount, revenue_amount, cost_amount, fee_amount, expense_amount, net_profit_impact, wallet_liability_delta, payment_channel, account_code, reconciliation_status, customer_id, customer_name, staff_user_id, staff_name, is_reversed, reversal_of_entry_id, reversed_by, reversed_at, metadata)
                 VALUES
                 (:id, :eno, :ed, :occ_utc, :occ_lagos, "adjustment", "accounting_entries", :sid, "accounting_reversal", :sdom, :title, :desc, :ref, :gross, :rev, :cost, :fee, :exp, :profit, :liab, :pchan, :acode, "na", :cid, :cname, :suid, :sname, 1, :origid, :rb, NOW(), :meta)',
                [
                    'id' => $contraId,
                    'eno' => 'REV-' . substr((string)$entry['entry_number'], 0, 50),
                    'ed' => $nowLagos->format('Y-m-d'),
                    'occ_utc' => $nowLagos->setTimezone($this->utcTz)->format('Y-m-d H:i:s'),
                    'occ_lagos' => $nowLagos->format('Y-m-d H:i:s'),
                    'sid' => $contraId,
                    'sdom' => $entry['service_domain'],
                    'title' => 'REVERSAL: ' . mb_substr((string)$entry['title'], 0, 175),
                    'desc' => $cleanReason,
                    'ref' => $entry['reference'],
                    'gross' => number_format(-(float)$entry['gross_amount'], 2, '.', ''),
                    'rev' => number_format(-(float)$entry['revenue_amount'], 2, '.', ''),
                    'cost' => number_format(-(float)$entry['cost_amount'], 2, '.', ''),
                    'fee' => number_format(-(float)$entry['fee_amount'], 2, '.', ''),
                    'exp' => number_format(-(float)$entry['expense_amount'], 2, '.', ''),
                    'profit' => number_format(-(float)$entry['net_profit_impact'], 2, '.', ''),
                    'liab' => number_format(-(float)$entry['wallet_liability_delta'], 2, '.', ''),
                    'pchan' => $entry['payment_channel'],
                    'acode' => $entry['account_code'],
                    'cid' => $entry['customer_id'],
                    'cname' => $entry['customer_name'],
                    'suid' => $actor['id'],
                    'sname' => $actor['full_name'] ?? $actor['email'],
                    'origid' => $entryId,
                    'rb' => $actor['id'],
                    'meta' => json_encode(['reason' => $cleanReason, 'reversed_entry_number' => $entry['entry_number']]),
                ]
            );
        });

        $this->recordAudit($actor, 'ACCOUNTING_ENTRY_REVERSED', ['entry_id' => $entryId, 'entry_number' => $entry['entry_number'], 'reason' => $cleanReason]);
        return ['reversed_entry_id' => $entryId, 'contra_entry_id' => $contraId];
    }

    // =========================================================================
    // 12. MODULE 9: BUSINESS PERFORMANCE ANALYTICS
    // =========================================================================

    public function getAnalytics(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $this->syncWebsiteTransactions(false);
        $from = ($dateFrom && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) ? $dateFrom : $this->lagosNow()->modify('-29 days')->format('Y-m-d');
        $to = ($dateTo && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) ? $dateTo : $this->lagosNow()->format('Y-m-d');
        $win = $this->resolveLagosDateWindow($from, $to);

        $summary = $this->computePeriodSummary($win['start_utc'], $win['end_utc'], $win['date_from'], $win['date_to']);

        $dailySeries = $this->db->fetchAll(
            'SELECT
                entry_date,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category IN ("website_service_sale", "customer_refund") THEN revenue_amount ELSE 0 END), 0) AS website_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND source_origin = "physical" THEN revenue_amount ELSE 0 END), 0) AS physical_revenue,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND source_origin = "income" THEN revenue_amount ELSE 0 END), 0) AS other_income,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN cost_amount ELSE 0 END), 0) AS total_cogs,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN (fee_amount + expense_amount) ELSE 0 END), 0) AS total_opex_fees,
                COALESCE(SUM(CASE WHEN is_reversed = 0 THEN net_profit_impact ELSE 0 END), 0) AS net_profit,
                COALESCE(SUM(CASE WHEN is_reversed = 0 AND entry_category = "wallet_funding" THEN gross_amount ELSE 0 END), 0) AS wallet_funding
             FROM accounting_entries
             WHERE occurred_at >= :s1 AND occurred_at <= :e1
             GROUP BY entry_date
             ORDER BY entry_date ASC',
            ['s1' => $win['start_utc'], 'e1' => $win['end_utc']]
        );

        $topServices = $this->db->fetchAll(
            'SELECT
                source_origin,
                service_domain,
                COUNT(CASE WHEN revenue_amount > 0 THEN 1 END) AS sales_count,
                COALESCE(SUM(revenue_amount), 0) AS revenue,
                COALESCE(SUM(cost_amount), 0) AS cogs,
                COALESCE(SUM(fee_amount), 0) AS fees,
                COALESCE(SUM(net_profit_impact), 0) AS net_profit
             FROM accounting_entries
             WHERE occurred_at >= :s1 AND occurred_at <= :e1
               AND is_reversed = 0
               AND source_origin IN ("website", "physical", "income")
               AND entry_category != "wallet_funding"
               AND entry_category != "referral_wallet_credit"
               AND entry_category != "referral_payout"
             GROUP BY source_origin, service_domain
             HAVING ABS(revenue) > 0 OR ABS(net_profit) > 0
             ORDER BY revenue DESC',
            ['s1' => $win['start_utc'], 'e1' => $win['end_utc']]
        );

        $expenseBreakdown = $this->db->fetchAll(
            'SELECT category, COUNT(*) AS items_count, COALESCE(SUM(amount), 0) AS total_amount
             FROM accounting_expenses_income
             WHERE occurred_at >= :s1 AND occurred_at <= :e1 AND status = "active" AND record_type = "expense"
             GROUP BY category
             ORDER BY total_amount DESC',
            ['s1' => $win['start_utc'], 'e1' => $win['end_utc']]
        );

        $staffPerformance = $this->db->fetchAll(
            'SELECT COALESCE(attendant_name, "Admin") AS staff_name, COUNT(*) AS sales_count, COALESCE(SUM(net_amount), 0) AS total_revenue, COALESCE(SUM(net_amount - direct_cost - pos_fee), 0) AS net_profit
             FROM accounting_physical_sales
             WHERE occurred_at >= :s1 AND occurred_at <= :e1 AND status = "completed"
             GROUP BY attendant_user_id, attendant_name
             ORDER BY total_revenue DESC',
            ['s1' => $win['start_utc'], 'e1' => $win['end_utc']]
        );

        return [
            'period' => $win,
            'summary' => $summary,
            'daily_series' => $dailySeries,
            'top_services' => $topServices,
            'expense_breakdown' => $expenseBreakdown,
            'staff_performance' => $staffPerformance,
        ];
    }

    // =========================================================================
    // 13. MODULE 10: AUTOMATED DAILY 12:00 PM WAT EMAIL REPORTING
    // =========================================================================

    public function buildDailyMiddayReport(?string $lagosDateOverride = null, ?string $cutoffOverride = null): array
    {
        $this->syncWebsiteTransactions(false);
        $cfg = $this->getConfig();
        $nowLagos = $this->lagosNow();

        $todayLagos = ($lagosDateOverride && preg_match('/^\d{4}-\d{2}-\d{2}$/', $lagosDateOverride))
            ? $lagosDateOverride
            : $nowLagos->format('Y-m-d');

        $todayDt = new DateTimeImmutable($todayLagos . ' 12:00:00', $this->lagosTz);
        $prevDayLagos = $todayDt->modify('-1 day')->format('Y-m-d');
        $cutoffClock = $cutoffOverride ?: (string)($cfg['daily_email_cutoff_time'] ?? '11:59');
        if (strlen($cutoffClock) === 5) {
            $cutoffClock .= ':59';
        }

        $prevWin = $this->resolveLagosDateWindow($prevDayLagos, $prevDayLagos, '23:59:59');
        $morningWin = $this->resolveLagosDateWindow($todayLagos, $todayLagos, $cutoffClock);

        $prevSummary = $this->computePeriodSummary($prevWin['start_utc'], $prevWin['end_utc'], $prevDayLagos, $prevDayLagos);
        $morningSummary = $this->computePeriodSummary($morningWin['start_utc'], $morningWin['end_utc'], $todayLagos, $todayLagos);

        $walletLiabilities = $this->getWalletLiabilitySummary();
        $channelBalances = $this->getChannelBalances();
        $lowStockItems = $this->getLowStockItems();

        $prevReconciliations = $this->db->fetchAll(
            'SELECT reconcile_number, account_code, channel_name, expected_closing, actual_counted, variance_amount, status
             FROM accounting_reconciliations
             WHERE reconcile_date = :dt OR reconcile_date = :dt2
             ORDER BY reconcile_date DESC, created_at DESC',
            ['dt' => $prevDayLagos, 'dt2' => $todayLagos]
        );

        $recentExceptions = $this->db->fetchAll(
            'SELECT entry_number, occurred_lagos, entry_category, title, reference, gross_amount, customer_name
             FROM accounting_entries
             WHERE occurred_at >= :s1 AND occurred_at <= :e1
               AND (entry_category = "customer_refund" OR is_reversed = 1)
             ORDER BY occurred_at DESC LIMIT 20',
            ['s1' => $prevWin['start_utc'], 'e1' => $morningWin['end_utc']]
        );

        $reportData = [
            'generated_at_lagos' => $nowLagos->format('Y-m-d H:i:s') . ' WAT',
            'lagos_report_date' => $todayLagos,
            'prev_day_date' => $prevDayLagos,
            'cutoff_time_lagos' => substr($cutoffClock, 0, 5) . ' WAT',
            'recipients' => $cfg['daily_email_recipients'],
            'sections' => $cfg['report_sections'],
            'previous_day_final' => $prevSummary,
            'today_morning_midday' => $morningSummary,
            'wallet_liabilities' => $walletLiabilities['summary'],
            'channel_balances' => $channelBalances,
            'reconciliations' => $prevReconciliations,
            'low_stock_items' => $lowStockItems,
            'refunds_and_exceptions' => $recentExceptions,
        ];

        $reportData['subject'] = "HAMBAKTECH Daily Business & Accounting Report — {$prevDayLagos} Final + {$todayLagos} Morning (12:00 PM WAT)";
        $reportData['html'] = $this->renderDailyReportHtml($reportData);
        $reportData['text'] = $this->renderDailyReportText($reportData);

        return $reportData;
    }

    public function dispatchDailyMiddayReport(bool $forceSend = false, string $triggeredBy = 'cron', ?array $overrideRecipients = null): array
    {
        $cfg = $this->getConfig();
        if (!$forceSend && empty($cfg['daily_email_enabled'])) {
            return ['success' => true, 'skipped' => true, 'reason' => 'Daily automated email reporting is disabled in Accounting Configuration.'];
        }

        $nowLagos = $this->lagosNow();
        $todayLagos = $nowLagos->format('Y-m-d');
        $reportKey = ($triggeredBy === 'cron' && !$forceSend)
            ? ('daily_midday_' . $todayLagos)
            : ('manual_' . $todayLagos . '_' . $nowLagos->format('His') . '_' . substr(bin2hex(random_bytes(2)), 0, 4));

        // Guard against duplicate automated 12:00 PM cron delivery for the same Lagos business day
        if ($triggeredBy === 'cron' && !$forceSend) {
            $already = $this->db->fetchOne('SELECT id, status, sent_at FROM accounting_report_logs WHERE report_key = :rk AND status = "sent" LIMIT 1', ['rk' => $reportKey]);
            if ($already) {
                return [
                    'success' => true,
                    'skipped' => true,
                    'report_key' => $reportKey,
                    'reason' => "Daily midday report for {$todayLagos} was already dispatched at {$already['sent_at']}.",
                ];
            }
        }

        $report = $this->buildDailyMiddayReport($todayLagos);
        $recipients = !empty($overrideRecipients) ? $overrideRecipients : $report['recipients'];
        $cleanRecipients = [];
        foreach ($recipients as $r) {
            $em = strtolower(trim((string)$r));
            if ($em !== '' && filter_var($em, FILTER_VALIDATE_EMAIL)) {
                $cleanRecipients[] = $em;
            }
        }
        $cleanRecipients = array_values(array_unique($cleanRecipients));
        if (empty($cleanRecipients)) {
            $cleanRecipients = ['admin@hambaktech.com.ng'];
        }

        $mail = new MailService();
        $deliveryResults = [];
        $allSuccess = true;
        $errors = [];

        foreach ($cleanRecipients as $email) {
            $res = $mail->send($email, 'HAMBAKTECH Administration', $report['subject'], $report['html'], null, [
                'text_body' => $report['text'],
                'audit_action' => 'DAILY_ACCOUNTING_REPORT_EMAIL',
            ]);
            $deliveryResults[] = $res;
            if (empty($res['sent'])) {
                $allSuccess = false;
                $errors[] = "{$email}: " . ($res['error'] ?? $res['message'] ?? 'Delivery failed');
            }
        }

        $snapshot = [
            'prev_revenue' => $report['previous_day_final']['total_business_revenue'],
            'prev_profit' => $report['previous_day_final']['net_profit'],
            'prev_unverified_revenue' => $report['previous_day_final']['unverified_cost_revenue'] ?? 0,
            'morning_revenue' => $report['today_morning_midday']['total_business_revenue'],
            'morning_profit' => $report['today_morning_midday']['net_profit'],
            'wallet_liability' => $report['wallet_liabilities']['total_customer_liability'],
            'smtp_message_ids' => array_values(array_filter(array_map(static fn(array $r) => $r['message_id'] ?? null, $deliveryResults))),
            'smtp_responses' => array_values(array_filter(array_map(static fn(array $r) => $r['smtp_response'] ?? null, $deliveryResults))),
        ];

        try {
            $this->db->execute(
                'INSERT INTO accounting_report_logs
                 (id, report_key, report_type, lagos_report_date, prev_day_date, cutoff_time_lagos, recipients, status, error_message, summary_snapshot, triggered_by, sent_at)
                 VALUES
                 (:id, :rk, :rt, :ld, :pd, :ct, :rec, :st, :err, :snap, :tb, NOW())
                 ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    error_message = VALUES(error_message),
                    recipients = VALUES(recipients),
                    summary_snapshot = VALUES(summary_snapshot),
                    sent_at = NOW()',
                [
                    'id' => Security::generateUuid(),
                    'rk' => $reportKey,
                    'rt' => $triggeredBy === 'cron' ? 'daily_midday' : 'manual_send',
                    'ld' => $todayLagos,
                    'pd' => $report['prev_day_date'],
                    'ct' => $report['cutoff_time_lagos'],
                    'rec' => implode(', ', $cleanRecipients),
                    'st' => $allSuccess ? 'sent' : 'failed',
                    'err' => empty($errors) ? null : implode(' | ', $errors),
                    'snap' => json_encode($snapshot),
                    'tb' => substr($triggeredBy, 0, 64),
                ]
            );
        } catch (Throwable) {
        }

        return [
            'success' => $allSuccess,
            'skipped' => false,
            'report_key' => $reportKey,
            'recipients' => $cleanRecipients,
            'subject' => $report['subject'],
            'delivery_results' => $deliveryResults,
            'error' => empty($errors) ? null : implode(' | ', $errors),
            'snapshot' => $snapshot,
        ];
    }

    public function getReportLogs(): array
    {
        return $this->db->fetchAll('SELECT * FROM accounting_report_logs ORDER BY sent_at DESC, created_at DESC LIMIT 60');
    }

    private function fmtNaira(float $val): string
    {
        $sign = $val < 0 ? '-' : '';
        return $sign . '&#8358;' . number_format(abs($val), 2);
    }

    private function renderDailyReportHtml(array $data): string
    {
        $p = $data['previous_day_final'];
        $m = $data['today_morning_midday'];
        $wl = $data['wallet_liabilities'];
        $sec = $data['sections'];
        $prevDate = htmlspecialchars((string)$data['prev_day_date']);
        $todayDate = htmlspecialchars((string)$data['lagos_report_date']);
        $cutoff = htmlspecialchars((string)$data['cutoff_time_lagos']);
        $gen = htmlspecialchars((string)$data['generated_at_lagos']);

        $domainsHtml = '';
        if (!empty($sec['website_service_breakdown'])) {
            $allDomains = [];
            foreach ($p['website_domains'] as $d) {
                $allDomains[$d['service_domain']] = ['prev' => $d, 'morn' => null];
            }
            foreach ($m['website_domains'] as $d) {
                if (!isset($allDomains[$d['service_domain']])) {
                    $allDomains[$d['service_domain']] = ['prev' => null, 'morn' => $d];
                } else {
                    $allDomains[$d['service_domain']]['morn'] = $d;
                }
            }
            $rowsHtml = '';
            foreach ($allDomains as $dom => $pair) {
                $pv = $pair['prev'] ?? ['tx_count' => 0, 'net_revenue' => 0, 'provider_cost' => 0, 'net_profit' => 0];
                $mv = $pair['morn'] ?? ['tx_count' => 0, 'net_revenue' => 0, 'net_profit' => 0];
                $label = htmlspecialchars(strtoupper(str_replace('_', ' ', (string)$dom)));
                $rowsHtml .= '<tr>'
                    . "<td style=\"padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;\">{$label}</td>"
                    . "<td style=\"padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;\">{$pv['tx_count']}</td>"
                    . "<td style=\"padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;\">" . $this->fmtNaira((float)$pv['net_revenue']) . "</td>"
                    . "<td style=\"padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;\">" . $this->fmtNaira((float)$pv['provider_cost']) . "</td>"
                    . "<td style=\"padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#047857;\">" . $this->fmtNaira((float)$pv['net_profit']) . "</td>"
                    . "<td style=\"padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;\">" . $this->fmtNaira((float)$mv['net_revenue']) . "</td>"
                    . '</tr>';
            }
            if ($rowsHtml === '') {
                $rowsHtml = '<tr><td colspan="6" style="padding:10px;text-align:center;color:#64748b;">No automated website service transactions recorded in this window.</td></tr>';
            }
            $domainsHtml = <<<HTML
            <h3 style="margin:24px 0 8px 0;font-size:14px;color:#0f172a;text-transform:uppercase;letter-spacing:0.04em;">Website Service Performance Breakdown</h3>
            <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:12px;">
              <thead>
                <tr style="background:#f1f5f9;color:#475569;text-align:left;">
                  <th style="padding:8px 10px;">Service</th>
                  <th style="padding:8px 10px;text-align:right;">Prev Qty</th>
                  <th style="padding:8px 10px;text-align:right;">Prev Revenue</th>
                  <th style="padding:8px 10px;text-align:right;">Prev Cost</th>
                  <th style="padding:8px 10px;text-align:right;">Prev Profit</th>
                  <th style="padding:8px 10px;text-align:right;">Today AM Rev</th>
                </tr>
              </thead>
              <tbody>{$rowsHtml}</tbody>
            </table>
            HTML;
        }

        $channelsHtml = '';
        if (!empty($sec['cash_pos_bank_reconciliation'])) {
            $chRows = '';
            foreach ($data['channel_balances'] as $cb) {
                $chRows .= '<tr>'
                    . '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;">' . htmlspecialchars((string)$cb['account_name']) . '</td>'
                    . '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">' . $this->fmtNaira((float)$cb['total_inflow']) . '</td>'
                    . '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">' . $this->fmtNaira((float)$cb['total_outflow'] + (float)$cb['total_fees']) . '</td>'
                    . '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">' . $this->fmtNaira((float)$cb['expected_balance']) . '</td>'
                    . '</tr>';
            }
            $channelsHtml = <<<HTML
            <h3 style="margin:24px 0 8px 0;font-size:14px;color:#0f172a;text-transform:uppercase;letter-spacing:0.04em;">Cash, POS &amp; Bank Channel Positions</h3>
            <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:12px;">
              <thead>
                <tr style="background:#f1f5f9;color:#475569;text-align:left;">
                  <th style="padding:8px 10px;">Account / Channel</th>
                  <th style="padding:8px 10px;text-align:right;">Inflows</th>
                  <th style="padding:8px 10px;text-align:right;">Outflows + Fees</th>
                  <th style="padding:8px 10px;text-align:right;">Expected Balance</th>
                </tr>
              </thead>
              <tbody>{$chRows}</tbody>
            </table>
            HTML;
        }

        $lowStockHtml = '';
        if (!empty($sec['low_stock_alerts']) && !empty($data['low_stock_items'])) {
            $lsRows = '';
            foreach ($data['low_stock_items'] as $ls) {
                $lsRows .= '<li><strong>' . htmlspecialchars((string)$ls['name']) . '</strong> (' . htmlspecialchars((string)$ls['sku']) . '): '
                    . number_format((float)$ls['current_stock'], 1) . ' ' . htmlspecialchars((string)$ls['unit_label'])
                    . ' remaining (Reorder at ' . number_format((float)$ls['reorder_level'], 1) . ')</li>';
            }
            $lowStockHtml = <<<HTML
            <div style="margin-top:20px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;">
              <strong>Low Inventory Reorder Alerts ({$this->countSafe($data['low_stock_items'])} items):</strong>
              <ul style="margin:6px 0 0 18px;padding:0;">{$lsRows}</ul>
            </div>
            HTML;
        }

        $combinedProfitColor = $p['net_profit'] >= 0 ? '#047857' : '#b91c1c';
        $mornProfitColor = $m['net_profit'] >= 0 ? '#047857' : '#b91c1c';
        $totalUnverifiedCnt = (int)($p['unverified_cost_count'] ?? 0) + (int)($m['unverified_cost_count'] ?? 0);
        $totalUnverifiedRev = round((float)($p['unverified_cost_revenue'] ?? 0) + (float)($m['unverified_cost_revenue'] ?? 0), 2);
        $unverifiedHtml = '';
        if ($totalUnverifiedCnt > 0) {
            $unverifiedHtml = '<div style="margin-top:16px;padding:12px 14px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:12px;color:#92400e;">'
                . "<strong>Unverified-Cost Exclusion Policy:</strong> {$totalUnverifiedCnt} historical website transaction(s) totaling {$this->fmtNaira($totalUnverifiedRev)} lacked a verifiable provider cost record and were excluded from Net Profit (reported as &#8358;0.00 profit rather than inflating profit)."
                . '</div>';
        }

        return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>HAMBAKTECH Daily Business &amp; Accounting Report</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:20px;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
        <div style="font-size:18px;font-weight:800;letter-spacing:-0.01em;">HAMBAK TECH &amp; SERVICES &mdash; Daily Accounting Brief</div>
        <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">Generated: {$gen} &bull; Previous Day Final ({$prevDate}) + Today Midday ({$todayDate} 00:00&ndash;{$cutoff})</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;">
        <div style="padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e3a8a;margin-bottom:20px;">
          <strong>Accounting Policy Reminder:</strong> Customer wallet deposits are tracked strictly as wallet liabilities and are <strong>never</strong> included in company revenue.
        </div>

        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:10px 0;margin:0 -10px;">
          <tr>
            <td width="50%" valign="top" style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc;">
              <div style="font-size:11px;text-transform:uppercase;color:#475569;font-weight:700;">Previous Day Final ({$prevDate})</div>
              <div style="font-size:20px;font-weight:800;color:#0f172a;margin:6px 0 2px 0;">Revenue: {$this->fmtNaira((float)$p['total_business_revenue'])}</div>
              <div style="font-size:14px;font-weight:700;color:{$combinedProfitColor};margin-bottom:10px;">Verified Profit: {$this->fmtNaira((float)$p['net_profit'])}</div>
              <table width="100%" style="font-size:12px;color:#334155;">
                <tr><td>Website Service Rev:</td><td align="right"><strong>{$this->fmtNaira((float)$p['website_revenue'])}</strong></td></tr>
                <tr><td>Physical Counter Sales:</td><td align="right"><strong>{$this->fmtNaira((float)$p['physical_revenue'])}</strong></td></tr>
                <tr><td>Other Business Income:</td><td align="right"><strong>{$this->fmtNaira((float)$p['other_income'])}</strong></td></tr>
                <tr><td>Provider &amp; Stock COGS:</td><td align="right">-{$this->fmtNaira((float)$p['provider_costs'] + (float)$p['direct_inventory_cogs'])}</td></tr>
                <tr><td>Gateway/POS Fees:</td><td align="right">-{$this->fmtNaira((float)$p['gateway_pos_fees'])}</td></tr>
                <tr><td>Operating Expenses:</td><td align="right">-{$this->fmtNaira((float)$p['operating_expenses'])}</td></tr>
                <tr><td>Customer Wallet Funding:</td><td align="right">{$this->fmtNaira((float)$p['customer_wallet_deposits'])}</td></tr>
                <tr><td>Refunds Issued ({$p['counts']['refunds']}):</td><td align="right">{$this->fmtNaira((float)$p['website_refunds'])}</td></tr>
              </table>
            </td>
            <td width="50%" valign="top" style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc;">
              <div style="font-size:11px;text-transform:uppercase;color:#1d4ed8;font-weight:700;">Current Day Activity (00:00 &ndash; {$cutoff})</div>
              <div style="font-size:20px;font-weight:800;color:#0f172a;margin:6px 0 2px 0;">Revenue: {$this->fmtNaira((float)$m['total_business_revenue'])}</div>
              <div style="font-size:14px;font-weight:700;color:{$mornProfitColor};margin-bottom:10px;">Verified Profit: {$this->fmtNaira((float)$m['net_profit'])}</div>
              <table width="100%" style="font-size:12px;color:#334155;">
                <tr><td>Website Service Rev:</td><td align="right"><strong>{$this->fmtNaira((float)$m['website_revenue'])}</strong></td></tr>
                <tr><td>Physical Counter Sales:</td><td align="right"><strong>{$this->fmtNaira((float)$m['physical_revenue'])}</strong></td></tr>
                <tr><td>Other Business Income:</td><td align="right"><strong>{$this->fmtNaira((float)$m['other_income'])}</strong></td></tr>
                <tr><td>Provider &amp; Stock COGS:</td><td align="right">-{$this->fmtNaira((float)$m['provider_costs'] + (float)$m['direct_inventory_cogs'])}</td></tr>
                <tr><td>Gateway/POS Fees:</td><td align="right">-{$this->fmtNaira((float)$m['gateway_pos_fees'])}</td></tr>
                <tr><td>Operating Expenses:</td><td align="right">-{$this->fmtNaira((float)$m['operating_expenses'])}</td></tr>
                <tr><td>Customer Wallet Funding:</td><td align="right">{$this->fmtNaira((float)$m['customer_wallet_deposits'])}</td></tr>
                <tr><td>Physical Cash / POS / Bank:</td><td align="right">{$this->fmtNaira((float)$m['physical_payment_split']['cash'])} / {$this->fmtNaira((float)$m['physical_payment_split']['pos'])} / {$this->fmtNaira((float)$m['physical_payment_split']['transfer'])}</td></tr>
              </table>
            </td>
          </tr>
        </table>

        <div style="margin-top:20px;border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#ffffff;font-size:12px;">
          <strong>Customer Wallet &amp; Liability Position (Live Snapshot):</strong>
          <table width="100%" style="margin-top:6px;color:#334155;">
            <tr>
              <td>Total Customer Wallet Liabilities ({$wl['funded_wallets_count']} funded / {$wl['total_customers']} customers):</td>
              <td align="right"><strong>{$this->fmtNaira((float)$wl['total_customer_liability'])}</strong></td>
            </tr>
            <tr>
              <td>Referral Reward Liabilities (Pending + Available + Reserved):</td>
              <td align="right"><strong>{$this->fmtNaira((float)$wl['referral_liability_total'])}</strong></td>
            </tr>
            <tr>
              <td>Internal/Admin Wallets (Excluded from Liability):</td>
              <td align="right">{$this->fmtNaira((float)$wl['internal_admin_wallets_total'])}</td>
            </tr>
          </table>
        </div>

        {$unverifiedHtml}
        {$domainsHtml}
        {$channelsHtml}
        {$lowStockHtml}

        <p style="font-size:11px;color:#64748b;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px;">
          Automated 12:00 PM Africa/Lagos Financial Report &bull; HAMBAK TECH &amp; SERVICES Admin Console.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }

    private function countSafe(array $items): int
    {
        return count($items);
    }

    private function renderDailyReportText(array $data): string
    {
        $p = $data['previous_day_final'];
        $m = $data['today_morning_midday'];
        $wl = $data['wallet_liabilities'];
        $unvNote = '';
        $unvCnt = (int)($p['unverified_cost_count'] ?? 0) + (int)($m['unverified_cost_count'] ?? 0);
        if ($unvCnt > 0) {
            $unvAmt = (float)($p['unverified_cost_revenue'] ?? 0) + (float)($m['unverified_cost_revenue'] ?? 0);
            $unvNote = "\nNOTE: {$unvCnt} transaction(s) totaling NGN " . number_format($unvAmt, 2) . " lacked verified provider costs and were excluded from Verified Profit.\n";
        }
        return "HAMBAKTECH Daily Business & Accounting Report\n"
            . "Generated: {$data['generated_at_lagos']}\n\n"
            . "PREVIOUS DAY FINAL ({$data['prev_day_date']}):\n"
            . "  Total Business Revenue: NGN " . number_format((float)$p['total_business_revenue'], 2) . "\n"
            . "  Verified Net Profit: NGN " . number_format((float)$p['net_profit'], 2) . "\n"
            . "  Customer Wallet Deposits (Liability Only): NGN " . number_format((float)$p['customer_wallet_deposits'], 2) . "\n\n"
            . "CURRENT DAY MORNING ({$data['lagos_report_date']} 00:00 - {$data['cutoff_time_lagos']}):\n"
            . "  Total Business Revenue: NGN " . number_format((float)$m['total_business_revenue'], 2) . "\n"
            . "  Verified Net Profit: NGN " . number_format((float)$m['net_profit'], 2) . "\n"
            . "  Customer Wallet Deposits (Liability Only): NGN " . number_format((float)$m['customer_wallet_deposits'], 2) . "\n\n"
            . "LIVE CUSTOMER WALLET LIABILITIES: NGN " . number_format((float)$wl['total_customer_liability'], 2) . "\n"
            . $unvNote;
    }

    private function recordAudit(array $actor, string $action, array $details): void
    {
        try {
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, user_email, action, details, ip_address, created_at)
                 VALUES (:id, :uid, :email, :act, :det, :ip, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $actor['id'] ?? null,
                    'email' => $actor['email'] ?? 'system@hambaktech.com.ng',
                    'act' => $action,
                    'det' => json_encode($details),
                    'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
                ]
            );
            FootprintService::record([
                'category' => 'admin',
                'action' => $action,
                'user_id' => $actor['id'] ?? null,
                'user_email' => $actor['email'] ?? null,
                'user_name' => $actor['full_name'] ?? null,
                'service_type' => 'accounting',
                'status' => 'successful',
                'metadata' => $details,
            ]);
        } catch (Throwable) {
        }
    }
}
