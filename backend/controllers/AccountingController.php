<?php
/**
 * @file AccountingController.php
 * REST API Controller for HAMBAKTECH Integrated Business Management & Accounting (11 Modules).
 */

declare(strict_types=1);

namespace HambakTech\Controllers;

use HambakTech\Core\Auth;
use HambakTech\Core\Database;
use HambakTech\Core\Request;
use HambakTech\Core\Response;
use HambakTech\Services\AccountingService;
use Throwable;

class AccountingController
{
    private Database $db;
    private AccountingService $service;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->service = new AccountingService($this->db);
    }

    private function authorizeAny(Request $request, array $acceptedPerms): array
    {
        $user = Auth::requireRole($request, ['admin', 'superadmin']);
        if (($user['role'] ?? '') === 'superadmin') {
            return $user;
        }
        $perms = is_array($user['permissions'] ?? null) ? $user['permissions'] : [];
        if (in_array('*', $perms, true)) {
            return $user;
        }
        foreach ($acceptedPerms as $p) {
            if (in_array($p, $perms, true)) {
                return $user;
            }
        }
        Response::forbidden('Access denied. Missing required accounting permission (' . implode(' or ', $acceptedPerms) . ').');
        return $user;
    }

    private function authorizeSensitiveAdjustment(Request $request): array
    {
        $cfg = $this->service->getConfig();
        if (!empty($cfg['restrict_reversals_to_superadmin'])) {
            return Auth::requireSuperAdmin($request);
        }
        return $this->authorizeAny($request, ['accounting_adjust', 'accounting']);
    }

    private function authorizeConfigWrite(Request $request): array
    {
        $cfg = $this->service->getConfig();
        if (!empty($cfg['restrict_config_to_superadmin'])) {
            return Auth::requireSuperAdmin($request);
        }
        return $this->authorizeAny($request, ['accounting_config', 'accounting']);
    }

    // 1. Financial Overview Dashboard
    public function overview(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'reports']);
        try {
            $dateFrom = $request->query('date_from') ? (string)$request->query('date_from') : null;
            $dateTo = $request->query('date_to') ? (string)$request->query('date_to') : null;
            $data = $this->service->getOverview($dateFrom, $dateTo);
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 2. Manual/Full Website Transaction Sync & Report
    public function syncWebsite(Request $request): void
    {
        $this->authorizeAny($request, ['accounting']);
        try {
            $force = !empty($request->input('force', false));
            $res = $this->service->syncWebsiteTransactions($force);
            Response::success($res, 'Website transactions synchronized with accounting ledger.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function websiteTransactions(Request $request): void
    {
        $this->authorizeAny($request, ['accounting']);
        try {
            $filters = [
                'date_from' => $request->query('date_from'),
                'date_to' => $request->query('date_to'),
                'entry_category' => $request->query('entry_category', 'all'),
                'service_domain' => $request->query('service_domain', 'all'),
                'search' => $request->query('search', ''),
                'limit' => $request->query('limit', 150),
            ];
            $data = $this->service->getWebsiteTransactionsReport($filters);
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 3. Customer Wallet & Liability Monitoring
    public function walletLiabilities(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'wallet']);
        try {
            $data = $this->service->getWalletLiabilitySummary();
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 4. Income & Expense Management
    public function listExpensesIncome(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'accounting_physical']);
        try {
            $data = $this->service->listExpensesIncome([
                'date_from' => $request->query('date_from'),
                'date_to' => $request->query('date_to'),
                'record_type' => $request->query('record_type', 'all'),
                'category' => $request->query('category', 'all'),
                'status' => $request->query('status', 'all'),
            ]);
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function createExpenseOrIncome(Request $request): void
    {
        $actor = $this->authorizeAny($request, ['accounting', 'accounting_physical']);
        try {
            $record = $this->service->createExpenseOrIncome($request->getBody(), $actor);
            Response::success(['record' => $record], 'Accounting voucher recorded successfully.', 201);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function voidExpenseOrIncome(Request $request, array $params): void
    {
        $actor = $this->authorizeSensitiveAdjustment($request);
        try {
            $id = (string)($params['id'] ?? '');
            $reason = (string)$request->input('reason', 'Voided by administrator');
            $record = $this->service->voidExpenseOrIncome($id, $reason, $actor);
            Response::success(['record' => $record], 'Voucher voided and reversed in ledger.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 5. Physical Business Sales & Receptionist Records
    public function listPhysicalSales(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'accounting_physical']);
        try {
            $data = $this->service->listPhysicalSales([
                'date_from' => $request->query('date_from'),
                'date_to' => $request->query('date_to'),
                'service_category' => $request->query('service_category', 'all'),
                'payment_mode' => $request->query('payment_mode', 'all'),
                'status' => $request->query('status', 'all'),
                'search' => $request->query('search', ''),
            ]);
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function createPhysicalSale(Request $request): void
    {
        $actor = $this->authorizeAny($request, ['accounting', 'accounting_physical']);
        try {
            $sale = $this->service->createPhysicalSale($request->getBody(), $actor);
            Response::success(['sale' => $sale], 'Physical business sale recorded.', 201);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function voidPhysicalSale(Request $request, array $params): void
    {
        $actor = $this->authorizeSensitiveAdjustment($request);
        try {
            $id = (string)($params['id'] ?? '');
            $reason = (string)$request->input('reason', 'Voided by administrator');
            $sale = $this->service->voidPhysicalSale($id, $reason, $actor);
            Response::success(['sale' => $sale], 'Physical sale voided cleanly.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 6. Inventory & Purchase Accounting
    public function inventoryOverview(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'accounting_physical', 'accounting_reconcile']);
        try {
            Response::success($this->service->getInventoryOverview());
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function saveInventoryItem(Request $request, array $params = []): void
    {
        $actor = $this->authorizeAny($request, ['accounting', 'accounting_reconcile']);
        try {
            $id = !empty($params['id']) ? (string)$params['id'] : null;
            $item = $this->service->saveInventoryItem($request->getBody(), $actor, $id);
            Response::success(['item' => $item], $id ? 'Inventory item updated.' : 'Inventory item created.', $id ? 200 : 201);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function recordInventoryMovement(Request $request): void
    {
        $actor = $this->authorizeAny($request, ['accounting', 'accounting_reconcile', 'accounting_physical']);
        try {
            $res = $this->service->recordInventoryPurchaseOrUsage($request->getBody(), $actor);
            Response::success($res, 'Inventory movement and cost entry recorded.', 201);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    // 7. Cash, POS & Bank Reconciliation
    public function listReconciliations(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'accounting_reconcile']);
        try {
            $data = $this->service->listReconciliations(
                $request->query('date_from') ? (string)$request->query('date_from') : null,
                $request->query('date_to') ? (string)$request->query('date_to') : null
            );
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function previewReconciliation(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'accounting_reconcile']);
        try {
            $date = (string)$request->query('date', $this->service->lagosNow()->format('Y-m-d'));
            $accountCode = (string)$request->query('account_code', 'CASH_DRAWER');
            Response::success($this->service->previewReconciliation($date, $accountCode));
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function submitReconciliation(Request $request): void
    {
        $actor = $this->authorizeAny($request, ['accounting', 'accounting_reconcile']);
        try {
            $rec = $this->service->submitReconciliation($request->getBody(), $actor);
            Response::success(['reconciliation' => $rec], 'Channel reconciliation saved.', 201);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function approveReconciliation(Request $request, array $params): void
    {
        $actor = $this->authorizeSensitiveAdjustment($request);
        try {
            $rec = $this->service->approveReconciliation((string)($params['id'] ?? ''), $actor);
            Response::success(['reconciliation' => $rec], 'Reconciliation approved.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 8. Accounting Ledger & Export
    public function ledger(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'accounting_reconcile']);
        try {
            $data = $this->service->getLedger([
                'date_from' => $request->query('date_from'),
                'date_to' => $request->query('date_to'),
                'source_origin' => $request->query('source_origin', 'all'),
                'entry_category' => $request->query('entry_category', 'all'),
                'payment_channel' => $request->query('payment_channel', 'all'),
                'reconciliation_status' => $request->query('reconciliation_status', 'all'),
                'search' => $request->query('search', ''),
                'limit' => $request->query('limit', 250),
            ]);
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function exportLedgerCsv(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'reports']);
        try {
            $data = $this->service->getLedger([
                'date_from' => $request->query('date_from'),
                'date_to' => $request->query('date_to'),
                'source_origin' => $request->query('source_origin', 'all'),
                'entry_category' => $request->query('entry_category', 'all'),
                'payment_channel' => $request->query('payment_channel', 'all'),
                'reconciliation_status' => $request->query('reconciliation_status', 'all'),
                'search' => $request->query('search', ''),
                'limit' => 2000,
            ]);

            $filename = 'hambaktech_accounting_ledger_' . ($data['period']['date_from'] ?? date('Y-m-d')) . '_to_' . ($data['period']['date_to'] ?? date('Y-m-d')) . '.csv';
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Cache-Control: no-store, no-cache, must-revalidate');

            $out = fopen('php://output', 'w');
            if ($out === false) {
                Response::error('Failed to open export stream.', 500);
            }
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [
                'Entry Number',
                'Lagos Date/Time',
                'Origin',
                'Category',
                'Service Domain',
                'Title',
                'Reference',
                'Channel',
                'Account',
                'Gross (NGN)',
                'Revenue (NGN)',
                'Cost/COGS (NGN)',
                'Fee (NGN)',
                'Expense (NGN)',
                'Net Profit Impact (NGN)',
                'Wallet Liability Delta (NGN)',
                'Reconciliation',
                'Customer/Party',
                'Staff',
                'Reversed',
            ]);

            foreach ($data['entries'] as $row) {
                fputcsv($out, [
                    $row['entry_number'],
                    $row['occurred_lagos'],
                    $row['source_origin'],
                    $row['entry_category'],
                    $row['service_domain'],
                    $row['title'],
                    $row['reference'],
                    $row['payment_channel'],
                    $row['account_code'],
                    $row['gross_amount'],
                    $row['revenue_amount'],
                    $row['cost_amount'],
                    $row['fee_amount'],
                    $row['expense_amount'],
                    $row['net_profit_impact'],
                    $row['wallet_liability_delta'],
                    $row['reconciliation_status'],
                    $row['customer_name'],
                    $row['staff_name'],
                    (int)$row['is_reversed'] === 1 ? 'YES' : 'NO',
                ]);
            }
            fclose($out);
            exit;
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function reverseLedgerEntry(Request $request, array $params): void
    {
        $actor = $this->authorizeSensitiveAdjustment($request);
        try {
            $id = (string)($params['id'] ?? '');
            $reason = (string)$request->input('reason', 'Reversed by administrator');
            $res = $this->service->reverseLedgerEntry($id, $reason, $actor);
            Response::success($res, 'Accounting entry reversed cleanly.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 9. Business Performance Analytics
    public function analytics(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'reports']);
        try {
            $data = $this->service->getAnalytics(
                $request->query('date_from') ? (string)$request->query('date_from') : null,
                $request->query('date_to') ? (string)$request->query('date_to') : null
            );
            Response::success($data);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 10. Automated Daily Email Reporting (Preview, Send Now, Logs)
    public function previewDailyReport(Request $request): void
    {
        $this->authorizeAny($request, ['accounting']);
        try {
            $date = $request->query('date') ? (string)$request->query('date') : null;
            $cutoff = $request->query('cutoff') ? (string)$request->query('cutoff') : null;
            $report = $this->service->buildDailyMiddayReport($date, $cutoff);
            Response::success([
                'report' => $report,
                'logs' => $this->service->getReportLogs(),
            ]);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function sendDailyReportNow(Request $request): void
    {
        $actor = $this->authorizeConfigWrite($request);
        try {
            $override = $request->input('recipients', null);
            $recs = is_array($override) ? $override : (is_string($override) && trim($override) !== '' ? preg_split('/[\s,;]+/', $override) : null);
            $res = $this->service->dispatchDailyMiddayReport(true, 'manual:' . ($actor['email'] ?? $actor['id']), $recs);
            if (!empty($res['success'])) {
                Response::success($res, 'Daily accounting report email sent successfully.');
            } else {
                Response::error('Report email dispatch failed: ' . ($res['error'] ?? 'Unknown SMTP error'), 500, $res);
            }
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function reportLogs(Request $request): void
    {
        $this->authorizeAny($request, ['accounting']);
        try {
            Response::success(['logs' => $this->service->getReportLogs()]);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    // 11. Accounting Configuration, Permissions & Accounts Opening Balances
    public function getConfig(Request $request): void
    {
        $this->authorizeAny($request, ['accounting', 'accounting_config']);
        try {
            $cfg = $this->service->getConfig();
            // Do not leak raw cron secret to non-superadmin users
            $user = Auth::user($request);
            if (($user['role'] ?? '') !== 'superadmin') {
                unset($cfg['cron_secret_token']);
            }
            Response::success([
                'config' => $cfg,
                'accounts' => $this->service->getAccounts(),
            ]);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function updateConfig(Request $request): void
    {
        $actor = $this->authorizeConfigWrite($request);
        try {
            $cfg = $this->service->updateConfig($request->getBody(), $actor);
            Response::success(['config' => $cfg], 'Accounting configuration updated.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function updateAccount(Request $request, array $params): void
    {
        $actor = $this->authorizeConfigWrite($request);
        try {
            $code = (string)($params['code'] ?? '');
            $acc = $this->service->updateAccount($code, $request->getBody(), $actor);
            Response::success(['account' => $acc], 'Account settings updated.');
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
