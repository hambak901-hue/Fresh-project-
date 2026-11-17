<?php
/**
 * @file PrintingService.php
 * Production Business Logic, Pricing Engine, Confidentiality Guard & Notifications
 * for HAMBAK TECH & SERVICES — Printing & Document Services Module.
 */

declare(strict_types=1);

namespace HambakTech\Services;

use Throwable;
use RuntimeException;
use HambakTech\Core\Database;
use HambakTech\Core\Security;
use HambakTech\Core\SchemaSync;

class PrintingService
{
    public const ORDER_STATUSES = [
        'Pending Review',
        'Under Review',
        'Awaiting Quotation',
        'Quotation Sent',
        'Awaiting Payment',
        'Payment Confirmed',
        'Processing',
        'On Hold',
        'Ready for Collection',
        'Ready for Dispatch',
        'Out for Delivery',
        'Completed',
        'Rejected',
        'Cancelled',
        'Refunded',
    ];

    private Database $db;

    public function __construct(?Database $db = null)
    {
        $this->db = $db ?: Database::getInstance();
        SchemaSync::syncPrintingModuleSchema($this->db);
    }

    public function getSettings(): array
    {
        $defaults = [
            'office_collection_title' => 'HambakTech Main Office Collection Centre',
            'office_collection_address' => 'HambakTech Services Hub, Sangotedo / Ajah Corridor, Lagos State, Nigeria',
            'office_collection_hours' => 'Monday – Saturday, 8:30 AM – 6:00 PM',
            'printing_support_phone' => '09127469686',
            'printing_support_whatsapp' => '09155104724',
            'printing_support_email' => 'support@hambaktech.com.ng',
            'allow_deposit_default' => false,
            'default_deposit_percent' => 50.0,
            'max_upload_mb' => 15,
            'allowed_file_types' => ['PDF', 'DOC', 'DOCX', 'JPG', 'JPEG', 'PNG', 'WEBP', 'TIFF', 'CDR', 'AI', 'PSD', 'ZIP'],
            'collection_notice' => 'Office collection is free (₦0 delivery fee). Wait for your "Ready for Collection" alert before coming.',
            'delivery_notice' => 'Paid delivery is available across Lagos LGAs & LCDAs. Delivery charges are billed separately from printing charges.',
        ];

        try {
            $row = $this->db->fetchOne('SELECT setting_value FROM system_settings WHERE setting_key = "printing_settings" LIMIT 1');
            if ($row && !empty($row['setting_value'])) {
                $decoded = json_decode((string)$row['setting_value'], true);
                if (is_array($decoded)) {
                    $defaults = array_merge($defaults, $decoded);
                }
            }
        } catch (Throwable) {
        }

        return $defaults;
    }

