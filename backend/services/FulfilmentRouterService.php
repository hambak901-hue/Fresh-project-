<?php
/**
 * @file FulfilmentRouterService.php
 * Unified Service Routing & Fulfilment Engine (Phase 3)
 *
 * Central decision engine governing:
 *   1. Resolving per-SKU fulfilment_mode ('provider_instant' | 'provider_async' | 'internal_manual')
 *   2. Enforcing strict eligibility, active provider & credential readiness (fail-closed)
 *   3. Prohibiting silent cross-mode fallbacks (never routes external failures to manual,
 *      never enables internal_manual on ineligible instant registry lookups)
 *   4. Capturing immutable per-order routing_snapshot, sla_due_at, and internal_fulfilment_cost
 *   5. Enforcing atomic dispatch locking & attempt accounting across order tables
 *   6. Managing administrator routing updates with mandatory change reason & full audit log
 */

declare(strict_types=1);

namespace HambakTech\Services;

use HambakTech\Core\Database;
use HambakTech\Core\SchemaSync;
use HambakTech\Core\Security;
use Throwable;

class FulfilmentRouterService
{
    public const VALID_MODES = ['provider_instant', 'provider_async', 'internal_manual'];

    public const INSTANT_REGISTRY_KEYS = [
        'nin_v1', 'nin_v2', 'nin_v3',
        'phone_v1', 'phone_v2', 'phone_v3',
        'demo_v1', 'demo_v2', 'demo_v3',
        'vnin_verification',
        'bvn_v1', 'bvn_v2', 'bvn_v3',
    ];

    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?? Database::getInstance();
    }

    /**
     * Checks whether a given provider row has usable server-side credentials configured.
     */
    public function hasProviderCredentials(string $providerId, ?array $providerRow = null): bool
    {
        $pid = strtolower(trim($providerId));
        if ($pid === '') {
            return false;
        }
        if ($pid === 'hambak_manual') {
            return $providerRow !== null && !empty($providerRow['is_active']);
        }
        if ($pid === '2sureverify') {
            $dbKey = trim((string)($providerRow['api_key'] ?? ''));
            $envKey = trim((string)(getenv('TWOSUREVERIFY_API_KEY') ?: ''));
            if ($dbKey !== '' || $envKey !== '') {
                return true;
            }
            try {
                $cfg = require __DIR__ . '/../config/config.php';
                return trim((string)($cfg['providers']['twosureverify']['api_key'] ?? '')) !== '';
            } catch (Throwable) {
                return false;
            }
        }
        if ($pid === 'veripine') {
            $dbKey = trim((string)($providerRow['api_key'] ?? ''));
            $envKey = trim((string)(getenv('VERIPINE_API_KEY') ?: ''));
            if ($dbKey !== '' || $envKey !== '') {
                return true;
            }
            try {
                $cfg = require __DIR__ . '/../config/config.php';
                return trim((string)($cfg['providers']['veripine']['api_key'] ?? '')) !== '';
            } catch (Throwable) {
                return false;
            }
        }

        if ($providerRow === null) {
            return false;
        }
        return trim((string)($providerRow['api_key'] ?? '')) !== ''
            || trim((string)($providerRow['secret_key'] ?? '')) !== '';
    }

    /**
     * Normalizes raw service_catalogue + provider + mapping metadata into an authoritative route structure.
     */
    public function resolveRoute(string $serviceKey): ?array
    {
        $sk = trim($serviceKey);
        if ($sk === '') {
            return null;
        }

        $row = null;
        try {
            $row = $this->db->fetchOne(
                'SELECT s.*,
                        COALESCE(c.code, "nin_verification") AS category_code,
                        c.name AS category_name,
                        psm.id AS mapping_id,
                        psm.provider_endpoint AS mapping_endpoint,
                        psm.wholesale_cost AS mapping_wholesale_cost,
                        psm.is_active AS mapping_is_active,
                        psm.schema_verified AS mapping_schema_verified,
                        psm.schema_verification_notes AS mapping_schema_notes,
                        p.name AS provider_name,
                        p.provider_type AS provider_type,
                        p.is_active AS provider_is_active,
                        p.api_key AS provider_api_key,
                        p.secret_key AS provider_secret_key,
                        p.base_url AS provider_base_url
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 LEFT JOIN provider_service_mappings psm ON psm.provider_id = s.provider_id AND psm.service_key = s.service_key
                 LEFT JOIN providers p ON p.id = s.provider_id
                 WHERE s.service_key = :sk
                 LIMIT 1',
                ['sk' => $sk]
            );
        } catch (Throwable) {
            $row = $this->db->fetchOne(
                'SELECT s.*,
                        COALESCE(c.code, "nin_verification") AS category_code,
                        c.name AS category_name,
                        p.name AS provider_name,
                        p.provider_type AS provider_type,
                        p.is_active AS provider_is_active,
                        p.api_key AS provider_api_key,
                        p.secret_key AS provider_secret_key,
                        p.base_url AS provider_base_url
                 FROM service_catalogue s
                 LEFT JOIN service_categories c ON c.id = s.category_id
                 LEFT JOIN providers p ON p.id = s.provider_id
                 WHERE s.service_key = :sk
                 LIMIT 1',
                ['sk' => $sk]
            );
        }

        if (!$row) {
            return null;
        }

        $hambakDesk = null;
        try {
            $hambakDesk = $this->db->fetchOne('SELECT id, name, provider_type, is_active FROM providers WHERE id = "hambak_manual" LIMIT 1');
        } catch (Throwable) {
        }

        $providerId = trim((string)($row['provider_id'] ?? '2sureverify'));
        $rawMode = strtolower(trim((string)($row['fulfilment_mode'] ?? '')));
        if (!in_array($rawMode, self::VALID_MODES, true)) {
            if ($providerId === 'hambak_manual') {
                $rawMode = 'internal_manual';
            } elseif (($row['processing_type'] ?? 'instant') === 'manual' || $sk === 'bvn_retrieval') {
                $rawMode = 'provider_async';
            } else {
                $rawMode = 'provider_instant';
            }
        }

        $providerRow = [
            'id' => $providerId,
            'is_active' => $row['provider_is_active'] ?? 0,
            'api_key' => $row['provider_api_key'] ?? '',
            'secret_key' => $row['provider_secret_key'] ?? '',
            'base_url' => $row['provider_base_url'] ?? '',
        ];

        $providerActive = !empty($row['provider_is_active']);
        $providerConfigured = $this->hasProviderCredentials($providerId, $providerRow);
        $hambakDeskActive = $hambakDesk !== null && !empty($hambakDesk['is_active']);

        $schemaVerified = array_key_exists('mapping_schema_verified', $row) && $row['mapping_schema_verified'] !== null
            ? !empty($row['mapping_schema_verified'])
            : !empty($row['provider_schema_verified']);

        $slaHours = isset($row['sla_hours']) && $row['sla_hours'] !== null ? (int)$row['sla_hours'] : null;
        if ($slaHours === null && $rawMode !== 'provider_instant') {
            $slaHours = $sk === 'bvn_retrieval' ? 24 : 72;
        }

        $wholesaleCost = (float)($row['mapping_wholesale_cost'] ?? $row['wholesale_cost'] ?? 0.0);
        $internalCost = (float)($row['internal_fulfilment_cost'] ?? 0.0);
        $sellingPrice = (float)($row['selling_price'] ?? 0.0);

        return [
            'service_id' => (string)$row['id'],
            'service_key' => (string)$row['service_key'],
            'name' => (string)($row['name'] ?? $sk),
            'category_id' => (string)($row['category_id'] ?? ''),
            'category_code' => (string)($row['category_code'] ?? ''),
            'category_name' => (string)($row['category_name'] ?? ''),
            'is_active' => !empty($row['is_active']),
            'is_refundable' => !isset($row['is_refundable']) || !empty($row['is_refundable']),
            'fulfilment_mode' => $rawMode,
            'provider_id' => $providerId,
            'provider_name' => (string)($row['provider_name'] ?? $providerId),
            'provider_type' => (string)($row['provider_type'] ?? 'identity'),
            'endpoint' => trim((string)($row['mapping_endpoint'] ?? $row['endpoint'] ?? '')),
            'selling_price' => $sellingPrice,
            'wholesale_cost' => $wholesaleCost,
            'internal_fulfilment_cost' => $internalCost,
            'sla_hours' => $slaHours,
            'internal_manual_eligible' => !empty($row['internal_manual_eligible']),
            'provider_schema_verified' => $schemaVerified,
            'eligibility_notes' => (string)($row['eligibility_notes'] ?? ''),
            'provider_active' => $providerActive,
            'provider_configured' => $providerConfigured,
            'hambak_manual_active' => $hambakDeskActive,
            'estimated_turnaround' => (string)($row['estimated_turnaround'] ?? ''),
            'routing_initialized_at' => $row['routing_initialized_at'] ?? null,
            'routing_updated_at' => $row['routing_updated_at'] ?? null,
            'routing_updated_by' => $row['routing_updated_by'] ?? null,
            'service_row' => $row,
        ];
    }

    /**
     * Strict fail-closed validation for external provider dispatch.
     * NEVER allows fallback from unconfigured/disabled external provider to internal_manual.
     */
    public function canDispatchExternal(array $route): array
    {
        if (empty($route['is_active'])) {
            return [
                'allowed' => false,
                'code' => 422,
                'reason' => 'Service is disabled in service_catalogue.',
                'customer_message' => 'This service is currently unavailable.',
            ];
        }

        $mode = (string)($route['fulfilment_mode'] ?? '');
        $pid = strtolower(trim((string)($route['provider_id'] ?? '')));

        if ($mode === 'internal_manual' || $pid === 'hambak_manual') {
            return [
                'allowed' => false,
                'code' => 422,
                'reason' => 'Service is routed to internal_manual and must not be dispatched to an external provider.',
                'customer_message' => 'This service uses internal manual fulfilment.',
            ];
        }

        if (!in_array($mode, ['provider_instant', 'provider_async'], true)) {
            return [
                'allowed' => false,
                'code' => 422,
                'reason' => 'Unsupported fulfilment_mode for external dispatch: ' . $mode,
                'customer_message' => 'This service is currently unavailable. Please contact support.',
            ];
        }

        if (empty($route['provider_active'])) {
            return [
                'allowed' => false,
                'code' => 503,
                'reason' => "External provider '{$pid}' is inactive.",
                'customer_message' => 'This service is temporarily unavailable. Please try again later, or contact support on WhatsApp for faster assistance.',
            ];
        }

        if (empty($route['provider_configured'])) {
            return [
                'allowed' => false,
                'code' => 503,
                'reason' => "External provider '{$pid}' is not configured with API credentials.",
                'customer_message' => 'We could not process your request at this time. Please try again later, or contact support on WhatsApp for faster assistance.',
            ];
        }

        if (trim((string)($route['endpoint'] ?? '')) === '') {
            return [
                'allowed' => false,
                'code' => 503,
                'reason' => "No external provider endpoint configured for {$route['service_key']}.",
                'customer_message' => 'This service is temporarily unavailable. Please try again later.',
            ];
        }

        return ['allowed' => true, 'code' => 200, 'reason' => null, 'customer_message' => null];
    }

    /**
     * Strict fail-closed validation for HAMBAK MANUAL fulfilment.
     */
    public function canRouteManual(array $route): array
    {
        if (empty($route['is_active'])) {
            return [
                'allowed' => false,
                'code' => 422,
                'reason' => 'Service is disabled in service_catalogue.',
                'customer_message' => 'This service is currently unavailable.',
            ];
        }

        if (($route['fulfilment_mode'] ?? '') !== 'internal_manual') {
            return [
                'allowed' => false,
                'code' => 422,
                'reason' => 'Service fulfilment_mode is not internal_manual.',
                'customer_message' => 'Invalid fulfilment routing for this request.',
            ];
        }

        if (empty($route['internal_manual_eligible'])) {
            return [
                'allowed' => false,
                'code' => 503,
                'reason' => 'Service is marked internal_manual_eligible = 0 (ineligible for HAMBAK MANUAL).',
                'customer_message' => 'This service is currently unavailable for manual processing. Please try again later or contact support.',
            ];
        }

        if (empty($route['hambak_manual_active'])) {
            return [
                'allowed' => false,
                'code' => 503,
                'reason' => 'HAMBAK Internal Fulfilment Desk provider (hambak_manual) is inactive.',
                'customer_message' => 'This service is currently offline. Please try again later or contact support.',
            ];
        }

        $sla = (int)($route['sla_hours'] ?? 0);
        if ($sla <= 0) {
            return [
                'allowed' => false,
                'code' => 422,
                'reason' => 'Manual service must define a positive sla_hours value.',
                'customer_message' => 'Service turnaround configuration is incomplete. Please contact support.',
            ];
        }

        return ['allowed' => true, 'code' => 200, 'reason' => null, 'customer_message' => null];
    }

    /**
     * Builds the immutable order-creation routing snapshot & SLA fields.
     * Existing orders retain this snapshot permanently even if catalog routing changes later.
     */
    public function buildOrderRoutingMetadata(array $route): array
    {
        $mode = (string)$route['fulfilment_mode'];
        $isManual = ($mode === 'internal_manual');
        $providerId = $isManual ? 'hambak_manual' : (string)$route['provider_id'];
        $slaHours = isset($route['sla_hours']) && (int)$route['sla_hours'] > 0 ? (int)$route['sla_hours'] : null;
        $slaDueAt = null;
        if ($mode !== 'provider_instant' && $slaHours !== null && $slaHours > 0) {
            $slaDueAt = date('Y-m-d H:i:s', time() + ($slaHours * 3600));
        }

        $internalCost = $isManual ? max(0.0, (float)($route['internal_fulfilment_cost'] ?? 0.0)) : 0.0;
        $wholesaleCost = $isManual ? 0.0 : max(0.0, (float)($route['wholesale_cost'] ?? 0.0));

        $snapshot = [
            'service_key' => (string)$route['service_key'],
            'service_name' => (string)$route['name'],
            'fulfilment_mode' => $mode,
            'provider_id' => $providerId,
            'endpoint' => $isManual ? 'internal://hambak-manual' : (string)$route['endpoint'],
            'selling_price' => round((float)($route['selling_price'] ?? 0.0), 2),
            'wholesale_cost' => round($wholesaleCost, 2),
            'internal_fulfilment_cost' => round($internalCost, 2),
            'sla_hours' => $slaHours,
            'sla_due_at' => $slaDueAt,
            'internal_manual_eligible' => !empty($route['internal_manual_eligible']),
            'provider_schema_verified' => !empty($route['provider_schema_verified']),
            'captured_at' => gmdate('c'),
        ];

        return [
            'fulfilment_mode' => $mode,
            'provider_id' => $providerId,
            'endpoint' => $isManual ? 'internal://hambak-manual' : (string)$route['endpoint'],
            'sla_hours' => $slaHours,
            'sla_due_at' => $slaDueAt,
            'internal_fulfilment_cost' => $internalCost,
            'provider_cost_estimate' => $wholesaleCost,
            'routing_snapshot_json' => json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'routing_snapshot' => $snapshot,
        ];
    }

    /**
     * Checks immutable order-level routing provenance (NEVER reads service_catalogue).
     */
    public static function isInternalManualOrder(array $row): bool
    {
        $mode = strtolower(trim((string)($row['fulfilment_mode'] ?? '')));
        if ($mode === 'internal_manual') {
            return true;
        }
        if ($mode === 'provider_instant' || $mode === 'provider_async') {
            return false;
        }

        $snap = self::extractOrderRoutingSnapshot($row);
        if (!empty($snap['fulfilment_mode'])) {
            return strtolower(trim((string)$snap['fulfilment_mode'])) === 'internal_manual';
        }

        $pid = strtolower(trim((string)($row['provider_id'] ?? $row['provider'] ?? '')));
        return $pid === 'hambak_manual';
    }

    public static function extractOrderRoutingSnapshot(array $row): array
    {
        $raw = $row['routing_snapshot'] ?? null;
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return [];
    }

    /**
     * Acquires a 3-minute atomic dispatch lock on an order row to stop concurrent duplicate upstream calls.
     */
    public function acquireDispatchLock(string $table, string $recordId): bool
    {
        if (!in_array($table, ['modification_requests', 'enrolment_orders', 'verification_records'], true)) {
            return false;
        }
        try {
            $affected = $this->db->execute(
                "UPDATE `{$table}`
                 SET dispatch_locked_at = NOW(),
                     dispatch_attempts = COALESCE(dispatch_attempts, 0) + 1
                 WHERE id = :id
                   AND (dispatch_locked_at IS NULL OR dispatch_locked_at < DATE_SUB(NOW(), INTERVAL 3 MINUTE))",
                ['id' => $recordId]
            );
            return $affected > 0;
        } catch (Throwable) {
            return true; // Graceful when pre-Phase-3 column is absent in an unmigrated schema
        }
    }

    public function releaseDispatchLock(string $table, string $recordId, ?string $lastError = null): void
    {
        if (!in_array($table, ['modification_requests', 'enrolment_orders', 'verification_records'], true)) {
            return;
        }
        try {
            $this->db->execute(
                "UPDATE `{$table}`
                 SET dispatch_locked_at = NULL,
                     last_dispatch_error = :err
                 WHERE id = :id",
                [
                    'err' => $lastError !== null && trim($lastError) !== '' ? substr(trim($lastError), 0, 1000) : null,
                    'id' => $recordId,
                ]
            );
        } catch (Throwable) {
        }
    }

    /**
     * Lists all catalog services with full Phase 2/3 routing, schema verification, cost & SLA details.
     */
    public function listServicesWithRouting(): array
    {
        $hambakDesk = null;
        $providers = [];
        try {
            $provRows = $this->db->fetchAll('SELECT id, name, provider_type, is_active, is_default, base_url, api_key, secret_key FROM providers ORDER BY name ASC');
            foreach ($provRows as $pr) {
                $pid = strtolower((string)$pr['id']);
                if ($pid === 'hambak_manual') {
                    $hambakDesk = $pr;
                }
                $providers[] = [
                    'id' => (string)$pr['id'],
                    'name' => (string)$pr['name'],
                    'provider_type' => (string)($pr['provider_type'] ?? 'identity'),
                    'is_active' => !empty($pr['is_active']),
                    'is_default' => !empty($pr['is_default']),
                    'is_configured' => $this->hasProviderCredentials($pid, $pr),
                ];
            }
        } catch (Throwable) {
        }

        $rows = $this->db->fetchAll(
            'SELECT s.id, s.category_id, s.service_key, s.service_key AS `key`, s.name, s.description,
                    s.selling_price, s.selling_price AS price, s.wholesale_cost,
                    s.provider_id, s.provider_id AS provider, s.endpoint, s.is_active,
                    s.processing_type, s.manual_label, s.estimated_turnaround, s.is_refundable,
                    s.fulfilment_mode, s.internal_fulfilment_cost, s.sla_hours,
                    s.internal_manual_eligible, s.provider_schema_verified, s.eligibility_notes,
                    s.routing_initialized_at, s.routing_updated_at, s.routing_updated_by,
                    COALESCE(c.code, "nin_verification") AS category_code,
                    COALESCE(c.name, "Identity Services") AS category_name,
                    psm.schema_verified AS mapping_schema_verified,
                    psm.schema_verification_notes AS mapping_schema_notes,
                    p.name AS provider_name,
                    p.is_active AS provider_is_active
             FROM service_catalogue s
             LEFT JOIN service_categories c ON c.id = s.category_id
             LEFT JOIN provider_service_mappings psm ON psm.provider_id = s.provider_id AND psm.service_key = s.service_key
             LEFT JOIN providers p ON p.id = s.provider_id
             ORDER BY c.display_order ASC, s.name ASC'
        );

        foreach ($rows as &$r) {
            $mode = strtolower(trim((string)($r['fulfilment_mode'] ?? '')));
            if (!in_array($mode, self::VALID_MODES, true)) {
                $mode = (($r['provider_id'] ?? '') === 'hambak_manual')
                    ? 'internal_manual'
                    : (($r['processing_type'] ?? 'instant') === 'manual' ? 'provider_async' : 'provider_instant');
            }
            $r['fulfilment_mode'] = $mode;
            $r['price'] = (float)$r['price'];
            $r['selling_price'] = (float)$r['selling_price'];
            $r['wholesale_cost'] = (float)$r['wholesale_cost'];
            $r['internal_fulfilment_cost'] = (float)($r['internal_fulfilment_cost'] ?? 0);
            $r['sla_hours'] = $r['sla_hours'] !== null ? (int)$r['sla_hours'] : null;
            $r['is_active'] = !empty($r['is_active']);
            $r['enabled'] = $r['is_active'];
            $r['is_refundable'] = !isset($r['is_refundable']) || !empty($r['is_refundable']);
            $r['internal_manual_eligible'] = !empty($r['internal_manual_eligible']);
            $r['provider_schema_verified'] = $r['mapping_schema_verified'] !== null
                ? !empty($r['mapping_schema_verified'])
                : !empty($r['provider_schema_verified']);
            $r['provider_is_active'] = !empty($r['provider_is_active']);
            $r['is_instant_registry_sku'] = in_array((string)$r['service_key'], self::INSTANT_REGISTRY_KEYS, true);
            $r['category'] = (string)$r['category_code'];

            $activeCost = $mode === 'internal_manual' ? $r['internal_fulfilment_cost'] : $r['wholesale_cost'];
            $margin = $r['selling_price'] - $activeCost;
            $r['active_cost'] = round($activeCost, 2);
            $r['profit_per_transaction'] = round($margin, 2);
            $r['margin_percent'] = $r['selling_price'] > 0 ? (int)round(($margin / $r['selling_price']) * 100) : 0;
        }
        unset($r);

        return [
            'services' => $rows,
            'providers' => $providers,
            'hambak_manual_active' => $hambakDesk !== null && !empty($hambakDesk['is_active']),
        ];
    }

    /**
     * Validates and applies a routing configuration change for a single SKU, writing
     * an immutable entry to service_routing_audit_logs + audit_logs.
     */
    public function updateServiceRouting(string $serviceKey, array $payload, array $actor, string $ipAddress): array
    {
        $sk = trim($serviceKey);
        if ($sk === '') {
            return ['ok' => false, 'code' => 422, 'message' => 'Service key is required.'];
        }

        $reason = trim((string)($payload['reason'] ?? ''));
        if (strlen($reason) < 5) {
            return ['ok' => false, 'code' => 422, 'message' => 'A mandatory change reason (minimum 5 characters) is required for every routing change.'];
        }

        $current = $this->resolveRoute($sk);
        if (!$current) {
            return ['ok' => false, 'code' => 404, 'message' => "Service '{$sk}' not found."];
        }

        $targetMode = strtolower(trim((string)($payload['fulfilment_mode'] ?? $current['fulfilment_mode'])));
        if (!in_array($targetMode, self::VALID_MODES, true)) {
            return ['ok' => false, 'code' => 422, 'message' => "Invalid fulfilment_mode '{$targetMode}'."];
        }

        $isInstantLookup = in_array($sk, self::INSTANT_REGISTRY_KEYS, true);
        $targetEligible = array_key_exists('internal_manual_eligible', $payload)
            ? !empty($payload['internal_manual_eligible'])
            : (bool)$current['internal_manual_eligible'];

        if ($isInstantLookup && $targetEligible) {
            return [
                'ok' => false,
                'code' => 422,
                'message' => "Real-time NIN/BVN registry verification SKU '{$sk}' cannot be marked eligible for HAMBAK MANUAL.",
            ];
        }

        if ($isInstantLookup && $targetMode === 'internal_manual') {
            return [
                'ok' => false,
                'code' => 422,
                'message' => "Real-time NIN/BVN registry verification SKU '{$sk}' cannot use internal_manual fulfilment.",
            ];
        }

        if ($targetMode === 'internal_manual') {
            if (!$targetEligible) {
                return [
                    'ok' => false,
                    'code' => 422,
                    'message' => "Service '{$sk}' is not authorized for HAMBAK MANUAL (internal_manual_eligible is disabled).",
                ];
            }
            if (empty($current['hambak_manual_active'])) {
                return [
                    'ok' => false,
                    'code' => 422,
                    'message' => 'HAMBAK Internal Fulfilment Desk (hambak_manual) must be active in Providers before switching any service to internal_manual.',
                ];
            }
        }

        $targetProvider = trim((string)($payload['provider_id'] ?? $current['provider_id']));
        if ($targetMode === 'internal_manual') {
            $targetProvider = 'hambak_manual';
        } elseif ($targetProvider === '' || $targetProvider === 'hambak_manual') {
            $targetProvider = '2sureverify';
        }

        // Verify target external provider exists and has usable configuration before activating
        $providerRow = $this->db->fetchOne('SELECT id, name, is_active, api_key, secret_key FROM providers WHERE id = :pid LIMIT 1', ['pid' => $targetProvider]);
        if (!$providerRow) {
            return ['ok' => false, 'code' => 422, 'message' => "Provider '{$targetProvider}' does not exist."];
        }
        if ($targetMode !== 'internal_manual' && (empty($providerRow['is_active']) || !$this->hasProviderCredentials($targetProvider, $providerRow))) {
            return [
                'ok' => false,
                'code' => 422,
                'message' => "Provider '{$targetProvider}' is inactive or missing server credentials and cannot be assigned for automated dispatch.",
            ];
        }

        $targetSchemaVerified = array_key_exists('provider_schema_verified', $payload)
            ? !empty($payload['provider_schema_verified'])
            : (bool)$current['provider_schema_verified'];

        if (isset($payload['provider_id']) && $targetProvider !== $current['provider_id'] && $targetMode !== 'internal_manual') {
            // Re-check mapping schema verification for the newly selected external provider
            try {
                $psmRow = $this->db->fetchOne(
                    'SELECT schema_verified FROM provider_service_mappings WHERE provider_id = :pid AND service_key = :sk LIMIT 1',
                    ['pid' => $targetProvider, 'sk' => $sk]
                );
                if (!array_key_exists('provider_schema_verified', $payload)) {
                    $targetSchemaVerified = $psmRow ? !empty($psmRow['schema_verified']) : false;
                }
            } catch (Throwable) {
            }
        }

        $targetWholesale = array_key_exists('wholesale_cost', $payload)
            ? max(0.0, (float)$payload['wholesale_cost'])
            : (float)$current['wholesale_cost'];
        $targetInternalCost = array_key_exists('internal_fulfilment_cost', $payload)
            ? max(0.0, (float)$payload['internal_fulfilment_cost'])
            : (float)$current['internal_fulfilment_cost'];
        $targetSelling = array_key_exists('selling_price', $payload)
            ? max(0.0, (float)$payload['selling_price'])
            : (float)$current['selling_price'];

        if ($targetMode === 'internal_manual' && $targetSelling < $targetInternalCost) {
            return [
                'ok' => false,
                'code' => 422,
                'message' => 'Customer selling price cannot be lower than internal fulfilment cost.',
            ];
        }
        if ($targetMode !== 'internal_manual' && $targetSelling < $targetWholesale) {
            return [
                'ok' => false,
                'code' => 422,
                'message' => 'Customer selling price cannot be lower than external provider wholesale cost.',
            ];
        }

        $targetSla = array_key_exists('sla_hours', $payload)
            ? ($payload['sla_hours'] === null || $payload['sla_hours'] === '' ? null : (int)$payload['sla_hours'])
            : $current['sla_hours'];
        if ($targetMode === 'internal_manual' && ($targetSla === null || $targetSla <= 0)) {
            $targetSla = 72;
        } elseif ($targetMode === 'provider_async' && ($targetSla === null || $targetSla <= 0)) {
            $targetSla = $sk === 'bvn_retrieval' ? 24 : 72;
        } elseif ($targetMode === 'provider_instant') {
            $targetSla = null;
        }

        $targetProcessingType = $targetMode === 'provider_instant' ? 'instant' : 'manual';
        $targetManualLabel = trim((string)($payload['manual_label'] ?? ($targetMode === 'internal_manual' ? 'Manual Processing' : ($targetMode === 'provider_async' ? 'Provider Async Processing' : 'Instant Registry'))));
        $targetNotes = array_key_exists('eligibility_notes', $payload)
            ? trim((string)$payload['eligibility_notes'])
            : (string)$current['eligibility_notes'];
        $targetActive = array_key_exists('is_active', $payload)
            ? (!empty($payload['is_active']) ? 1 : 0)
            : (!empty($current['is_active']) ? 1 : 0);

        $this->db->withTransaction(function () use (
            $sk,
            $current,
            $targetMode,
            $targetProvider,
            $targetEligible,
            $targetSchemaVerified,
            $targetWholesale,
            $targetInternalCost,
            $targetSelling,
            $targetSla,
            $targetProcessingType,
            $targetManualLabel,
            $targetNotes,
            $targetActive,
            $reason,
            $actor,
            $ipAddress
        ): void {
            $this->db->execute(
                'UPDATE service_catalogue
                 SET fulfilment_mode = :mode,
                     provider_id = :pid,
                     processing_type = :pt,
                     manual_label = :ml,
                     internal_manual_eligible = :ime,
                     provider_schema_verified = :psv,
                     wholesale_cost = :wc,
                     internal_fulfilment_cost = :ifc,
                     selling_price = :sp,
                     sla_hours = :sla,
                     eligibility_notes = :notes,
                     is_active = :act,
                     routing_updated_at = NOW(),
                     routing_updated_by = :uid,
                     updated_at = NOW()
                 WHERE service_key = :sk',
                [
                    'mode' => $targetMode,
                    'pid' => $targetProvider,
                    'pt' => $targetProcessingType,
                    'ml' => $targetManualLabel,
                    'ime' => $targetEligible ? 1 : 0,
                    'psv' => $targetSchemaVerified ? 1 : 0,
                    'wc' => $targetWholesale,
                    'ifc' => $targetInternalCost,
                    'sp' => $targetSelling,
                    'sla' => $targetSla,
                    'notes' => $targetNotes,
                    'act' => $targetActive,
                    'uid' => $actor['id'] ?? null,
                    'sk' => $sk,
                ]
            );

            // Only external providers belong in provider_service_mappings; remove any internal_manual/hambak_manual entries
            if ($targetMode !== 'internal_manual' && strtolower($targetProvider) !== 'hambak_manual') {
                SchemaSync::syncProviderServiceMapping($this->db, $targetProvider, $sk, (string)$current['endpoint'], $targetWholesale, $targetActive);
                try {
                    $this->db->execute(
                        'UPDATE provider_service_mappings
                         SET schema_verified = :sv,
                             schema_verified_at = CASE WHEN :sv2 = 1 THEN COALESCE(schema_verified_at, NOW()) ELSE NULL END,
                             schema_verified_by = CASE WHEN :sv3 = 1 THEN COALESCE(schema_verified_by, :uid) ELSE NULL END
                         WHERE provider_id = :pid AND service_key = :sk',
                        [
                            'sv' => $targetSchemaVerified ? 1 : 0,
                            'sv2' => $targetSchemaVerified ? 1 : 0,
                            'sv3' => $targetSchemaVerified ? 1 : 0,
                            'uid' => $actor['id'] ?? null,
                            'pid' => $targetProvider,
                            'sk' => $sk,
                        ]
                    );
                } catch (Throwable) {
                }
            } else {
                try {
                    $this->db->execute(
                        'DELETE FROM provider_service_mappings WHERE LOWER(COALESCE(provider_id, "")) IN ("hambak_manual", "internal_manual") AND service_key = :sk',
                        ['sk' => $sk]
                    );
                    $this->db->execute(
                        'UPDATE provider_service_mappings SET is_active = 0 WHERE service_key = :sk',
                        ['sk' => $sk]
                    );
                } catch (Throwable) {
                }
            }

            $this->db->execute(
                'INSERT INTO service_routing_audit_logs
                 (id, service_id, service_key, previous_mode, new_mode, previous_provider_id, new_provider_id,
                  previous_internal_eligible, new_internal_eligible, previous_schema_verified, new_schema_verified,
                  previous_wholesale_cost, new_wholesale_cost, previous_internal_cost, new_internal_cost,
                  previous_sla_hours, new_sla_hours, reason, actor_user_id, actor_email, actor_name, actor_role, ip_address, created_at)
                 VALUES
                 (:id, :sid, :sk, :pm, :nm, :pp, :np, :pie, :nie, :psv, :nsv, :pwc, :nwc, :pic, :nic, :psla, :nsla, :rsn, :uid, :uem, :unm, :url, :ip, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'sid' => $current['service_id'],
                    'sk' => $sk,
                    'pm' => $current['fulfilment_mode'],
                    'nm' => $targetMode,
                    'pp' => $current['provider_id'],
                    'np' => $targetProvider,
                    'pie' => !empty($current['internal_manual_eligible']) ? 1 : 0,
                    'nie' => $targetEligible ? 1 : 0,
                    'psv' => !empty($current['provider_schema_verified']) ? 1 : 0,
                    'nsv' => $targetSchemaVerified ? 1 : 0,
                    'pwc' => $current['wholesale_cost'],
                    'nwc' => $targetWholesale,
                    'pic' => $current['internal_fulfilment_cost'],
                    'nic' => $targetInternalCost,
                    'psla' => $current['sla_hours'],
                    'nsla' => $targetSla,
                    'rsn' => $reason,
                    'uid' => $actor['id'] ?? null,
                    'uem' => $actor['email'] ?? null,
                    'unm' => $actor['full_name'] ?? null,
                    'url' => $actor['role'] ?? null,
                    'ip' => substr($ipAddress, 0, 45),
                ]
            );
        });

        try {
            $this->db->execute(
                'INSERT INTO audit_logs (id, user_id, action, ip_address, details) VALUES (:id, :uid, :act, :ip, :det)',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $actor['id'] ?? null,
                    'act' => 'ADMIN_SERVICE_ROUTING_UPDATED',
                    'ip' => substr($ipAddress, 0, 45),
                    'det' => json_encode([
                        'service_key' => $sk,
                        'previous_mode' => $current['fulfilment_mode'],
                        'new_mode' => $targetMode,
                        'previous_provider' => $current['provider_id'],
                        'new_provider' => $targetProvider,
                        'reason' => $reason,
                    ]),
                ]
            );
        } catch (Throwable) {
        }

        return [
            'ok' => true,
            'code' => 200,
            'message' => "Routing configuration updated for '{$current['name']}'.",
            'service' => $this->resolveRoute($sk),
        ];
    }

    public function listRoutingAuditLogs(array $filters = []): array
    {
        $limit = max(1, min(200, (int)($filters['limit'] ?? 60)));
        $serviceKey = trim((string)($filters['service_key'] ?? ''));
        $sql = 'SELECT * FROM service_routing_audit_logs WHERE 1=1';
        $params = [];
        if ($serviceKey !== '') {
            $sql .= ' AND service_key = :sk';
            $params['sk'] = $serviceKey;
        }
        $sql .= ' ORDER BY created_at DESC LIMIT ' . $limit;
        try {
            $rows = $this->db->fetchAll($sql, $params);
            foreach ($rows as &$r) {
                $r['previous_internal_eligible'] = !empty($r['previous_internal_eligible']);
                $r['new_internal_eligible'] = !empty($r['new_internal_eligible']);
                $r['previous_schema_verified'] = !empty($r['previous_schema_verified']);
                $r['new_schema_verified'] = !empty($r['new_schema_verified']);
                $r['previous_wholesale_cost'] = $r['previous_wholesale_cost'] !== null ? (float)$r['previous_wholesale_cost'] : null;
                $r['new_wholesale_cost'] = $r['new_wholesale_cost'] !== null ? (float)$r['new_wholesale_cost'] : null;
                $r['previous_internal_cost'] = $r['previous_internal_cost'] !== null ? (float)$r['previous_internal_cost'] : null;
                $r['new_internal_cost'] = $r['new_internal_cost'] !== null ? (float)$r['new_internal_cost'] : null;
                $r['previous_sla_hours'] = $r['previous_sla_hours'] !== null ? (int)$r['previous_sla_hours'] : null;
                $r['new_sla_hours'] = $r['new_sla_hours'] !== null ? (int)$r['new_sla_hours'] : null;
            }
            unset($r);
            return $rows;
        } catch (Throwable) {
            return [];
        }
    }
}
