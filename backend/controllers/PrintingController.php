<?php
/**
 * @file PrintingController.php
 * Production Controller for Printing & Document Services Module
 * Integrates cleanly with existing Auth, Wallet, Payment Adapters, Uploaded Documents & Notifications.
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use Throwable;
use RuntimeException;
use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Core\Security;
use HambakTech\Services\PrintingService;
use HambakTech\Services\WalletService;
use HambakTech\Services\PinSecurityService;
use HambakTech\Services\FootprintService;
use HambakTech\Adapters\Payment\PaystackAdapter;
use HambakTech\Adapters\Payment\FlutterwaveAdapter;

class PrintingController
{
    private Database $db;
    private PrintingService $printing;
    private WalletService $walletService;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->printing = new PrintingService($this->db);
        $this->walletService = new WalletService();
    }

    // =========================================================================
    // A. CUSTOMER ENDPOINTS
    // =========================================================================

    /**
     * GET /api/printing/catalog
     */
    public function catalog(Request $request): void
    {
        Auth::requireAuth($request);

        $catRows = $this->db->fetchAll(
            'SELECT * FROM printing_service_categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC'
        );
        $categories = array_map(fn($r) => $this->printing->decodeCategory($r, false), $catRows);

        $zoneRows = $this->db->fetchAll(
            'SELECT * FROM printing_delivery_zones WHERE is_active = 1 ORDER BY display_order ASC, destination_group ASC'
        );
        $zones = array_map(fn($r) => $this->printing->decodeZone($r), $zoneRows);

        $settings = $this->printing->getSettings();

        // Fetch bank transfer details cleanly from wallet settings if available
        $bankDetails = [
            'bank' => 'Moniepoint MFB',
            'accountNumber' => '5210471634',
            'accountName' => 'Hambaktech_Services',
        ];
        try {
            $kvRows = $this->db->fetchAll(
                'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("wallet_settings","bank_transfer_bank","bank_transfer_account_number","bank_transfer_account_name","payment_gateways_settings")'
            );
            $kv = [];
            foreach ($kvRows as $kr) {
                $kv[$kr['setting_key']] = $kr['setting_value'];
            }
            if (!empty($kv['wallet_settings'])) {
                $w = json_decode((string)$kv['wallet_settings'], true);
                if (is_array($w)) {
                    $bankDetails['bank'] = (string)($w['bank_name'] ?? $bankDetails['bank']);
                    $bankDetails['accountNumber'] = (string)($w['bank_account_number'] ?? $bankDetails['accountNumber']);
                    $bankDetails['accountName'] = (string)($w['bank_account_name'] ?? $bankDetails['accountName']);
                }
            }
            if (!empty($kv['bank_transfer_bank'])) $bankDetails['bank'] = (string)$kv['bank_transfer_bank'];
            if (!empty($kv['bank_transfer_account_number'])) $bankDetails['accountNumber'] = (string)$kv['bank_transfer_account_number'];
            if (!empty($kv['bank_transfer_account_name'])) $bankDetails['accountName'] = (string)$kv['bank_transfer_account_name'];
        } catch (Throwable) {
        }

        Response::success([
            'categories' => $categories,
            'delivery_zones' => $zones,
            'settings' => $settings,
            'statuses' => PrintingService::ORDER_STATUSES,
            'bank_details' => $bankDetails,
        ]);
    }

    /**
     * POST /api/printing/estimate
     */
    public function estimate(Request $request): void
    {
        Auth::requireAuth($request);
        $body = $request->all();
        $catKey = trim((string)($body['category_key'] ?? ''));

        if ($catKey === '') {
            Response::error('Service category is required.', 422);
        }

        $category = $this->db->fetchOne(
            'SELECT * FROM printing_service_categories WHERE category_key = :ck AND is_active = 1 LIMIT 1',
            ['ck' => $catKey]
        );
        if (!$category) {
            Response::notFound('Selected printing service category is unavailable or inactive.');
        }

        $zone = null;
        if (!empty($body['delivery_zone_id'])) {
            $zRow = $this->db->fetchOne(
                'SELECT * FROM printing_delivery_zones WHERE id = :id AND is_active = 1 LIMIT 1',
                ['id' => (string)$body['delivery_zone_id']]
            );
            if ($zRow) {
                $zone = $this->printing->decodeZone($zRow);
            }
        }

        try {
            $est = $this->printing->calculateEstimate($category, $body, $zone);
            Response::success($est);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /**
     * POST /api/printing/upload
     */
    public function uploadFile(Request $request): void
    {
        $user = Auth::requireAuth($request);

        $file = $_FILES['file'] ?? $_FILES['document'] ?? $_FILES['artwork'] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::error('Please choose a valid printing document or design file.', 422);
        }

        $settings = $this->printing->getSettings();
        $maxBytes = max(2, (int)($settings['max_upload_mb'] ?? 15)) * 1024 * 1024;
        if (($file['size'] ?? 0) > $maxBytes) {
            Response::error('Uploaded file exceeds maximum allowed size of ' . ($settings['max_upload_mb'] ?? 15) . 'MB.', 422);
        }

        $allowedExts = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'cdr', 'ai', 'psd', 'zip'];
        $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExts, true)) {
            Response::error('Unsupported file format. Accepted: PDF, DOCX, JPG, PNG, WEBP, TIFF, CDR, AI, PSD, ZIP.', 422);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo ? (string)finfo_file($finfo, (string)$file['tmp_name']) : 'application/octet-stream';
        if ($finfo) {
            finfo_close($finfo);
        }

        $blockedMimes = ['application/x-php', 'text/x-php', 'application/x-httpd-php', 'text/html', 'application/javascript'];
        if (in_array($mime, $blockedMimes, true)) {
            Response::error('Executable or script files are blocked for security.', 422);
        }

        $storageDir = dirname(__DIR__) . '/storage/printing';
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
            @file_put_contents($storageDir . '/.htaccess', "Deny from all\n");
        }

        $docId = Security::generateUuid();
        $storedName = 'prt_' . date('YmdHis') . '_' . bin2hex(random_bytes(5)) . '.' . $ext;
        $destPath = $storageDir . '/' . $storedName;

        if (!move_uploaded_file((string)$file['tmp_name'], $destPath)) {
            Response::error('Unable to store uploaded file on the server.', 500);
        }

        $fileUrl = '/api/printing/files/' . $docId;
        $docType = trim((string)$request->input('purpose', 'printing_artwork')) ?: 'printing_artwork';

        $this->db->execute(
            'INSERT INTO uploaded_documents
             (id, user_id, document_type, original_name, stored_name, mime_type, file_size, file_path, file_url, created_at)
             VALUES (:id, :uid, :dtype, :oname, :sname, :mime, :sz, :fpath, :furl, NOW())',
            [
                'id' => $docId,
                'uid' => $user['id'],
                'dtype' => substr($docType, 0, 60),
                'oname' => substr((string)$file['name'], 0, 250),
                'sname' => $storedName,
                'mime' => $mime ?: 'application/octet-stream',
                'sz' => (int)($file['size'] ?? 0),
                'fpath' => $destPath,
                'furl' => $fileUrl,
            ]
        );

        Response::success([
            'id' => $docId,
            'file_name' => (string)$file['name'],
            'file_url' => $fileUrl,
            'mime_type' => $mime,
            'file_size' => (int)($file['size'] ?? 0),
        ], 'File uploaded securely.', 201);
    }

    /**
     * GET /api/printing/files/:id
     */
    public function getFile(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $docId = trim((string)($params['id'] ?? ''));

        $doc = $this->db->fetchOne('SELECT * FROM uploaded_documents WHERE id = :id LIMIT 1', ['id' => $docId]);
        if (!$doc) {
            Response::notFound('Printing file not found.');
        }

        $isAuthorizedStaff = Auth::hasPermission($user, 'printing') || Auth::hasPermission($user, 'printing_pricing');
        if ($doc['user_id'] !== $user['id'] && !$isAuthorizedStaff) {
            Response::forbidden('You do not have permission to view this file.');
        }

        $path = (string)$doc['file_path'];
        if (!file_exists($path)) {
            Response::notFound('Uploaded file not found in server storage.');
        }

        header('Content-Type: ' . ($doc['mime_type'] ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . basename((string)$doc['original_name']) . '"');
        readfile($path);
        exit;
    }

    /**
     * GET /api/printing/orders
     */
    public function orders(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $statusFilter = trim((string)$request->query('status', ''));

        $sql = 'SELECT * FROM printing_orders WHERE user_id = :uid ';
        $params = ['uid' => $user['id']];
        if ($statusFilter !== '' && $statusFilter !== 'all') {
            $sql .= 'AND status = :st ';
            $params['st'] = $statusFilter;
        }
        $sql .= 'ORDER BY created_at DESC LIMIT 200';

        $rows = $this->db->fetchAll($sql, $params);
        $orders = array_map(fn($r) => $this->printing->sanitizeOrderForCustomer($r), $rows);

        Response::success(['orders' => $orders]);
    }

    /**
     * GET /api/printing/orders/:id
     */
    public function orderDetail(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE (id = :id OR order_reference = :ref) AND user_id = :uid LIMIT 1',
            ['id' => $id, 'ref' => $id, 'uid' => $user['id']]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $history = $this->db->fetchAll(
            'SELECT id, order_id, from_status, to_status, actor_name, actor_role, note, created_at
             FROM printing_order_status_history
             WHERE order_id = :oid
             ORDER BY created_at ASC',
            ['oid' => $order['id']]
        );

        $messages = $this->db->fetchAll(
            'SELECT id, order_id, sender_id, sender_name, sender_role, message, attachment_url, created_at
             FROM printing_order_messages
             WHERE order_id = :oid AND is_internal = 0
             ORDER BY created_at ASC',
            ['oid' => $order['id']]
        );

        $payments = $this->db->fetchAll(
            'SELECT id, reference, payment_scope, gateway, amount, status, proof_url, payer_name, bank_reference, remarks, confirmed_at, created_at
             FROM printing_payments
             WHERE order_id = :oid
             ORDER BY created_at DESC',
            ['oid' => $order['id']]
        );
        foreach ($payments as &$p) {
            $p['amount'] = (float)$p['amount'];
        }

        Response::success([
            'order' => $this->printing->sanitizeOrderForCustomer($order),
            'history' => $history,
            'messages' => $messages,
            'payments' => $payments,
        ]);
    }

    /**
     * POST /api/printing/orders
     */
    public function createOrder(Request $request): void
    {
        $user = Auth::requireAuth($request);
        $body = $request->all();

        $catKey = trim((string)($body['category_key'] ?? ''));
        if ($catKey === '') {
            Response::error('Printing service category is required.', 422);
        }

        $category = $this->db->fetchOne(
            'SELECT * FROM printing_service_categories WHERE category_key = :ck AND is_active = 1 LIMIT 1',
            ['ck' => $catKey]
        );
        if (!$category) {
            Response::notFound('Selected printing category is not available.');
        }
        $catDecoded = $this->printing->decodeCategory($category, true);

        $collectionMethod = ($body['collection_method'] ?? 'office_collection') === 'paid_delivery'
            ? 'paid_delivery'
            : 'office_collection';

        $zone = null;
        $recipientName = trim((string)($body['delivery_recipient_name'] ?? ''));
        $recipientPhone = trim((string)($body['delivery_recipient_phone'] ?? ''));
        $deliveryDest = trim((string)($body['delivery_destination'] ?? ''));
        $deliveryLga = trim((string)($body['delivery_lga_lcda'] ?? ''));
        $deliveryTown = trim((string)($body['delivery_town'] ?? ''));
        $deliveryAddress = trim((string)($body['delivery_address'] ?? ''));
        $deliveryLandmark = trim((string)($body['delivery_landmark'] ?? ''));
        $zoneId = trim((string)($body['delivery_zone_id'] ?? ''));

        if ($collectionMethod === 'paid_delivery') {
            if ($recipientName === '' || $recipientPhone === '' || $deliveryLga === '' || $deliveryTown === '' || $deliveryAddress === '' || $deliveryLandmark === '') {
                Response::error('For Paid Delivery, recipient name, phone, Lagos LGA/LCDA, town, full street address, and nearby landmark are required.', 422);
            }
            if ($zoneId !== '') {
                $zRow = $this->db->fetchOne('SELECT * FROM printing_delivery_zones WHERE id = :id AND is_active = 1 LIMIT 1', ['id' => $zoneId]);
                if ($zRow) {
                    $zone = $this->printing->decodeZone($zRow);
                    if ($deliveryDest === '') {
                        $deliveryDest = (string)$zone['destination_group'];
                    }
                }
            }
            if ($deliveryDest === '') {
                $deliveryDest = $deliveryLga;
            }
        }

        try {
            $est = $this->printing->calculateEstimate($catDecoded, $body, $zone);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        $serviceTitle = trim((string)($body['service_title'] ?? ''));
        if ($serviceTitle === '') {
            $purpose = trim((string)($body['document_purpose'] ?? $body['banner_purpose'] ?? $body['card_audience'] ?? $body['photo_type'] ?? $body['custom_item_type'] ?? ''));
            $serviceTitle = $purpose !== '' ? "{$catDecoded['name']} — {$purpose}" : $catDecoded['name'];
        }

        $customerName = trim((string)($body['customer_name'] ?? $user['full_name'] ?? 'Customer'));
        $customerEmail = trim((string)($body['customer_email'] ?? $user['email'] ?? ''));
        $customerPhone = trim((string)($body['customer_phone'] ?? $user['phone_number'] ?? ''));
        $colorMode = strtolower(trim((string)($body['color_mode'] ?? 'bw')));
        if (!in_array($colorMode, ['bw', 'color', 'mixed', 'full_color'], true)) {
            $colorMode = 'bw';
        }

        $uploadedFiles = is_array($body['uploaded_files'] ?? null) ? $body['uploaded_files'] : [];
        $finishingReq = is_array($body['finishing_requirements'] ?? null) ? $body['finishing_requirements'] : [];
        $specs = is_array($body['specs'] ?? null) ? $body['specs'] : [];
        $specs['page_count'] = (int)($body['page_count'] ?? ($specs['page_count'] ?? 1));
        $specs['measurement_method'] = $est['measurement_method'];
        if (!empty($body['document_purpose'])) $specs['document_purpose'] = $body['document_purpose'];
        if (!empty($body['paper_weight'])) $specs['paper_weight'] = $body['paper_weight'];
        if (!empty($body['banner_purpose'])) $specs['banner_purpose'] = $body['banner_purpose'];
        if (!empty($body['card_audience'])) $specs['card_audience'] = $body['card_audience'];
        if (!empty($body['double_sided'])) $specs['double_sided'] = $body['double_sided'];
        if (!empty($body['photo_type'])) $specs['photo_type'] = $body['photo_type'];
        if (!empty($body['paper_finish'])) $specs['paper_finish'] = $body['paper_finish'];
        if (!empty($body['custom_item_type'])) $specs['custom_item_type'] = $body['custom_item_type'];

        $orderId = Security::generateUuid();
        $orderRef = 'PRT-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));

        $internalCostEst = round((float)($catDecoded['internal_cost_estimate'] ?? 0) * max(1.0, (float)$est['effective_units']), 2);

        $this->db->execute(
            'INSERT INTO printing_orders (
                id, order_reference, user_id, customer_name, customer_email, customer_phone,
                category_key, category_name, service_title, status,
                specs, uploaded_files, quantity, color_mode, paper_size, width_ft, height_ft, sq_ft,
                finishing_requirements, is_urgent, special_instructions,
                estimated_printing_charge, printing_charge, finishing_charge, urgent_charge, discount_amount,
                delivery_charge, total_amount, balance_due, payment_status, delivery_payment_status,
                collection_method, delivery_zone_id, delivery_recipient_name, delivery_recipient_phone,
                delivery_destination, delivery_lga_lcda, delivery_town, delivery_address, delivery_landmark,
                internal_production_cost, created_at, updated_at
             ) VALUES (
                :id, :ref, :uid, :cname, :cemail, :cphone,
                :ckey, :cname_cat, :title, "Pending Review",
                :specs, :files, :qty, :cmode, :psize, :wft, :hft, :sqft,
                :fin, :urg, :instr,
                :est_print, :pcharge, :fcharge, :ucharge, :disc,
                :dcharge, :tot, :bal, "unpaid", :del_pay_st,
                :cmeth, :dzid, :drec_name, :drec_phone,
                :ddest, :dlga, :dtown, :daddr, :dland,
                :icost, NOW(), NOW()
             )',
            [
                'id' => $orderId,
                'ref' => $orderRef,
                'uid' => $user['id'],
                'cname' => $customerName,
                'cemail' => $customerEmail,
                'cphone' => $customerPhone,
                'ckey' => $catDecoded['category_key'],
                'cname_cat' => $catDecoded['name'],
                'title' => $serviceTitle,
                'specs' => json_encode($specs),
                'files' => json_encode($uploadedFiles),
                'qty' => $est['quantity'],
                'cmode' => $colorMode,
                'psize' => trim((string)($body['paper_size'] ?? '')) ?: null,
                'wft' => $est['width_ft'] > 0 ? $est['width_ft'] : null,
                'hft' => $est['height_ft'] > 0 ? $est['height_ft'] : null,
                'sqft' => $est['sq_ft'] > 0 ? $est['sq_ft'] : null,
                'fin' => json_encode($finishingReq),
                'urg' => $est['is_urgent'] ? 1 : 0,
                'instr' => trim((string)($body['special_instructions'] ?? '')) ?: null,
                'est_print' => $est['printing_subtotal'],
                'pcharge' => $est['printing_charge'],
                'fcharge' => $est['finishing_charge'],
                'ucharge' => $est['urgent_charge'],
                'disc' => $est['discount_amount'],
                'dcharge' => $est['delivery_charge'],
                'tot' => $est['total_estimate'],
                'bal' => $est['total_estimate'],
                'del_pay_st' => $collectionMethod === 'paid_delivery' ? 'pending' : 'not_applicable',
                'cmeth' => $collectionMethod,
                'dzid' => $zone ? $zone['id'] : ($zoneId ?: null),
                'drec_name' => $recipientName ?: null,
                'drec_phone' => $recipientPhone ?: null,
                'ddest' => $deliveryDest ?: null,
                'dlga' => $deliveryLga ?: null,
                'dtown' => $deliveryTown ?: null,
                'daddr' => $deliveryAddress ?: null,
                'dland' => $deliveryLandmark ?: null,
                'icost' => $internalCostEst,
            ]
        );

        $this->printing->recordStatusHistory(
            $orderId,
            null,
            'Pending Review',
            $user,
            'Printing request submitted by customer for manual review and quotation.'
        );

        $order = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $orderId]);
        if ($order) {
            $this->printing->notifyCustomerLifecycle(
                $order,
                'Printing Request Received',
                "Your printing request ({$serviceTitle}, Qty: {$est['quantity']}) has been received and queued for review. Our printing desk will prepare and send your official quotation shortly.",
                'info'
            );
            $this->printing->notifyPrintingAdmins(
                "New Printing Request: {$orderRef}",
                "{$customerName} submitted a {$catDecoded['name']} request ({$serviceTitle}, Qty: {$est['quantity']}). Review & send quotation.",
                $orderRef
            );
        }

        FootprintService::record([
            'user_id' => $user['id'],
            'user_email' => $user['email'] ?? null,
            'user_name' => $user['full_name'] ?? null,
            'category' => 'printing',
            'action' => 'PRINTING_ORDER_SUBMITTED',
            'service_type' => $catDecoded['category_key'],
            'reference' => $orderRef,
            'status' => 'Pending Review',
            'amount' => $est['total_estimate'],
        ]);

        Response::success([
            'order' => $order ? $this->printing->sanitizeOrderForCustomer($order) : null,
            'estimate' => $est,
        ], 'Printing request submitted successfully! You will be notified once your quotation is ready.', 201);
    }

    /**
     * POST /api/printing/orders/:id/quote-response
     */
    public function respondQuote(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $decision = strtolower(trim((string)$request->input('decision', '')));
        $reason = trim((string)$request->input('reason', ''));

        if (!in_array($decision, ['approve', 'approved', 'decline', 'declined'], true)) {
            Response::error('Quote decision must be approve or decline.', 422);
        }

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE (id = :id OR order_reference = :ref) AND user_id = :uid LIMIT 1',
            ['id' => $id, 'ref' => $id, 'uid' => $user['id']]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        if ($order['status'] !== 'Quotation Sent') {
            Response::error("Only orders in 'Quotation Sent' status can be approved or declined (current: {$order['status']}).", 409);
        }

        $isApprove = str_starts_with($decision, 'approve');
        $newStatus = $isApprove ? 'Awaiting Payment' : 'Cancelled';
        $quoteDecision = $isApprove ? 'approved' : 'declined';

        $this->db->execute(
            'UPDATE printing_orders
             SET status = :st, quote_decision = :qd, quote_responded_at = NOW(), quote_decline_reason = :qdr, updated_at = NOW()
             WHERE id = :id',
            [
                'st' => $newStatus,
                'qd' => $quoteDecision,
                'qdr' => !$isApprove ? ($reason ?: 'Declined by customer') : null,
                'id' => $order['id'],
            ]
        );

        $this->printing->recordStatusHistory(
            $order['id'],
            $order['status'],
            $newStatus,
            $user,
            $isApprove ? 'Customer approved quotation and proceeded to payment.' : 'Customer declined quotation: ' . ($reason ?: 'No reason stated.')
        );

        $updated = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $order['id']]);
        if ($updated) {
            if ($isApprove) {
                $this->printing->notifyCustomerLifecycle(
                    $updated,
                    'Quotation Approved — Awaiting Payment',
                    'You approved the quotation for ₦' . number_format((float)$updated['total_amount'], 2) . '. Complete payment via wallet, card, or bank transfer to begin production.',
                    'success',
                    false
                );
                $this->printing->notifyPrintingAdmins(
                    "Quote Approved: {$updated['order_reference']}",
                    "{$updated['customer_name']} approved quotation of ₦" . number_format((float)$updated['total_amount'], 2) . '.',
                    $updated['order_reference']
                );
            } else {
                $this->printing->notifyPrintingAdmins(
                    "Quote Declined: {$updated['order_reference']}",
                    "{$updated['customer_name']} declined the quotation. Reason: " . ($reason ?: 'None given'),
                    $updated['order_reference']
                );
            }
        }

        Response::success([
            'order' => $updated ? $this->printing->sanitizeOrderForCustomer($updated) : null,
        ], $isApprove ? 'Quotation approved. Please complete your payment.' : 'Quotation declined.');
    }

    /**
     * POST /api/printing/orders/:id/pay
     * Supports Wallet (with compulsory Transaction PIN), Paystack, Flutterwave, and Manual Bank Transfer.
     * Supports Full payment, Deposit payment, Balance payment, and separate Delivery payment.
     */
    public function payOrder(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->all();

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE (id = :id OR order_reference = :ref) AND user_id = :uid LIMIT 1',
            ['id' => $id, 'ref' => $id, 'uid' => $user['id']]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $payableStatuses = ['Quotation Sent', 'Awaiting Payment', 'Payment Confirmed', 'Processing', 'On Hold', 'Ready for Collection', 'Ready for Dispatch'];
        if (!in_array($order['status'], $payableStatuses, true)) {
            Response::error("Order is currently in '{$order['status']}' and cannot accept payment.", 409);
        }

        $total = (float)$order['total_amount'];
        $alreadyPaid = (float)$order['amount_paid'];
        $balanceDue = max(0.0, round($total - $alreadyPaid, 2));
        if ($total <= 0 || $balanceDue <= 0.01) {
            Response::error('This order has already been fully paid or has no finalized quotation amount.', 409);
        }

        $scope = strtolower(trim((string)($body['payment_scope'] ?? 'full')));
        if (!in_array($scope, ['full', 'deposit', 'balance', 'delivery'], true)) {
            $scope = 'full';
        }

        $amountToPay = $balanceDue;
        if ($scope === 'deposit') {
            if (empty($order['deposit_enabled']) || $alreadyPaid > 0) {
                Response::error('Deposit payment is either not enabled for this quotation or an initial payment has already been made.', 422);
            }
            $depAmt = (float)($order['deposit_amount'] ?? 0);
            if ($depAmt <= 0 || $depAmt >= $total) {
                $depAmt = round($total * (((float)($order['deposit_percent'] ?? 50)) / 100), 2);
            }
            $amountToPay = min($balanceDue, $depAmt);
        } elseif ($scope === 'delivery') {
            $delCharge = (float)($order['delivery_charge'] ?? 0);
            if ($delCharge <= 0 || !empty($order['free_delivery_authorized']) || $order['delivery_payment_status'] === 'paid') {
                Response::error('No separate pending delivery fee is due on this order.', 422);
            }
            $amountToPay = min($balanceDue, $delCharge);
        }

        $gateway = strtolower(trim((string)($body['gateway'] ?? 'wallet')));
        if (!in_array($gateway, ['wallet', 'paystack', 'flutterwave', 'manual_transfer'], true)) {
            Response::error('Unsupported payment method. Use wallet, paystack, flutterwave, or manual_transfer.', 422);
        }

        $payRef = 'PRTPAY_' . strtoupper(bin2hex(random_bytes(5)));
        $paymentId = Security::generateUuid();

        if ($gateway === 'wallet') {
            // Enforce compulsory Transaction PIN
            $pinService = new PinSecurityService($this->db);
            $pinService->requireValidPin($user, $body, 'printing_payment', 'printing');

            try {
                $walletRes = $this->walletService->debit(
                    $user['id'],
                    $amountToPay,
                    'printing',
                    $payRef,
                    "Printing payment ({$scope}) for {$order['order_reference']}",
                    'internal',
                    ['order_id' => $order['id'], 'order_reference' => $order['order_reference'], 'scope' => $scope]
                );
            } catch (RuntimeException $e) {
                Response::error($e->getMessage(), 400);
                return;
            }

            $this->db->execute(
                'INSERT INTO printing_payments
                 (id, order_id, user_id, reference, payment_scope, gateway, amount, status, payer_name, remarks, confirmed_by, confirmed_by_name, confirmed_at, created_at)
                 VALUES (:id, :oid, :uid, :ref, :scope, "wallet", :amt, "confirmed", :pname, :rem, :cb, :cbn, NOW(), NOW())',
                [
                    'id' => $paymentId,
                    'oid' => $order['id'],
                    'uid' => $user['id'],
                    'ref' => $payRef,
                    'scope' => $scope,
                    'amt' => $amountToPay,
                    'pname' => $user['full_name'] ?? $user['email'],
                    'rem' => 'Instant wallet settlement',
                    'cb' => $user['id'],
                    'cbn' => 'Wallet Automated Settlement',
                ]
            );

            $updatedOrder = $this->applyConfirmedPayment($order, $amountToPay, $scope, $user, "Wallet payment confirmed ({$payRef})");

            Response::success([
                'payment_id' => $paymentId,
                'reference' => $payRef,
                'status' => 'confirmed',
                'wallet_balance' => $walletRes['balance_after'] ?? null,
                'order' => $this->printing->sanitizeOrderForCustomer($updatedOrder),
            ], 'Printing payment confirmed from wallet!');
            return;
        }

        if ($gateway === 'manual_transfer') {
            $payerName = trim((string)($body['payer_name'] ?? $user['full_name'] ?? 'Customer'));
            $bankRef = trim((string)($body['bank_reference'] ?? $body['reference'] ?? ''));
            $proofUrl = trim((string)($body['proof_url'] ?? ''));
            $remarks = trim((string)($body['remarks'] ?? 'Manual bank transfer for printing order'));

            $this->db->execute(
                'INSERT INTO printing_payments
                 (id, order_id, user_id, reference, payment_scope, gateway, amount, status, proof_url, payer_name, bank_reference, remarks, created_at)
                 VALUES (:id, :oid, :uid, :ref, :scope, "manual_transfer", :amt, "pending", :purl, :pname, :bref, :rem, NOW())',
                [
                    'id' => $paymentId,
                    'oid' => $order['id'],
                    'uid' => $user['id'],
                    'ref' => $payRef,
                    'scope' => $scope,
                    'amt' => $amountToPay,
                    'purl' => $proofUrl ?: null,
                    'pname' => $payerName,
                    'bref' => $bankRef ?: $payRef,
                    'rem' => $remarks,
                ]
            );

            // Ensure quote decision becomes approved if customer paid directly from Quotation Sent
            if ($order['status'] === 'Quotation Sent') {
                $this->db->execute(
                    'UPDATE printing_orders SET status = "Awaiting Payment", quote_decision = "approved", quote_responded_at = NOW() WHERE id = :id',
                    ['id' => $order['id']]
                );
                $this->printing->recordStatusHistory($order['id'], 'Quotation Sent', 'Awaiting Payment', $user, 'Manual transfer proof submitted by customer.');
            }

            $this->printing->notifyPrintingAdmins(
                "Printing Transfer Proof: {$order['order_reference']}",
                "{$payerName} submitted ₦" . number_format($amountToPay, 2) . " bank transfer proof ({$payRef}) awaiting confirmation.",
                $order['order_reference']
            );

            Response::success([
                'payment_id' => $paymentId,
                'reference' => $payRef,
                'status' => 'pending',
                'amount' => $amountToPay,
            ], 'Bank transfer proof submitted! Our finance/printing team will confirm shortly.');
            return;
        }

        // Paystack / Flutterwave checkout initialization
        $callbackUrl = (string)($body['callback_url'] ?? 'https://hambaktech.com.ng/dashboard#printing');
        $sep = str_contains($callbackUrl, '?') ? '&' : '?';

        $this->db->execute(
            'INSERT INTO printing_payments
             (id, order_id, user_id, reference, payment_scope, gateway, amount, status, payer_name, created_at)
             VALUES (:id, :oid, :uid, :ref, :scope, :gw, :amt, "pending", :pname, NOW())',
            [
                'id' => $paymentId,
                'oid' => $order['id'],
                'uid' => $user['id'],
                'ref' => $payRef,
                'scope' => $scope,
                'gw' => $gateway,
                'amt' => $amountToPay,
                'pname' => $user['full_name'] ?? $user['email'],
            ]
        );

        try {
            if ($gateway === 'flutterwave') {
                $flw = new FlutterwaveAdapter();
                $initRes = $flw->initializePayment(
                    (string)$user['email'],
                    $amountToPay,
                    $payRef,
                    $callbackUrl . $sep . 'printing_order=' . $order['id'] . '&gateway=flutterwave&reference=' . $payRef,
                    ['order_reference' => $order['order_reference'], 'scope' => $scope]
                );
            } else {
                $ps = new PaystackAdapter();
                $initRes = $ps->initializePayment(
                    (string)$user['email'],
                    $amountToPay,
                    $payRef,
                    $callbackUrl . $sep . 'printing_order=' . $order['id'] . '&gateway=paystack&reference=' . $payRef,
                    ['order_reference' => $order['order_reference'], 'scope' => $scope]
                );
            }

            Response::success([
                'payment_id' => $paymentId,
                'reference' => $payRef,
                'amount' => $amountToPay,
                'gateway' => $gateway,
                'authorization_url' => $initRes['authorization_url'] ?? ($initRes['link'] ?? ''),
                'link' => $initRes['link'] ?? ($initRes['authorization_url'] ?? ''),
            ], 'Payment gateway checkout initialized.');
        } catch (Throwable $e) {
            $this->db->execute('UPDATE printing_payments SET status = "rejected", remarks = :rem WHERE id = :id', ['rem' => $e->getMessage(), 'id' => $paymentId]);
            Response::error($e->getMessage(), 502);
        }
    }

    /**
     * POST /api/printing/orders/:id/pay/verify
     */
    public function verifyPayment(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $reference = trim((string)$request->input('reference', ''));
        $flwTransactionId = trim((string)$request->input('transaction_id', ''));

        if ($reference === '') {
            Response::error('Payment reference is required.', 422);
        }

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE (id = :id OR order_reference = :ref) AND user_id = :uid LIMIT 1',
            ['id' => $id, 'ref' => $id, 'uid' => $user['id']]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $payment = $this->db->fetchOne(
            'SELECT * FROM printing_payments WHERE reference = :ref AND order_id = :oid LIMIT 1',
            ['ref' => $reference, 'oid' => $order['id']]
        );
        if (!$payment) {
            Response::notFound('Payment record not found.');
        }

        if ($payment['status'] === 'confirmed') {
            Response::success([
                'already_confirmed' => true,
                'order' => $this->printing->sanitizeOrderForCustomer($order),
            ], 'Payment already verified.');
            return;
        }

        try {
            $gw = (string)$payment['gateway'];
            if ($gw === 'flutterwave') {
                $flw = new FlutterwaveAdapter();
                $res = $flw->verifyPayment($reference, $flwTransactionId !== '' ? $flwTransactionId : null);
            } else {
                $ps = new PaystackAdapter();
                $res = $ps->verifyPayment($reference);
            }

            if (($res['status'] ?? '') !== 'successful') {
                Response::error('Payment verification incomplete: ' . ($res['gateway_response'] ?? 'Unverified'), 400);
            }

            $verifiedAmt = (float)($res['amount'] ?? 0);
            if ($verifiedAmt + 0.01 < (float)$payment['amount']) {
                Response::error('Payment amount mismatch detected.', 400);
            }

            $this->db->execute(
                'UPDATE printing_payments SET status = "confirmed", confirmed_by = :cb, confirmed_by_name = :cbn, confirmed_at = NOW() WHERE id = :id',
                ['cb' => $user['id'], 'cbn' => ucfirst($gw) . ' Gateway', 'id' => $payment['id']]
            );

            $updated = $this->applyConfirmedPayment($order, (float)$payment['amount'], (string)$payment['payment_scope'], $user, ucfirst($gw) . " payment verified ({$reference})");
            Response::success(['order' => $this->printing->sanitizeOrderForCustomer($updated)], 'Payment verified and confirmed!');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 502);
        }
    }

    /**
     * POST /api/printing/orders/:id/cancel
     */
    public function cancelOrder(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $reason = trim((string)$request->input('reason', 'Cancelled by customer'));

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE (id = :id OR order_reference = :ref) AND user_id = :uid LIMIT 1',
            ['id' => $id, 'ref' => $id, 'uid' => $user['id']]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $nonCancellable = ['Processing', 'Ready for Collection', 'Ready for Dispatch', 'Out for Delivery', 'Completed', 'Cancelled', 'Refunded'];
        if (in_array($order['status'], $nonCancellable, true)) {
            Response::error("Cannot cancel an order in '{$order['status']}' status.", 409);
        }

        $this->db->execute(
            'UPDATE printing_orders SET status = "Cancelled", updated_at = NOW() WHERE id = :id',
            ['id' => $order['id']]
        );
        $this->printing->recordStatusHistory($order['id'], $order['status'], 'Cancelled', $user, $reason);

        $updated = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $order['id']]);
        if ($updated) {
            $this->printing->notifyPrintingAdmins(
                "Printing Order Cancelled: {$updated['order_reference']}",
                "{$updated['customer_name']} cancelled their printing order. Reason: {$reason}",
                $updated['order_reference']
            );
        }

        Response::success(['order' => $updated ? $this->printing->sanitizeOrderForCustomer($updated) : null], 'Order cancelled.');
    }

    /**
     * POST /api/printing/orders/:id/messages
     */
    public function sendMessage(Request $request, array $params): void
    {
        $user = Auth::requireAuth($request);
        $id = trim((string)($params['id'] ?? ''));
        $message = trim((string)$request->input('message', ''));
        $attachmentUrl = trim((string)$request->input('attachment_url', ''));

        if ($message === '') {
            Response::error('Message cannot be empty.', 422);
        }

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE (id = :id OR order_reference = :ref) AND user_id = :uid LIMIT 1',
            ['id' => $id, 'ref' => $id, 'uid' => $user['id']]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $msgId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO printing_order_messages (id, order_id, sender_id, sender_name, sender_role, message, attachment_url, is_internal, created_at)
             VALUES (:id, :oid, :sid, :sname, "customer", :msg, :att, 0, NOW())',
            [
                'id' => $msgId,
                'oid' => $order['id'],
                'sid' => $user['id'],
                'sname' => $user['full_name'] ?? $user['email'],
                'msg' => $message,
                'att' => $attachmentUrl ?: null,
            ]
        );

        $this->printing->notifyPrintingAdmins(
            "Message on {$order['order_reference']}",
            "{$order['customer_name']}: {$message}",
            $order['order_reference']
        );

        Response::success([
            'id' => $msgId,
            'sender_name' => $user['full_name'] ?? $user['email'],
            'sender_role' => 'customer',
            'message' => $message,
            'attachment_url' => $attachmentUrl ?: null,
            'created_at' => date('Y-m-d H:i:s'),
        ], 'Message sent to printing desk.', 201);
    }

    // =========================================================================
    // B. ADMIN & AUTHORISED STAFF ENDPOINTS
    // =========================================================================

    private function requirePrintingOps(Request $request): array
    {
        return Auth::requirePermission($request, 'printing');
    }

    private function requirePrintingRead(Request $request): array
    {
        return Auth::requireAnyPermission($request, ['printing', 'printing_pricing']);
    }

    private function requirePrintingPricing(Request $request): array
    {
        return Auth::requirePermission($request, 'printing_pricing');
    }

    /**
     * GET /api/admin/printing/metrics
     */
    public function adminMetrics(Request $request): void
    {
        $this->requirePrintingRead($request);

        $orders = $this->db->fetchAll('SELECT status, total_amount, amount_paid, delivery_charge, internal_production_cost, payment_status, collection_method FROM printing_orders');
        $byStatus = [];
        foreach (PrintingService::ORDER_STATUSES as $st) {
            $byStatus[$st] = 0;
        }
        $totalRevenue = 0.0;
        $totalCollected = 0.0;
        $totalDeliveryFees = 0.0;
        $totalInternalCost = 0.0;
        $pendingCollection = 0;
        $pendingDispatch = 0;
        $activeProduction = 0;

        foreach ($orders as $o) {
            $st = (string)$o['status'];
            $byStatus[$st] = ($byStatus[$st] ?? 0) + 1;
            if (!in_array($st, ['Rejected', 'Cancelled', 'Refunded'], true)) {
                $totalRevenue += (float)$o['total_amount'];
                $totalCollected += (float)$o['amount_paid'];
                $totalDeliveryFees += (float)$o['delivery_charge'];
                $totalInternalCost += (float)$o['internal_production_cost'];
            }
            if ($st === 'Ready for Collection') $pendingCollection++;
            if ($st === 'Ready for Dispatch') $pendingDispatch++;
            if (in_array($st, ['Payment Confirmed', 'Processing'], true)) $activeProduction++;
        }

        $pendingPayRow = $this->db->fetchOne('SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as vol FROM printing_payments WHERE status = "pending"');

        Response::success([
            'total_orders' => count($orders),
            'pending_requests' => ($byStatus['Pending Review'] ?? 0) + ($byStatus['Under Review'] ?? 0) + ($byStatus['Awaiting Quotation'] ?? 0),
            'quotations_pending_customer' => $byStatus['Quotation Sent'] ?? 0,
            'awaiting_payment' => $byStatus['Awaiting Payment'] ?? 0,
            'active_production' => $activeProduction,
            'ready_for_collection' => $pendingCollection,
            'ready_for_dispatch' => $pendingDispatch,
            'completed_orders' => $byStatus['Completed'] ?? 0,
            'pending_payment_verifications' => (int)($pendingPayRow['cnt'] ?? 0),
            'pending_payment_volume' => (float)($pendingPayRow['vol'] ?? 0),
            'total_quoted_revenue' => round($totalRevenue, 2),
            'total_collected' => round($totalCollected, 2),
            'total_delivery_revenue' => round($totalDeliveryFees, 2),
            'total_internal_cost' => round($totalInternalCost, 2),
            'estimated_gross_profit' => round($totalRevenue - $totalInternalCost, 2),
            'status_counts' => $byStatus,
        ]);
    }

    /**
     * GET /api/admin/printing/orders
     */
    public function adminOrders(Request $request): void
    {
        $this->requirePrintingOps($request);

        $status = trim((string)$request->query('status', ''));
        $cat = trim((string)$request->query('category_key', ''));
        $assigned = trim((string)$request->query('assigned_staff_id', ''));
        $search = trim((string)$request->query('search', ''));

        $sql = 'SELECT * FROM printing_orders WHERE 1=1 ';
        $params = [];

        if ($status !== '' && $status !== 'all') {
            $sql .= 'AND status = :st ';
            $params['st'] = $status;
        }
        if ($cat !== '' && $cat !== 'all') {
            $sql .= 'AND category_key = :ck ';
            $params['ck'] = $cat;
        }
        if ($assigned !== '' && $assigned !== 'all') {
            $sql .= 'AND assigned_staff_id = :sid ';
            $params['sid'] = $assigned;
        }
        if ($search !== '') {
            $sql .= 'AND (order_reference LIKE :q OR customer_name LIKE :q2 OR customer_email LIKE :q3 OR service_title LIKE :q4) ';
            $q = '%' . $search . '%';
            $params['q'] = $q;
            $params['q2'] = $q;
            $params['q3'] = $q;
            $params['q4'] = $q;
        }

        $sql .= 'ORDER BY created_at DESC LIMIT 300';
        $rows = $this->db->fetchAll($sql, $params);
        $orders = array_map(fn($r) => $this->printing->formatOrderForAdmin($r), $rows);

        Response::success(['orders' => $orders]);
    }

    /**
     * GET /api/admin/printing/orders/:id
     */
    public function adminOrderDetail(Request $request, array $params): void
    {
        $this->requirePrintingOps($request);
        $id = trim((string)($params['id'] ?? ''));

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE id = :id OR order_reference = :ref LIMIT 1',
            ['id' => $id, 'ref' => $id]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $history = $this->db->fetchAll(
            'SELECT * FROM printing_order_status_history WHERE order_id = :oid ORDER BY created_at ASC',
            ['oid' => $order['id']]
        );
        $messages = $this->db->fetchAll(
            'SELECT * FROM printing_order_messages WHERE order_id = :oid ORDER BY created_at ASC',
            ['oid' => $order['id']]
        );
        foreach ($messages as &$m) {
            $m['is_internal'] = (bool)$m['is_internal'];
        }
        $payments = $this->db->fetchAll(
            'SELECT * FROM printing_payments WHERE order_id = :oid ORDER BY created_at DESC',
            ['oid' => $order['id']]
        );
        foreach ($payments as &$p) {
            $p['amount'] = (float)$p['amount'];
        }

        Response::success([
            'order' => $this->printing->formatOrderForAdmin($order),
            'history' => $history,
            'messages' => $messages,
            'payments' => $payments,
        ]);
    }

    /**
     * POST /api/admin/printing/orders/:id/quote
     */
    public function adminSendQuote(Request $request, array $params): void
    {
        $actor = $this->requirePrintingOps($request);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->all();

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE id = :id OR order_reference = :ref LIMIT 1',
            ['id' => $id, 'ref' => $id]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $printingCharge = max(0.0, (float)($body['printing_charge'] ?? $order['printing_charge']));
        $finishingCharge = max(0.0, (float)($body['finishing_charge'] ?? $order['finishing_charge']));
        $urgentCharge = max(0.0, (float)($body['urgent_charge'] ?? $order['urgent_charge']));
        $discountAmount = max(0.0, (float)($body['discount_amount'] ?? $order['discount_amount']));
        $freeDeliveryAuth = !empty($body['free_delivery_authorized']);
        $deliveryCharge = ($order['collection_method'] === 'office_collection' || $freeDeliveryAuth)
            ? 0.0
            : max(0.0, (float)($body['delivery_charge'] ?? $order['delivery_charge']));

        $totalAmount = max(0.0, round(($printingCharge + $finishingCharge + $urgentCharge + $deliveryCharge) - $discountAmount, 2));
        if ($totalAmount <= 0) {
            Response::error('Quotation total amount must be greater than ₦0.00.', 422);
        }

        $depositEnabled = !empty($body['deposit_enabled']);
        $depositPercent = max(10.0, min(90.0, (float)($body['deposit_percent'] ?? 50.0)));
        $depositAmount = $depositEnabled
            ? max(1.0, min($totalAmount, (float)($body['deposit_amount'] ?? round($totalAmount * ($depositPercent / 100), 2))))
            : $totalAmount;
        $reqInitial = $depositEnabled ? $depositAmount : $totalAmount;
        $amountPaid = (float)$order['amount_paid'];
        $balanceDue = max(0.0, round($totalAmount - $amountPaid, 2));

        $internalCost = array_key_exists('internal_production_cost', $body)
            ? max(0.0, (float)$body['internal_production_cost'])
            : (float)$order['internal_production_cost'];
        $quoteNotes = trim((string)($body['quote_notes'] ?? ''));
        $dueDate = trim((string)($body['due_date'] ?? '')) ?: null;

        $delPayStatus = $order['collection_method'] === 'office_collection'
            ? 'not_applicable'
            : ($freeDeliveryAuth ? 'free_authorized' : ($deliveryCharge <= 0 ? 'free_authorized' : ($balanceDue <= 0 ? 'paid' : 'pending')));

        $this->db->execute(
            'UPDATE printing_orders SET
                status = "Quotation Sent",
                printing_charge = :pc,
                finishing_charge = :fc,
                urgent_charge = :uc,
                discount_amount = :da,
                delivery_charge = :dc,
                free_delivery_authorized = :fda,
                delivery_payment_status = :dps,
                total_amount = :tot,
                deposit_enabled = :de,
                deposit_percent = :dp,
                deposit_amount = :damt,
                required_initial_payment = :rip,
                balance_due = :bal,
                quote_notes = :qn,
                quote_sent_at = NOW(),
                quote_decision = "pending",
                internal_production_cost = :ipc,
                due_date = :dd,
                updated_at = NOW()
             WHERE id = :id',
            [
                'pc' => $printingCharge,
                'fc' => $finishingCharge,
                'uc' => $urgentCharge,
                'da' => $discountAmount,
                'dc' => $deliveryCharge,
                'fda' => $freeDeliveryAuth ? 1 : 0,
                'dps' => $delPayStatus,
                'tot' => $totalAmount,
                'de' => $depositEnabled ? 1 : 0,
                'dp' => $depositPercent,
                'damt' => $depositAmount,
                'rip' => $reqInitial,
                'bal' => $balanceDue,
                'qn' => $quoteNotes ?: null,
                'ipc' => $internalCost,
                'dd' => $dueDate,
                'id' => $order['id'],
            ]
        );

        $this->printing->recordStatusHistory(
            $order['id'],
            $order['status'],
            'Quotation Sent',
            $actor,
            'Official quotation sent: Total ₦' . number_format($totalAmount, 2) . ($depositEnabled ? ' (Deposit option: ₦' . number_format($depositAmount, 2) . ')' : '')
        );

        $updated = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $order['id']]);
        if ($updated) {
            $depMsg = $depositEnabled
                ? ' Deposit option enabled: ₦' . number_format($depositAmount, 2) . '.'
                : '';
            $this->printing->notifyCustomerLifecycle(
                $updated,
                'Printing Quotation Ready',
                'Your quotation for "' . $updated['service_title'] . '" is ready: Total ₦' . number_format($totalAmount, 2) . " (Printing/Finishing: ₦" . number_format($printingCharge + $finishingCharge + $urgentCharge - $discountAmount, 2) . ", Delivery: ₦" . number_format($deliveryCharge, 2) . ").{$depMsg} Review and approve on your dashboard.",
                'info'
            );
        }

        Response::success([
            'order' => $updated ? $this->printing->formatOrderForAdmin($updated) : null,
        ], 'Quotation prepared and sent to customer.');
    }

    /**
     * POST /api/admin/printing/orders/:id/status
     */
    public function adminUpdateStatus(Request $request, array $params): void
    {
        $actor = $this->requirePrintingOps($request);
        $id = trim((string)($params['id'] ?? ''));
        $newStatus = trim((string)$request->input('status', ''));
        $note = trim((string)$request->input('note', ''));
        $trackingNote = trim((string)$request->input('tracking_note', ''));
        $refundToWallet = !empty($request->input('refund_to_wallet'));

        if (!in_array($newStatus, PrintingService::ORDER_STATUSES, true)) {
            Response::error('Invalid printing order status selected.', 422);
        }

        $order = $this->db->fetchOne(
            'SELECT * FROM printing_orders WHERE id = :id OR order_reference = :ref LIMIT 1',
            ['id' => $id, 'ref' => $id]
        );
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        // Enforce dispatch guard when marking Out for Delivery
        if ($newStatus === 'Out for Delivery') {
            try {
                $this->printing->assertDispatchAuthorized($order);
            } catch (RuntimeException $e) {
                Response::error($e->getMessage(), 409);
            }
        }

        $extraSql = '';
        $updateParams = ['st' => $newStatus, 'id' => $order['id']];
        if ($trackingNote !== '') {
            $extraSql .= ', tracking_note = :tn';
            $updateParams['tn'] = $trackingNote;
        }
        if ($newStatus === 'Completed') {
            $extraSql .= ', completed_at = NOW()';
        }

        if ($newStatus === 'Refunded') {
            $paid = (float)$order['amount_paid'];
            if ($paid > 0 && $refundToWallet && $order['payment_status'] !== 'refunded') {
                $refRef = 'PRT_REF_' . strtoupper(bin2hex(random_bytes(5)));
                $this->walletService->credit(
                    $order['user_id'],
                    $paid,
                    'printing_refund',
                    $refRef,
                    "Printing refund for {$order['order_reference']}",
                    'internal',
                    ['order_id' => $order['id'], 'refunded_by' => $actor['id']]
                );
                $this->db->execute('UPDATE printing_payments SET status = "refunded" WHERE order_id = :oid AND status = "confirmed"', ['oid' => $order['id']]);
            }
            $extraSql .= ', payment_status = "refunded"';
        }

        $this->db->execute("UPDATE printing_orders SET status = :st {$extraSql}, updated_at = NOW() WHERE id = :id", $updateParams);
        $this->printing->recordStatusHistory($order['id'], $order['status'], $newStatus, $actor, $note ?: "Status updated to {$newStatus}");

        $updated = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $order['id']]);
        if ($updated) {
            $notifMap = [
                'Under Review' => ['Printing Review Started', 'Our printing team is reviewing your files and job specifications.', 'info'],
                'Awaiting Quotation' => ['Quotation Being Prepared', 'Your job specs are verified and your quotation is being prepared.', 'info'],
                'Payment Confirmed' => ['Payment Confirmed', 'Your payment has been confirmed. Job is queued for production.', 'success'],
                'Processing' => ['Printing Production Started', 'Your printing job is now actively in production.', 'info'],
                'On Hold' => ['Printing Job On Hold', $note ?: 'Your job has been placed on hold pending clarification.', 'warning'],
                'Ready for Collection' => ['Ready for Office Collection', 'Great news! Your print job is complete and ready for collection at our main office.', 'success'],
                'Ready for Dispatch' => ['Ready for Delivery Dispatch', 'Your print job is packaged and queued for Lagos dispatch.', 'success'],
                'Out for Delivery' => ['Order Out for Delivery', $trackingNote ?: 'Your printing order is out for delivery to your Lagos address.', 'info'],
                'Completed' => ['Printing Order Completed', 'Your printing order has been marked Completed. Thank you for choosing HambakTech!', 'success'],
                'Rejected' => ['Printing Request Rejected', $note ?: 'Your printing request could not be processed.', 'alert'],
                'Cancelled' => ['Printing Order Cancelled', $note ?: 'Your printing order has been cancelled.', 'warning'],
                'Refunded' => ['Printing Payment Refunded', $note ?: 'A refund has been processed for your printing order.', 'info'],
            ];
            if (isset($notifMap[$newStatus])) {
                [$title, $msg, $nType] = $notifMap[$newStatus];
                $this->printing->notifyCustomerLifecycle($updated, $title, $msg, $nType);
            }
        }

        Response::success([
            'order' => $updated ? $this->printing->formatOrderForAdmin($updated) : null,
        ], "Order status updated to {$newStatus}.");
    }

    /**
     * POST /api/admin/printing/orders/:id/assign
     */
    public function adminAssignStaff(Request $request, array $params): void
    {
        $actor = $this->requirePrintingOps($request);
        $id = trim((string)($params['id'] ?? ''));
        $staffId = trim((string)$request->input('staff_id', ''));

        $order = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id OR order_reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $staff = null;
        if ($staffId !== '') {
            $staff = $this->db->fetchOne('SELECT id, full_name, email, role FROM users WHERE id = :id AND role IN ("admin","superadmin") AND status = "active" LIMIT 1', ['id' => $staffId]);
            if (!$staff) {
                Response::notFound('Selected active staff member not found.');
            }
        }

        $this->db->execute(
            'UPDATE printing_orders SET assigned_staff_id = :sid, assigned_staff_name = :sname, updated_at = NOW() WHERE id = :id',
            [
                'sid' => $staff ? $staff['id'] : null,
                'sname' => $staff ? $staff['full_name'] : null,
                'id' => $order['id'],
            ]
        );

        $this->printing->recordStatusHistory(
            $order['id'],
            $order['status'],
            $order['status'],
            $actor,
            $staff ? "Assigned printing job to {$staff['full_name']}" : 'Unassigned staff from job'
        );

        if ($staff && $staff['id'] !== $actor['id']) {
            try {
                $this->db->execute(
                    'INSERT INTO notifications (id, user_id, title, message, type, is_read, action_link, created_at)
                     VALUES (:id, :uid, :title, :msg, "info", 0, :link, NOW())',
                    [
                        'id' => Security::generateUuid(),
                        'uid' => $staff['id'],
                        'title' => "Printing Job Assigned: {$order['order_reference']}",
                        'msg' => "You have been assigned {$order['order_reference']} ({$order['service_title']}) by {$actor['full_name']}.",
                        'link' => '#printing?order=' . urlencode($order['order_reference']),
                    ]
                );
            } catch (Throwable) {
            }
        }

        $updated = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $order['id']]);
        Response::success(['order' => $updated ? $this->printing->formatOrderForAdmin($updated) : null], 'Staff assignment updated.');
    }

    /**
     * POST /api/admin/printing/orders/:id/confirm-dispatch
     */
    public function adminConfirmDispatch(Request $request, array $params): void
    {
        $actor = $this->requirePrintingOps($request);
        $id = trim((string)($params['id'] ?? ''));
        $trackingNote = trim((string)$request->input('tracking_note', 'Dispatched from HambakTech Printing Desk'));
        $moveToOut = !empty($request->input('mark_out_for_delivery', true));

        $order = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id OR order_reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        // Check financial settlement BEFORE confirming dispatch
        $orderPreview = $order;
        $orderPreview['dispatch_confirmed'] = 1;
        try {
            $this->printing->assertDispatchAuthorized($orderPreview);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 409);
        }

        $targetStatus = $moveToOut ? 'Out for Delivery' : $order['status'];
        $this->db->execute(
            'UPDATE printing_orders
             SET dispatch_confirmed = 1, dispatch_confirmed_by = :cb, dispatch_confirmed_by_name = :cbn,
                 dispatch_confirmed_at = NOW(), tracking_note = :tn, status = :st, updated_at = NOW()
             WHERE id = :id',
            [
                'cb' => $actor['id'],
                'cbn' => $actor['full_name'] ?? $actor['email'],
                'tn' => $trackingNote,
                'st' => $targetStatus,
                'id' => $order['id'],
            ]
        );

        $this->printing->recordStatusHistory($order['id'], $order['status'], $targetStatus, $actor, "Dispatch confirmed: {$trackingNote}");
        $updated = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $order['id']]);
        if ($updated) {
            $this->printing->notifyCustomerLifecycle(
                $updated,
                $moveToOut ? 'Printing Order Out for Delivery' : 'Dispatch Confirmed',
                "{$trackingNote}. Destination: " . ($updated['delivery_lga_lcda'] ?: 'Lagos'),
                'info'
            );
        }

        Response::success(['order' => $updated ? $this->printing->formatOrderForAdmin($updated) : null], 'Dispatch confirmed.');
    }

    /**
     * POST /api/admin/printing/orders/:id/payments
     * Allows admin to confirm full/deposit/balance/delivery payment (including cash/POS/bank).
     */
    public function adminRecordPayment(Request $request, array $params): void
    {
        $actor = $this->requirePrintingOps($request);
        $id = trim((string)($params['id'] ?? ''));
        $body = $request->all();

        $order = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id OR order_reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $amount = round((float)($body['amount'] ?? 0), 2);
        $scope = strtolower(trim((string)($body['payment_scope'] ?? 'full')));
        $gateway = strtolower(trim((string)($body['gateway'] ?? 'manual_transfer')));
        $remarks = trim((string)($body['remarks'] ?? 'Recorded by admin'));

        if ($amount <= 0) {
            Response::error('Payment amount must be greater than zero.', 422);
        }
        if (!in_array($scope, ['full', 'deposit', 'balance', 'delivery'], true)) $scope = 'full';
        if (!in_array($gateway, ['wallet', 'paystack', 'flutterwave', 'manual_transfer', 'cash', 'pos'], true)) $gateway = 'cash';

        $payId = Security::generateUuid();
        $ref = trim((string)($body['reference'] ?? '')) ?: ('PRTADM_' . strtoupper(bin2hex(random_bytes(5))));

        $this->db->execute(
            'INSERT INTO printing_payments
             (id, order_id, user_id, reference, payment_scope, gateway, amount, status, payer_name, bank_reference, remarks, confirmed_by, confirmed_by_name, confirmed_at, created_at)
             VALUES (:id, :oid, :uid, :ref, :scope, :gw, :amt, "confirmed", :pname, :bref, :rem, :cb, :cbn, NOW(), NOW())',
            [
                'id' => $payId,
                'oid' => $order['id'],
                'uid' => $order['user_id'],
                'ref' => $ref,
                'scope' => $scope,
                'gw' => $gateway,
                'amt' => $amount,
                'pname' => $order['customer_name'],
                'bref' => $ref,
                'rem' => $remarks,
                'cb' => $actor['id'],
                'cbn' => $actor['full_name'] ?? $actor['email'],
            ]
        );

        $updated = $this->applyConfirmedPayment($order, $amount, $scope, $actor, "Admin confirmed {$gateway} payment ({$ref})");
        Response::success(['order' => $this->printing->formatOrderForAdmin($updated)], 'Payment recorded and confirmed.');
    }

    /**
     * POST /api/admin/printing/payments/:pid/review
     */
    public function adminReviewPayment(Request $request, array $params): void
    {
        $actor = $this->requirePrintingOps($request);
        $pid = trim((string)($params['pid'] ?? ''));
        $action = strtolower(trim((string)$request->input('action', '')));
        $remarks = trim((string)$request->input('remarks', ''));

        if (!in_array($action, ['confirm', 'approve', 'reject'], true)) {
            Response::error('Action must be confirm or reject.', 422);
        }

        $payment = $this->db->fetchOne('SELECT * FROM printing_payments WHERE id = :id LIMIT 1', ['id' => $pid]);
        if (!$payment) {
            Response::notFound('Printing payment record not found.');
        }
        if ($payment['status'] !== 'pending') {
            Response::error("Payment is already '{$payment['status']}'.", 409);
        }

        $order = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $payment['order_id']]);
        if (!$order) {
            Response::notFound('Associated printing order not found.');
        }

        if ($action === 'reject') {
            $this->db->execute(
                'UPDATE printing_payments SET status = "rejected", remarks = :rem, confirmed_by = :cb, confirmed_by_name = :cbn, confirmed_at = NOW() WHERE id = :id',
                [
                    'rem' => $remarks ?: 'Transfer could not be verified.',
                    'cb' => $actor['id'],
                    'cbn' => $actor['full_name'] ?? $actor['email'],
                    'id' => $payment['id'],
                ]
            );
            $this->printing->notifyCustomerLifecycle(
                $order,
                'Printing Payment Rejected',
                "Your payment proof ({$payment['reference']}) of ₦" . number_format((float)$payment['amount'], 2) . ' was rejected. Reason: ' . ($remarks ?: 'Unverified transfer'),
                'alert'
            );
            Response::success(null, 'Payment rejected.');
            return;
        }

        $this->db->execute(
            'UPDATE printing_payments SET status = "confirmed", remarks = :rem, confirmed_by = :cb, confirmed_by_name = :cbn, confirmed_at = NOW() WHERE id = :id',
            [
                'rem' => $remarks ?: 'Verified & confirmed by finance/printing desk',
                'cb' => $actor['id'],
                'cbn' => $actor['full_name'] ?? $actor['email'],
                'id' => $payment['id'],
            ]
        );

        $updated = $this->applyConfirmedPayment(
            $order,
            (float)$payment['amount'],
            (string)$payment['payment_scope'],
            $actor,
            "Confirmed transfer payment ({$payment['reference']})"
        );
        Response::success(['order' => $this->printing->formatOrderForAdmin($updated)], 'Printing payment confirmed!');
    }

    /**
     * GET /api/admin/printing/payments
     */
    public function adminListPayments(Request $request): void
    {
        $this->requirePrintingOps($request);

        $rows = $this->db->fetchAll(
            'SELECT p.*, o.order_reference, o.customer_name, o.customer_email, o.service_title
             FROM printing_payments p
             LEFT JOIN printing_orders o ON p.order_id = o.id
             ORDER BY p.created_at DESC LIMIT 250'
        );
        foreach ($rows as &$r) {
            $r['amount'] = (float)$r['amount'];
        }
        Response::success(['payments' => $rows]);
    }

    /**
     * POST /api/admin/printing/orders/:id/messages
     */
    public function adminSendMessage(Request $request, array $params): void
    {
        $actor = $this->requirePrintingOps($request);
        $id = trim((string)($params['id'] ?? ''));
        $message = trim((string)$request->input('message', ''));
        $isInternal = !empty($request->input('is_internal'));

        if ($message === '') {
            Response::error('Message cannot be empty.', 422);
        }

        $order = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id OR order_reference = :ref LIMIT 1', ['id' => $id, 'ref' => $id]);
        if (!$order) {
            Response::notFound('Printing order not found.');
        }

        $msgId = Security::generateUuid();
        $this->db->execute(
            'INSERT INTO printing_order_messages (id, order_id, sender_id, sender_name, sender_role, message, is_internal, created_at)
             VALUES (:id, :oid, :sid, :sname, :srole, :msg, :intr, NOW())',
            [
                'id' => $msgId,
                'oid' => $order['id'],
                'sid' => $actor['id'],
                'sname' => $actor['full_name'] ?? $actor['email'],
                'srole' => $actor['role'] ?? 'admin',
                'msg' => $message,
                'intr' => $isInternal ? 1 : 0,
            ]
        );

        if (!$isInternal) {
            $this->printing->notifyCustomerLifecycle(
                $order,
                'New Message from Printing Desk',
                $message,
                'info'
            );
        }

        Response::success([
            'id' => $msgId,
            'is_internal' => $isInternal,
            'message' => $message,
        ], $isInternal ? 'Internal note added.' : 'Reply sent to customer.', 201);
    }

    /**
     * GET /api/admin/printing/reports
     */
    public function adminReports(Request $request): void
    {
        $this->requirePrintingOps($request);

        $catStats = $this->db->fetchAll(
            'SELECT category_key, category_name,
                    COUNT(*) as order_count,
                    COALESCE(SUM(total_amount), 0) as quoted_total,
                    COALESCE(SUM(amount_paid), 0) as collected_total,
                    COALESCE(SUM(delivery_charge), 0) as delivery_total,
                    COALESCE(SUM(internal_production_cost), 0) as internal_cost_total
             FROM printing_orders
             WHERE status NOT IN ("Rejected", "Cancelled", "Refunded")
             GROUP BY category_key, category_name'
        );
        foreach ($catStats as &$cs) {
            $cs['order_count'] = (int)$cs['order_count'];
            $cs['quoted_total'] = (float)$cs['quoted_total'];
            $cs['collected_total'] = (float)$cs['collected_total'];
            $cs['delivery_total'] = (float)$cs['delivery_total'];
            $cs['internal_cost_total'] = (float)$cs['internal_cost_total'];
            $cs['margin'] = round($cs['quoted_total'] - $cs['internal_cost_total'], 2);
        }

        $staffStats = $this->db->fetchAll(
            'SELECT COALESCE(assigned_staff_name, "Unassigned") as staff_name,
                    COUNT(*) as total_jobs,
                    SUM(CASE WHEN status = "Completed" THEN 1 ELSE 0 END) as completed_jobs
             FROM printing_orders
             GROUP BY assigned_staff_name'
        );

        Response::success([
            'by_category' => $catStats,
            'by_staff' => $staffStats,
        ]);
    }

    /**
     * GET /api/admin/printing/staff-list
     */
    public function adminStaffList(Request $request): void
    {
        $this->requirePrintingOps($request);
        $rows = $this->db->fetchAll(
            'SELECT u.id, u.full_name, u.email, u.role, up.assigned_permissions
             FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             WHERE u.role IN ("superadmin", "admin") AND u.status = "active"
             ORDER BY u.full_name ASC'
        );
        $staff = [];
        foreach ($rows as $r) {
            $perms = !empty($r['assigned_permissions']) ? json_decode((string)$r['assigned_permissions'], true) : [];
            if ($r['role'] === 'superadmin' || (is_array($perms) && (in_array('*', $perms, true) || in_array('printing', $perms, true)))) {
                $staff[] = [
                    'id' => $r['id'],
                    'full_name' => $r['full_name'],
                    'email' => $r['email'],
                    'role' => $r['role'],
                ];
            }
        }
        Response::success(['staff' => $staff]);
    }

    // =========================================================================
    // C. ADMIN PRICING & DELIVERY ZONE CONFIGURATION (printing_pricing scope)
    // =========================================================================

    /**
     * GET /api/admin/printing/categories
     */
    public function adminCategories(Request $request): void
    {
        $this->requirePrintingRead($request);
        $rows = $this->db->fetchAll('SELECT * FROM printing_service_categories ORDER BY display_order ASC, name ASC');
        $categories = array_map(fn($r) => $this->printing->decodeCategory($r, true), $rows);
        Response::success(['categories' => $categories]);
    }

    /**
     * POST /api/admin/printing/categories and PUT /api/admin/printing/categories/:id
     */
    public function adminSaveCategory(Request $request, array $params = []): void
    {
        $actor = $this->requirePrintingPricing($request);
        $id = trim((string)($params['id'] ?? $request->input('id', '')));
        $body = $request->all();

        $existing = $id !== ''
            ? $this->db->fetchOne('SELECT * FROM printing_service_categories WHERE id = :id OR category_key = :ck LIMIT 1', ['id' => $id, 'ck' => $id])
            : null;

        if (!$existing && empty($body['name'])) {
            Response::error('Category name is required.', 422);
        }

        $catId = $existing ? $existing['id'] : Security::generateUuid();
        $catKey = $existing
            ? $existing['category_key']
            : (trim((string)($body['category_key'] ?? '')) ?: strtolower((string)preg_replace('/[^a-zA-Z0-9]+/', '_', (string)$body['name'])));

        $data = [
            'id' => $catId,
            'name' => trim((string)($body['name'] ?? ($existing['name'] ?? ''))),
            'description' => trim((string)($body['description'] ?? ($existing['description'] ?? ''))),
            'pricing_mode' => trim((string)($body['pricing_mode'] ?? ($existing['pricing_mode'] ?? 'per_page'))),
            'measurement_method' => trim((string)($body['measurement_method'] ?? ($existing['measurement_method'] ?? 'per_page'))),
            'unit_label' => trim((string)($body['unit_label'] ?? ($existing['unit_label'] ?? 'unit'))),
            'base_rate' => max(0.0, (float)($body['base_rate'] ?? ($existing['base_rate'] ?? 0))),
            'bw_rate' => max(0.0, (float)($body['bw_rate'] ?? ($existing['bw_rate'] ?? 0))),
            'color_rate' => max(0.0, (float)($body['color_rate'] ?? ($existing['color_rate'] ?? 0))),
            'min_quantity' => max(1, (int)($body['min_quantity'] ?? ($existing['min_quantity'] ?? 1))),
            'urgent_fee_type' => in_array(($body['urgent_fee_type'] ?? ($existing['urgent_fee_type'] ?? 'percent')), ['flat', 'percent'], true)
                ? (string)($body['urgent_fee_type'] ?? ($existing['urgent_fee_type'] ?? 'percent'))
                : 'percent',
            'urgent_fee_value' => max(0.0, (float)($body['urgent_fee_value'] ?? ($existing['urgent_fee_value'] ?? 25))),
            'paper_sizes' => json_encode($body['paper_sizes'] ?? (isset($existing['paper_sizes']) ? json_decode((string)$existing['paper_sizes'], true) : [])),
            'size_rates' => json_encode($body['size_rates'] ?? (isset($existing['size_rates']) ? json_decode((string)$existing['size_rates'], true) : [])),
            'finishing_options' => json_encode($body['finishing_options'] ?? (isset($existing['finishing_options']) ? json_decode((string)$existing['finishing_options'], true) : [])),
            'bulk_discounts' => json_encode($body['bulk_discounts'] ?? (isset($existing['bulk_discounts']) ? json_decode((string)$existing['bulk_discounts'], true) : [])),
            'requires_manual_quote' => array_key_exists('requires_manual_quote', $body) ? ($body['requires_manual_quote'] ? 1 : 0) : (int)($existing['requires_manual_quote'] ?? 1),
            'internal_cost_estimate' => max(0.0, (float)($body['internal_cost_estimate'] ?? ($existing['internal_cost_estimate'] ?? 0))),
            'is_active' => array_key_exists('is_active', $body) ? ($body['is_active'] ? 1 : 0) : (int)($existing['is_active'] ?? 1),
            'display_order' => (int)($body['display_order'] ?? ($existing['display_order'] ?? 10)),
        ];

        if ($existing) {
            $this->db->execute(
                'UPDATE printing_service_categories SET
                    name = :name, description = :description, pricing_mode = :pricing_mode,
                    measurement_method = :measurement_method, unit_label = :unit_label,
                    base_rate = :base_rate, bw_rate = :bw_rate, color_rate = :color_rate,
                    min_quantity = :min_quantity, urgent_fee_type = :urgent_fee_type, urgent_fee_value = :urgent_fee_value,
                    paper_sizes = :paper_sizes, size_rates = :size_rates, finishing_options = :finishing_options,
                    bulk_discounts = :bulk_discounts, requires_manual_quote = :requires_manual_quote,
                    internal_cost_estimate = :internal_cost_estimate, is_active = :is_active,
                    display_order = :display_order, updated_at = NOW()
                 WHERE id = :id',
                $data
            );
        } else {
            $data['category_key'] = $catKey;
            $data['icon'] = trim((string)($body['icon'] ?? 'Printer'));
            $data['field_schema'] = json_encode($body['field_schema'] ?? []);
            $this->db->execute(
                'INSERT INTO printing_service_categories
                 (id, category_key, name, description, icon, pricing_mode, measurement_method, unit_label, base_rate, bw_rate, color_rate, min_quantity, urgent_fee_type, urgent_fee_value, paper_sizes, size_rates, finishing_options, bulk_discounts, field_schema, requires_manual_quote, internal_cost_estimate, is_active, display_order)
                 VALUES
                 (:id, :category_key, :name, :description, :icon, :pricing_mode, :measurement_method, :unit_label, :base_rate, :bw_rate, :color_rate, :min_quantity, :urgent_fee_type, :urgent_fee_value, :paper_sizes, :size_rates, :finishing_options, :bulk_discounts, :field_schema, :requires_manual_quote, :internal_cost_estimate, :is_active, :display_order)',
                $data
            );
        }

        FootprintService::record([
            'user_id' => $actor['id'],
            'user_email' => $actor['email'] ?? null,
            'category' => 'admin',
            'action' => 'PRINTING_CATEGORY_UPDATED',
            'reference' => $catKey,
            'status' => 'successful',
        ]);

        $saved = $this->db->fetchOne('SELECT * FROM printing_service_categories WHERE id = :id LIMIT 1', ['id' => $catId]);
        Response::success(['category' => $saved ? $this->printing->decodeCategory($saved, true) : null], 'Printing service pricing saved.');
    }

    /**
     * GET /api/admin/printing/delivery-zones
     */
    public function adminDeliveryZones(Request $request): void
    {
        $this->requirePrintingRead($request);
        $rows = $this->db->fetchAll('SELECT * FROM printing_delivery_zones ORDER BY display_order ASC, destination_group ASC');
        $zones = array_map(fn($r) => $this->printing->decodeZone($r), $rows);
        Response::success(['zones' => $zones]);
    }

    /**
     * POST /api/admin/printing/delivery-zones and PUT /api/admin/printing/delivery-zones/:id
     */
    public function adminSaveDeliveryZone(Request $request, array $params = []): void
    {
        $this->requirePrintingPricing($request);
        $id = trim((string)($params['id'] ?? $request->input('id', '')));
        $body = $request->all();

        $existing = $id !== ''
            ? $this->db->fetchOne('SELECT * FROM printing_delivery_zones WHERE id = :id LIMIT 1', ['id' => $id])
            : null;

        if (!$existing && (empty($body['destination_group']) || empty($body['lga_lcda']))) {
            Response::error('Destination group and Lagos LGA/LCDA are required.', 422);
        }

        $zoneId = $existing ? $existing['id'] : Security::generateUuid();
        $zoneKey = $existing
            ? $existing['zone_key']
            : (trim((string)($body['zone_key'] ?? '')) ?: 'zone_' . bin2hex(random_bytes(4)));

        $pMode = (string)($body['pricing_mode'] ?? ($existing['pricing_mode'] ?? 'fixed'));
        if (!in_array($pMode, ['fixed', 'manual_quote', 'free'], true)) $pMode = 'fixed';

        $data = [
            'id' => $zoneId,
            'destination_group' => trim((string)($body['destination_group'] ?? ($existing['destination_group'] ?? ''))),
            'lga_lcda' => trim((string)($body['lga_lcda'] ?? ($existing['lga_lcda'] ?? ''))),
            'towns_covered' => trim((string)($body['towns_covered'] ?? ($existing['towns_covered'] ?? ''))),
            'pricing_mode' => $pMode,
            'fixed_fee' => max(0.0, (float)($body['fixed_fee'] ?? ($existing['fixed_fee'] ?? 0))),
            'free_delivery_enabled' => array_key_exists('free_delivery_enabled', $body) ? ($body['free_delivery_enabled'] ? 1 : 0) : (int)($existing['free_delivery_enabled'] ?? 0),
            'free_delivery_min_order' => max(0.0, (float)($body['free_delivery_min_order'] ?? ($existing['free_delivery_min_order'] ?? 0))),
            'estimated_eta' => trim((string)($body['estimated_eta'] ?? ($existing['estimated_eta'] ?? 'Same Day / Next Business Day'))),
            'is_active' => array_key_exists('is_active', $body) ? ($body['is_active'] ? 1 : 0) : (int)($existing['is_active'] ?? 1),
            'display_order' => (int)($body['display_order'] ?? ($existing['display_order'] ?? 10)),
        ];

        if ($existing) {
            $this->db->execute(
                'UPDATE printing_delivery_zones SET
                    destination_group = :destination_group, lga_lcda = :lga_lcda, towns_covered = :towns_covered,
                    pricing_mode = :pricing_mode, fixed_fee = :fixed_fee,
                    free_delivery_enabled = :free_delivery_enabled, free_delivery_min_order = :free_delivery_min_order,
                    estimated_eta = :estimated_eta, is_active = :is_active, display_order = :display_order, updated_at = NOW()
                 WHERE id = :id',
                $data
            );
        } else {
            $data['zone_key'] = $zoneKey;
            $this->db->execute(
                'INSERT INTO printing_delivery_zones
                 (id, zone_key, destination_group, lga_lcda, towns_covered, pricing_mode, fixed_fee, free_delivery_enabled, free_delivery_min_order, estimated_eta, is_active, display_order)
                 VALUES (:id, :zone_key, :destination_group, :lga_lcda, :towns_covered, :pricing_mode, :fixed_fee, :free_delivery_enabled, :free_delivery_min_order, :estimated_eta, :is_active, :display_order)',
                $data
            );
        }

        $saved = $this->db->fetchOne('SELECT * FROM printing_delivery_zones WHERE id = :id LIMIT 1', ['id' => $zoneId]);
        Response::success(['zone' => $saved ? $this->printing->decodeZone($saved) : null], 'Delivery zone saved.');
    }

    /**
     * GET / PUT /api/admin/printing/settings
     */
    public function adminSettings(Request $request): void
    {
        if ($request->getMethod() === 'GET') {
            $this->requirePrintingRead($request);
            Response::success(['settings' => $this->printing->getSettings()]);
            return;
        }
        $this->requirePrintingPricing($request);
        $updated = $this->printing->saveSettings($request->all());
        Response::success(['settings' => $updated], 'Printing module settings saved.');
    }

    // =========================================================================
    // D. INTERNAL FINANCIAL SETTLEMENT HELPER
    // =========================================================================

    private function applyConfirmedPayment(array $order, float $amountPaidNow, string $scope, array $actor, string $historyNote): array
    {
        $total = (float)$order['total_amount'];
        $newPaid = round((float)$order['amount_paid'] + $amountPaidNow, 2);
        $newBalance = max(0.0, round($total - $newPaid, 2));

        $depositEnabled = !empty($order['deposit_enabled']);
        $reqInitial = $depositEnabled ? (float)($order['deposit_amount'] ?? $total) : $total;

        $payStatus = 'partially_paid';
        if ($newBalance <= 0.01) {
            $payStatus = 'paid';
        } elseif ($depositEnabled && $newPaid + 0.01 >= $reqInitial) {
            $payStatus = 'deposit_paid';
        }

        $delPayStatus = (string)$order['delivery_payment_status'];
        if ($order['collection_method'] === 'paid_delivery') {
            if (!empty($order['free_delivery_authorized']) || (float)$order['delivery_charge'] <= 0) {
                $delPayStatus = 'free_authorized';
            } elseif ($newBalance <= 0.01 || $scope === 'delivery') {
                $delPayStatus = 'paid';
            }
        }

        $oldStatus = (string)$order['status'];
        $newStatus = $oldStatus;
        $preProdStatuses = ['Quotation Sent', 'Awaiting Payment'];
        if (in_array($oldStatus, $preProdStatuses, true) && ($payStatus === 'paid' || $payStatus === 'deposit_paid')) {
            $newStatus = 'Payment Confirmed';
        }

        $this->db->execute(
            'UPDATE printing_orders
             SET amount_paid = :paid, balance_due = :bal, payment_status = :ps,
                 delivery_payment_status = :dps, status = :st, quote_decision = "approved", updated_at = NOW()
             WHERE id = :id',
            [
                'paid' => $newPaid,
                'bal' => $newBalance,
                'ps' => $payStatus,
                'dps' => $delPayStatus,
                'st' => $newStatus,
                'id' => $order['id'],
            ]
        );

        $this->printing->recordStatusHistory($order['id'], $oldStatus, $newStatus, $actor, $historyNote);

        $updated = $this->db->fetchOne('SELECT * FROM printing_orders WHERE id = :id LIMIT 1', ['id' => $order['id']]);
        if ($updated) {
            $this->printing->notifyCustomerLifecycle(
                $updated,
                'Printing Payment Confirmed',
                'Payment of ₦' . number_format($amountPaidNow, 2) . ' has been confirmed.' . ($newBalance > 0 ? ' Remaining balance: ₦' . number_format($newBalance, 2) . '.' : ' Your order is paid in full and ready for production.'),
                'success'
            );
            $this->printing->notifyPrintingAdmins(
                "Payment Confirmed: {$updated['order_reference']}",
                "₦" . number_format($amountPaidNow, 2) . " confirmed for {$updated['customer_name']} ({$updated['order_reference']}).",
                $updated['order_reference']
            );
        }

        return $updated ?: $order;
    }
}