    public function saveSettings(array $input): array
    {
        $current = $this->getSettings();
        $allowedKeys = array_keys($current);
        foreach ($allowedKeys as $k) {
            if (array_key_exists($k, $input)) {
                $current[$k] = $input[$k];
            }
        }
        $current['default_deposit_percent'] = max(10, min(90, (float)($current['default_deposit_percent'] ?? 50)));
        $current['max_upload_mb'] = max(2, min(50, (int)($current['max_upload_mb'] ?? 15)));

        $json = json_encode($current, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $this->db->execute(
            'INSERT INTO system_settings (id, setting_key, setting_value, category, description, updated_at)
             VALUES (:id, "printing_settings", :val, "printing", "Printing & Document Services Settings", NOW())
             ON DUPLICATE KEY UPDATE setting_value = :val2, updated_at = NOW()',
            [
                'id' => Security::generateUuid(),
                'val' => $json,
                'val2' => $json,
            ]
        );

        return $current;
    }

    public function decodeCategory(array $row, bool $includeInternal = false): array
    {
        $jsonFields = ['paper_sizes', 'size_rates', 'finishing_options', 'bulk_discounts', 'field_schema'];
        foreach ($jsonFields as $f) {
            if (isset($row[$f]) && is_string($row[$f])) {
                $row[$f] = json_decode($row[$f], true) ?: [];
            } elseif (!isset($row[$f]) || $row[$f] === null) {
                $row[$f] = [];
            }
        }
        $row['base_rate'] = (float)($row['base_rate'] ?? 0);
        $row['bw_rate'] = (float)($row['bw_rate'] ?? 0);
        $row['color_rate'] = (float)($row['color_rate'] ?? 0);
        $row['min_quantity'] = max(1, (int)($row['min_quantity'] ?? 1));
        $row['urgent_fee_value'] = (float)($row['urgent_fee_value'] ?? 0);
        $row['requires_manual_quote'] = (bool)($row['requires_manual_quote'] ?? true);
        $row['is_active'] = (bool)($row['is_active'] ?? true);
        $row['display_order'] = (int)($row['display_order'] ?? 1);

        if ($includeInternal) {
            $row['internal_cost_estimate'] = (float)($row['internal_cost_estimate'] ?? 0);
        } else {
            unset($row['internal_cost_estimate']);
        }
        return $row;
    }

    public function decodeZone(array $row): array
    {
        $row['fixed_fee'] = (float)($row['fixed_fee'] ?? 0);
        $row['free_delivery_enabled'] = (bool)($row['free_delivery_enabled'] ?? false);
        $row['free_delivery_min_order'] = (float)($row['free_delivery_min_order'] ?? 0);
        $row['is_active'] = (bool)($row['is_active'] ?? true);
        $row['display_order'] = (int)($row['display_order'] ?? 1);
        return $row;
    }

    /**
     * Server-authoritative printing & delivery estimator.
     * Supports per-page, B&W vs Colour, photocopying, configurable banner per-foot basis,
     * per-card, photo rates, size multipliers, bulk discounts, finishing & urgent surcharges,
     * and separate delivery fees.
     */
    public function calculateEstimate(array $category, array $input, ?array $zone = null): array
    {
        $cat = isset($category['paper_sizes']) && is_string($category['paper_sizes'])
            ? $this->decodeCategory($category, false)
            : $category;

        $quantity = max(1, (int)($input['quantity'] ?? 1));
        $minQty = max(1, (int)($cat['min_quantity'] ?? 1));
        if ($quantity < $minQty) {
            throw new RuntimeException("Minimum quantity for {$cat['name']} is {$minQty}.");
        }

        $colorMode = strtolower(trim((string)($input['color_mode'] ?? 'bw')));
        if (!in_array($colorMode, ['bw', 'color', 'mixed', 'full_color'], true)) {
            $colorMode = 'bw';
        }

        $unitRate = $colorMode === 'bw'
            ? (float)($cat['bw_rate'] > 0 ? $cat['bw_rate'] : $cat['base_rate'])
            : (float)($cat['color_rate'] > 0 ? $cat['color_rate'] : $cat['base_rate']);

        $paperSize = trim((string)($input['paper_size'] ?? ''));
        $sizeRates = is_array($cat['size_rates'] ?? null) ? $cat['size_rates'] : [];
        $sizeMultiplier = ($paperSize !== '' && isset($sizeRates[$paperSize]))
            ? max(0.1, (float)$sizeRates[$paperSize])
            : 1.0;

        $method = (string)($cat['measurement_method'] ?? 'per_page');
        $widthFt = max(0.0, (float)($input['width_ft'] ?? 0));
        $heightFt = max(0.0, (float)($input['height_ft'] ?? 0));
        $pageCount = max(1, (int)($input['page_count'] ?? 1));

        $sqFt = 0.0;
        $linearFt = 0.0;
        $effectiveUnits = (float)$quantity;
        $manualQuoteRequired = (bool)($cat['requires_manual_quote'] ?? true);

        if ($method === 'per_sq_ft') {
            $w = $widthFt > 0 ? $widthFt : 1.0;
            $h = $heightFt > 0 ? $heightFt : 1.0;
            $sqFt = round($w * $h, 2);
            $effectiveUnits = $sqFt * $quantity;
        } elseif ($method === 'per_linear_ft') {
            $linearFt = max(1.0, max($widthFt, $heightFt));
            $sqFt = $widthFt > 0 && $heightFt > 0 ? round($widthFt * $heightFt, 2) : $linearFt;
            $effectiveUnits = $linearFt * $quantity;
        } elseif (in_array($method, ['per_page', 'per_copy'], true)) {
            $effectiveUnits = (float)($pageCount * $quantity);
        } elseif ($method === 'manual' || ($cat['pricing_mode'] ?? '') === 'custom_quote') {
            $effectiveUnits = (float)$quantity;
            $unitRate = 0.0;
            $manualQuoteRequired = true;
        }

        $grossPrintingCharge = round($effectiveUnits * $unitRate * $sizeMultiplier, 2);

        // Bulk discount evaluation (highest eligible discount tier)
        $bulkPercent = 0.0;
        $bulkLabel = null;
        $tiers = is_array($cat['bulk_discounts'] ?? null) ? $cat['bulk_discounts'] : [];
        foreach ($tiers as $tier) {
            $tierMin = (int)($tier['min_qty'] ?? 0);
            $tierPct = (float)($tier['discount_percent'] ?? 0);
            if ($tierMin > 0 && $effectiveUnits >= $tierMin && $tierPct > $bulkPercent) {
                $bulkPercent = $tierPct;
                $bulkLabel = $tier['label'] ?? "{$tierMin}+ units: {$tierPct}% off";
            }
        }

        $discountAmount = round($grossPrintingCharge * ($bulkPercent / 100), 2);
        $printingCharge = max(0.0, round($grossPrintingCharge - $discountAmount, 2));

        // Finishing charges
        $finishingCharge = 0.0;
        $selectedCodes = is_array($input['finishing_requirements'] ?? null) ? $input['finishing_requirements'] : [];
        $finOptions = is_array($cat['finishing_options'] ?? null) ? $cat['finishing_options'] : [];
        $matchedFinishing = [];
        foreach ($finOptions as $opt) {
            $code = (string)($opt['code'] ?? '');
            if ($code !== '' && in_array($code, $selectedCodes, true)) {
                $fee = (float)($opt['fee'] ?? 0);
                $finishingCharge += $fee;
                $matchedFinishing[] = [
                    'code' => $code,
                    'label' => (string)($opt['label'] ?? $code),
                    'fee' => $fee,
                ];
            }
        }
        $finishingCharge = round($finishingCharge, 2);

        // Urgent charge
        $isUrgent = !empty($input['is_urgent']);
        $urgentCharge = 0.0;
        if ($isUrgent && $grossPrintingCharge > 0) {
            $uType = (string)($cat['urgent_fee_type'] ?? 'percent');
            $uVal = (float)($cat['urgent_fee_value'] ?? 0);
            $urgentCharge = $uType === 'flat'
                ? round($uVal, 2)
                : round(($printingCharge + $finishingCharge) * ($uVal / 100), 2);
        }

        $printingSubtotal = round($printingCharge + $finishingCharge + $urgentCharge, 2);

        // Separate Collection vs Delivery charge
        $collectionMethod = ($input['collection_method'] ?? 'office_collection') === 'paid_delivery'
            ? 'paid_delivery'
            : 'office_collection';

        $deliveryCharge = 0.0;
        $deliveryManualQuote = false;
        $freeDeliveryQualified = false;
        if ($collectionMethod === 'paid_delivery') {
            if ($zone) {
                $zMode = (string)($zone['pricing_mode'] ?? 'fixed');
                if ($zMode === 'free') {
                    $deliveryCharge = 0.0;
                    $freeDeliveryQualified = true;
                } elseif ($zMode === 'manual_quote') {
                    $deliveryCharge = 0.0;
                    $deliveryManualQuote = true;
                } else {
                    $deliveryCharge = (float)($zone['fixed_fee'] ?? 0);
                    $freeMin = (float)($zone['free_delivery_min_order'] ?? 0);
                    if (!empty($zone['free_delivery_enabled']) && $freeMin > 0 && $printingSubtotal >= $freeMin) {
                        $deliveryCharge = 0.0;
                        $freeDeliveryQualified = true;
                    }
                }
            } else {
                $deliveryManualQuote = true;
            }
        }

        $totalEstimate = round($printingSubtotal + $deliveryCharge, 2);

        return [
            'category_key' => $cat['category_key'] ?? '',
            'category_name' => $cat['name'] ?? '',
            'measurement_method' => $method,
            'unit_label' => $cat['unit_label'] ?? 'unit',
            'quantity' => $quantity,
            'page_count' => $pageCount,
            'width_ft' => $widthFt,
            'height_ft' => $heightFt,
            'sq_ft' => $sqFt,
            'linear_ft' => $linearFt,
            'effective_units' => round($effectiveUnits, 2),
            'unit_rate' => $unitRate,
            'size_multiplier' => $sizeMultiplier,
            'gross_printing_charge' => $grossPrintingCharge,
            'discount_percent' => $bulkPercent,
            'discount_label' => $bulkLabel,
            'discount_amount' => $discountAmount,
            'printing_charge' => $printingCharge,
            'finishing_items' => $matchedFinishing,
            'finishing_charge' => $finishingCharge,
            'is_urgent' => $isUrgent,
            'urgent_charge' => $urgentCharge,
            'printing_subtotal' => $printingSubtotal,
            'collection_method' => $collectionMethod,
            'delivery_charge' => $deliveryCharge,
            'delivery_manual_quote' => $deliveryManualQuote,
            'free_delivery_qualified' => $freeDeliveryQualified,
            'total_estimate' => $totalEstimate,
            'manual_quote_required' => $manualQuoteRequired,
        ];
    }

    public function sanitizeOrderForCustomer(array $order): array
    {
        $jsonCols = ['specs', 'uploaded_files', 'finishing_requirements'];
        foreach ($jsonCols as $c) {
            if (isset($order[$c]) && is_string($order[$c])) {
                $order[$c] = json_decode($order[$c], true) ?: [];
            } elseif (!isset($order[$c]) || $order[$c] === null) {
                $order[$c] = [];
            }
        }

        $floatCols = [
            'width_ft', 'height_ft', 'sq_ft',
            'estimated_printing_charge', 'printing_charge', 'finishing_charge',
            'urgent_charge', 'discount_amount', 'delivery_charge', 'total_amount',
            'deposit_percent', 'deposit_amount', 'required_initial_payment',
            'amount_paid', 'balance_due',
        ];
        foreach ($floatCols as $fc) {
            if (array_key_exists($fc, $order) && $order[$fc] !== null) {
                $order[$fc] = (float)$order[$fc];
            }
        }
        $order['quantity'] = (int)($order['quantity'] ?? 1);
        $order['is_urgent'] = (bool)($order['is_urgent'] ?? false);
        $order['deposit_enabled'] = (bool)($order['deposit_enabled'] ?? false);
        $order['free_delivery_authorized'] = (bool)($order['free_delivery_authorized'] ?? false);
        $order['dispatch_confirmed'] = (bool)($order['dispatch_confirmed'] ?? false);

        // STRICT PRIVACY: never expose internal production cost, margins, or private staff notes to customer
        unset(
            $order['internal_production_cost'],
            $order['internal_notes'],
            $order['profit'],
            $order['margin']
        );

        return $order;
    }

    public function formatOrderForAdmin(array $order): array
    {
        $clean = $this->sanitizeOrderForCustomer($order);
        $clean['internal_production_cost'] = (float)($order['internal_production_cost'] ?? 0);
        $clean['internal_notes'] = (string)($order['internal_notes'] ?? '');
        $clean['estimated_margin'] = round((float)$clean['total_amount'] - $clean['internal_production_cost'], 2);
        return $clean;
    }

    public function recordStatusHistory(
        string $orderId,
        ?string $fromStatus,
        string $toStatus,
        array $actor,
        string $note = '',
        ?array $metadata = null
    ): void {
        $this->db->execute(
            'INSERT INTO printing_order_status_history
             (id, order_id, from_status, to_status, actor_id, actor_name, actor_role, note, metadata, created_at)
             VALUES (:id, :oid, :fs, :ts, :aid, :aname, :arole, :note, :meta, NOW())',
            [
                'id' => Security::generateUuid(),
                'oid' => $orderId,
                'fs' => $fromStatus,
                'ts' => $toStatus,
                'aid' => $actor['id'] ?? null,
                'aname' => (string)($actor['full_name'] ?? $actor['email'] ?? 'System'),
                'arole' => (string)($actor['role'] ?? 'system'),
                'note' => $note !== '' ? $note : null,
                'meta' => $metadata ? json_encode($metadata) : null,
            ]
        );
    }

    /**
     * Reuses notifications, customer_messages, and MailService to notify customer (and optionally staff).
     */
    public function notifyCustomerLifecycle(
        array $order,
        string $title,
        string $message,
        string $type = 'info',
        bool $sendEmail = true
    ): void {
        $userId = (string)($order['user_id'] ?? '');
        $ref = (string)($order['order_reference'] ?? '');
        if ($userId === '') {
            return;
        }

        $actionLink = '#printing?order=' . urlencode($ref);

        try {
            $this->db->execute(
                'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                 VALUES (:id, :uid, :title, :msg, :type, 0, :link, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'title' => $title,
                    'msg' => "[{$ref}] {$message}",
                    'type' => in_array($type, ['info', 'success', 'warning', 'alert', 'security'], true) ? $type : 'info',
                    'link' => $actionLink,
                ]
            );
        } catch (Throwable) {
        }

        try {
            $this->db->execute(
                'INSERT INTO customer_messages (id, user_id, title, category, body, is_read, reference, action_label, action_link, created_at)
                 VALUES (:id, :uid, :title, "service", :body, 0, :ref, "View Order", :link, NOW())',
                [
                    'id' => Security::generateUuid(),
                    'uid' => $userId,
                    'title' => "{$title} ({$ref})",
                    'body' => $message,
                    'ref' => $ref,
                    'link' => $actionLink,
                ]
            );
        } catch (Throwable) {
        }

        if ($sendEmail && !empty($order['customer_email'])) {
            try {
                $mailer = new MailService();
                $safeName = htmlspecialchars((string)($order['customer_name'] ?? 'Customer'), ENT_QUOTES, 'UTF-8');
                $safeRef = htmlspecialchars($ref, ENT_QUOTES, 'UTF-8');
                $safeMsg = nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
                $safeStatus = htmlspecialchars((string)($order['status'] ?? ''), ENT_QUOTES, 'UTF-8');
                $html = "
                <div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;'>
                  <div style='background:#0f172a;color:#fff;padding:20px 24px;'>
                    <h2 style='margin:0;font-size:18px;'>HAMBAK TECH &amp; SERVICES — Printing Update</h2>
                    <p style='margin:4px 0 0;font-size:13px;color:#cbd5e1;'>Order Reference: <strong>{$safeRef}</strong></p>
                  </div>
                  <div style='padding:24px;color:#1e293b;'>
                    <p>Hello {$safeName},</p>
                    <p>{$safeMsg}</p>
                    <div style='margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:6px;'>
                      <strong>Current Status:</strong> {$safeStatus}
                    </div>
                    <p style='margin-top:20px;'>
                      <a href='https://hambaktech.com.ng/dashboard#printing' style='display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;'>Track Printing Order</a>
                    </p>
                  </div>
                </div>";
                $mailer->send(
                    (string)$order['customer_email'],
                    (string)($order['customer_name'] ?? 'Customer'),
                    "[{$ref}] {$title} — HambakTech Printing",
                    $html,
                    null,
                    ['audit_action' => 'PRINTING_NOTIFICATION_EMAIL']
                );
            } catch (Throwable) {
            }
        }
    }

