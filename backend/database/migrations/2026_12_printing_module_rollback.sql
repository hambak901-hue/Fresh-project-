-- HAMBAK TECH & SERVICES — ROLLBACK FOR PRINTING & DOCUMENT SERVICES MODULE
-- Removes only the new Printing & Document Services tables and module row without touching any core tables.

DROP TABLE IF EXISTS printing_payments;
DROP TABLE IF EXISTS printing_order_messages;
DROP TABLE IF EXISTS printing_order_status_history;
DROP TABLE IF EXISTS printing_orders;
DROP TABLE IF EXISTS printing_delivery_zones;
DROP TABLE IF EXISTS printing_service_categories;

DELETE FROM dashboard_modules WHERE module_key = 'printing' OR id = 'mod_printing';
DELETE FROM system_settings WHERE setting_key = 'printing_settings';
