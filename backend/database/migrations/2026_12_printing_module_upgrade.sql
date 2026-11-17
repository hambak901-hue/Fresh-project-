-- HAMBAK TECH & SERVICES — PHASE 2: PRINTING & DOCUMENT SERVICES MODULE MIGRATION
-- Target: MySQL 8.0+ (Non-destructive, Additive, Idempotent)
-- Rollback script: 2026_12_printing_module_rollback.sql

-- 1. Printing Service Categories & Configurable Pricing Rules
CREATE TABLE IF NOT EXISTS printing_service_categories (
    id VARCHAR(36) PRIMARY KEY,
    category_key VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'Printer',
    pricing_mode ENUM('per_page', 'photocopy', 'banner_area', 'per_card', 'photo_unit', 'custom_quote') NOT NULL DEFAULT 'per_page',
    measurement_method ENUM('per_page', 'per_copy', 'per_sq_ft', 'per_linear_ft', 'per_card', 'per_photo', 'manual') NOT NULL DEFAULT 'per_page',
    unit_label VARCHAR(50) NOT NULL DEFAULT 'page',
    base_rate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    bw_rate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    color_rate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    min_quantity INT NOT NULL DEFAULT 1,
    urgent_fee_type ENUM('flat', 'percent') NOT NULL DEFAULT 'percent',
    urgent_fee_value DECIMAL(15, 2) NOT NULL DEFAULT 25.00,
    paper_sizes JSON NULL,
    size_rates JSON NULL,
    finishing_options JSON NULL,
    bulk_discounts JSON NULL,
    field_schema JSON NULL,
    requires_manual_quote TINYINT(1) NOT NULL DEFAULT 1,
    internal_cost_estimate DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    display_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_psc_active (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Configurable Lagos Delivery Zones & Charges
CREATE TABLE IF NOT EXISTS printing_delivery_zones (
    id VARCHAR(36) PRIMARY KEY,
    zone_key VARCHAR(64) NOT NULL UNIQUE,
    destination_group VARCHAR(120) NOT NULL,
    lga_lcda VARCHAR(150) NOT NULL,
    towns_covered TEXT NULL,
    pricing_mode ENUM('fixed', 'manual_quote', 'free') NOT NULL DEFAULT 'fixed',
    fixed_fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    free_delivery_enabled TINYINT(1) NOT NULL DEFAULT 0,
    free_delivery_min_order DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    estimated_eta VARCHAR(100) NULL DEFAULT 'Same Day / Next Business Day',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    display_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pdz_active (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Printing Orders & Manual Quotation Workflow
CREATE TABLE IF NOT EXISTS printing_orders (
    id VARCHAR(36) PRIMARY KEY,
    order_reference VARCHAR(64) NOT NULL UNIQUE,
    user_id VARCHAR(36) NOT NULL,
    customer_name VARCHAR(191) NOT NULL,
    customer_email VARCHAR(191) NOT NULL,
    customer_phone VARCHAR(40) NOT NULL,
    category_key VARCHAR(64) NOT NULL,
    category_name VARCHAR(150) NOT NULL,
    service_title VARCHAR(191) NOT NULL,
    status ENUM(
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
        'Refunded'
    ) NOT NULL DEFAULT 'Pending Review',
    specs JSON NULL,
    uploaded_files JSON NULL,
    quantity INT NOT NULL DEFAULT 1,
    color_mode ENUM('bw', 'color', 'mixed', 'full_color') NOT NULL DEFAULT 'bw',
    paper_size VARCHAR(80) NULL,
    width_ft DECIMAL(10, 2) NULL,
    height_ft DECIMAL(10, 2) NULL,
    sq_ft DECIMAL(12, 2) NULL,
    finishing_requirements JSON NULL,
    is_urgent TINYINT(1) NOT NULL DEFAULT 0,
    special_instructions TEXT NULL,
    estimated_printing_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    printing_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    finishing_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    urgent_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    delivery_charge DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    deposit_enabled TINYINT(1) NOT NULL DEFAULT 0,
    deposit_percent DECIMAL(6, 2) NOT NULL DEFAULT 50.00,
    deposit_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    required_initial_payment DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    amount_paid DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    balance_due DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    payment_status ENUM('unpaid', 'deposit_paid', 'partially_paid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid',
    delivery_payment_status ENUM('not_applicable', 'pending', 'paid', 'free_authorized') NOT NULL DEFAULT 'not_applicable',
    quote_notes TEXT NULL,
    quote_sent_at DATETIME NULL,
    quote_responded_at DATETIME NULL,
    quote_decision ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
    quote_decline_reason TEXT NULL,
    collection_method ENUM('office_collection', 'paid_delivery') NOT NULL DEFAULT 'office_collection',
    delivery_zone_id VARCHAR(36) NULL,
    delivery_recipient_name VARCHAR(191) NULL,
    delivery_recipient_phone VARCHAR(40) NULL,
    delivery_destination VARCHAR(120) NULL,
    delivery_lga_lcda VARCHAR(150) NULL,
    delivery_town VARCHAR(150) NULL,
    delivery_address TEXT NULL,
    delivery_landmark VARCHAR(255) NULL,
    free_delivery_authorized TINYINT(1) NOT NULL DEFAULT 0,
    dispatch_confirmed TINYINT(1) NOT NULL DEFAULT 0,
    dispatch_confirmed_by VARCHAR(36) NULL,
    dispatch_confirmed_by_name VARCHAR(191) NULL,
    dispatch_confirmed_at DATETIME NULL,
    tracking_note TEXT NULL,
    assigned_staff_id VARCHAR(36) NULL,
    assigned_staff_name VARCHAR(191) NULL,
    internal_production_cost DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    internal_notes TEXT NULL,
    due_date DATE NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_po_user (user_id, created_at),
    INDEX idx_po_status (status, created_at),
    INDEX idx_po_cat (category_key),
    INDEX idx_po_staff (assigned_staff_id),
    INDEX idx_po_pay (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Full Audit History for All Status Transitions
CREATE TABLE IF NOT EXISTS printing_order_status_history (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    from_status VARCHAR(64) NULL,
    to_status VARCHAR(64) NOT NULL,
    actor_id VARCHAR(36) NULL,
    actor_name VARCHAR(191) NOT NULL,
    actor_role VARCHAR(50) NOT NULL DEFAULT 'system',
    note TEXT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_posh_order (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Order Messages & Internal Production Notes
CREATE TABLE IF NOT EXISTS printing_order_messages (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(191) NOT NULL,
    sender_role VARCHAR(50) NOT NULL DEFAULT 'customer',
    message TEXT NOT NULL,
    attachment_url VARCHAR(500) NULL,
    is_internal TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pom_order (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Printing Payments Ledger (Supports Full, Deposit, Balance, Delivery Tracking)
CREATE TABLE IF NOT EXISTS printing_payments (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    reference VARCHAR(100) NOT NULL UNIQUE,
    payment_scope ENUM('full', 'deposit', 'balance', 'delivery') NOT NULL DEFAULT 'full',
    gateway ENUM('wallet', 'paystack', 'flutterwave', 'manual_transfer', 'cash', 'pos') NOT NULL DEFAULT 'wallet',
    amount DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'confirmed', 'rejected', 'refunded') NOT NULL DEFAULT 'pending',
    proof_url VARCHAR(500) NULL,
    payer_name VARCHAR(191) NULL,
    bank_reference VARCHAR(120) NULL,
    remarks TEXT NULL,
    confirmed_by VARCHAR(36) NULL,
    confirmed_by_name VARCHAR(191) NULL,
    confirmed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pp_order (order_id, status),
    INDEX idx_pp_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Register Printing Module in Customer Dashboard Modules
INSERT IGNORE INTO dashboard_modules
    (id, module_key, name, description, icon, status, is_visible, coming_soon_message, display_order)
VALUES
    ('mod_printing', 'printing', 'Printing & Document Services', 'Document printing, photocopying, large-format banners, plastic ID cards, photo printing & Lagos delivery.', 'Printer', 'active', 1, NULL, 7);