    public function notifyPrintingAdmins(string $title, string $message, string $orderRef = ''): void
    {
        try {
            $admins = $this->db->fetchAll(
                'SELECT u.id, u.role, COALESCE(NULLIF(u.assigned_permissions, ""), up.assigned_permissions) AS assigned_permissions
                 FROM users u
                 LEFT JOIN user_profiles up ON u.id = up.user_id
                 WHERE u.role IN ("superadmin", "admin", "staff") AND u.status = "active"'
            );
            $link = $orderRef !== '' ? '#printing?order=' . urlencode($orderRef) : '#printing';
            foreach ($admins as $adm) {
                $permsRaw = $adm['assigned_permissions'] ?? null;
                $perms = is_string($permsRaw) ? (json_decode($permsRaw, true) ?? []) : [];
                $allowed = ($adm['role'] ?? '') === 'superadmin'
                    || (is_array($perms) && (in_array('*', $perms, true) || in_array('printing', $perms, true)))
                    || (($adm['role'] ?? '') === 'admin' && empty($permsRaw));
                if (!$allowed) {
                    continue;
                }
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                     VALUES (:id, :uid, :title, :msg, "alert", 0, :link, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $adm['id'],
                        'title' => $title,
                        'msg' => $message,
                        'link' => $link,
                    ]
                );
            }
        } catch (Throwable) {
        }
    }

    /**
     * Enforces financial settlement + dispatch rules before order can leave office.
     */
    public function assertDispatchAuthorized(array $order): void
    {
        $total = (float)($order['total_amount'] ?? 0);
        $paid = (float)($order['amount_paid'] ?? 0);
        $depositEnabled = !empty($order['deposit_enabled']);
        $requiredInit = $depositEnabled
            ? (float)($order['deposit_amount'] ?? $order['required_initial_payment'] ?? $total)
            : $total;

        if ($total <= 0) {
            throw new RuntimeException('Cannot confirm dispatch before a quotation amount is prepared.');
        }

        if ($paid + 0.01 < $requiredInit) {
            throw new RuntimeException('Dispatch blocked: Required printing payment has not been confirmed yet.');
        }

        if (($order['collection_method'] ?? 'office_collection') === 'paid_delivery') {
            $deliveryFee = (float)($order['delivery_charge'] ?? 0);
            $freeAuth = !empty($order['free_delivery_authorized']);
            if ($deliveryFee > 0 && !$freeAuth && ($order['delivery_payment_status'] ?? 'pending') !== 'paid') {
                // If deposit doesn't cover total when balance still includes delivery charge, ensure delivery charge is covered
                if ($paid + 0.01 < $total) {
                    throw new RuntimeException('Dispatch blocked: Delivery charges must be paid or free delivery authorized before dispatch.');
                }
            }
        }

        if (empty($order['dispatch_confirmed'])) {
            throw new RuntimeException('Dispatch confirmation must be recorded before setting status to Out for Delivery.');
        }
    }
}
