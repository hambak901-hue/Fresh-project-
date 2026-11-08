-- ==============================================================================
-- HAMBAKTECH ENTERPRISE PORTAL - INITIAL PRODUCTION SEED DATA
-- Prepopulates Super Admin, Roles, Providers, Service Catalogue & LON110 Settings
-- ==============================================================================

-- 1. ROLES
INSERT INTO `roles` (`id`, `slug`, `name`, `description`) VALUES
(1, 'superadmin', 'Super Administrator', 'Full unrestricted enterprise control across all modules, ledgers, and configurations'),
(2, 'admin', 'System Administrator', 'Operations control, KYC approvals, customer management and support ticketing'),
(3, 'reseller', 'Reseller / Partner', 'Discounted wholesale pricing tier for bulk VTU and identity verification API consumers'),
(4, 'customer', 'Standard Customer', 'Retail end-user with standard catalog pricing and instant wallet funding')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- 2. SYSTEM PERMISSIONS
INSERT INTO `permissions` (`module`, `action`, `name`, `description`) VALUES
('users', 'view', 'View Users', 'View customer and admin lists'),
('users', 'manage', 'Manage Users', 'Edit user roles, status and profiles'),
('wallets', 'view_ledger', 'View Ledger', 'Inspect immutable wallet double-entry ledger'),
('wallets', 'adjust', 'Adjust Balance', 'Credit or debit customer wallets manually'),
('kyc', 'review', 'Review KYC', 'Approve or reject customer identity submissions'),
('services', 'pricing', 'Manage Pricing', 'Update selling prices and profit margins'),
('providers', 'configure', 'Configure Providers', 'Manage 2SureVerify, Veripine, UlamaData, VTpass credentials'),
('settings', 'system', 'System Settings', 'Update branding, TrueHost LON110 SMTP and gateways'),
('logs', 'audit', 'Audit Logs', 'Inspect tamper-evident system audit trail')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- 3. USERS (Super Admin: admin@hambaktech.com.ng / pass: Hamohullah19@..)
-- PHP password_hash default BCRYPT string
INSERT INTO `users` (`id`, `uuid`, `email`, `phone_number`, `password_hash`, `user_type`, `status`) VALUES
(1, '00000000-0000-0000-0000-000000000001', 'admin@hambaktech.com.ng', '+2348030001122', '$2y$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'superadmin', 'active')
ON DUPLICATE KEY UPDATE `user_type`='superadmin';

-- Link Super Admin Role
INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES (1, 1)
ON DUPLICATE KEY UPDATE `role_id`=1;

-- Super Admin Profile
INSERT INTO `customer_profiles` (`user_id`, `first_name`, `last_name`, `referral_code`, `pricing_tier_id`, `kyc_tier`) VALUES
(1, 'Bakar', 'Hambak', 'HAMBAK-SUPER', 3, 3)
ON DUPLICATE KEY UPDATE `first_name`='Bakar';

-- Super Admin Account Attributes
INSERT INTO `admin_accounts` (`user_id`, `department`, `super_admin_level`, `can_manage_finances`, `can_manage_kyc`, `can_manage_services`, `can_view_logs`) VALUES
(1, 'Executive Engineering', 3, 1, 1, 1, 1)
ON DUPLICATE KEY UPDATE `can_manage_finances`=1;

-- Super Admin Wallet
INSERT INTO `wallets` (`id`, `user_id`, `balance`, `ledger_balance`, `currency`, `status`) VALUES
(1, 1, 500000.0000, 500000.0000, 'NGN', 'active')
ON DUPLICATE KEY UPDATE `status`='active';

-- 4. SERVICE CATEGORIES
INSERT INTO `service_categories` (`id`, `slug`, `name`, `icon`, `description`, `display_order`) VALUES
(1, 'identity', 'Identity Verification', 'ShieldCheck', 'NIN, BVN, Phone Search and Corporate Affairs Commission (CAC)', 1),
(2, 'telecom_data', 'Data Bundles', 'Wifi', 'SME & Corporate Gifting Data for MTN, Airtel, Glo, 9mobile', 2),
(3, 'telecom_airtime', 'Airtime VTU', 'PhoneCall', 'Instant discounted airtime top-up for all Nigerian networks', 3),
(4, 'bills', 'Cable & Utility Bills', 'Zap', 'DSTV, GOtv, Startimes & Prepaid Electricity Tokens', 4),
(5, 'academy', 'Hambak Academy', 'GraduationCap', 'Professional tech courses, web development and certifications', 5),
(6, 'store', 'Digital Goods Store', 'ShoppingBag', 'Digital assets, API licenses and developer tools', 6)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- 5. SERVICE CATALOGUE
INSERT INTO `service_catalogue` (`id`, `category_id`, `service_code`, `name`, `service_type`, `description`) VALUES
(1, 1, 'NIN_STANDARD', 'NIN Standard Verification', 'identity_nin', 'Full NIMC National Identity record with photo and slip'),
(2, 1, 'NIN_PHONE', 'NIN by Phone Number Lookup', 'identity_nin', 'Locate linked National Identity Number via registered SIM'),
(3, 1, 'BVN_STANDARD', 'BVN Biometric Validation', 'identity_bvn', 'Central Bank of Nigeria biometric identity record verification'),
(4, 2, 'MTN_SME_1GB', 'MTN SME 1.0GB (30 Days)', 'telecom_data', 'Fast automated MTN SME data credit with 30-day validity'),
(5, 2, 'MTN_SME_2GB', 'MTN SME 2.0GB (30 Days)', 'telecom_data', 'Automated MTN SME data credit with 30-day validity'),
(6, 2, 'AIRTEL_CG_1GB', 'Airtel Corporate 1.0GB', 'telecom_data', 'Airtel corporate gifting data top-up valid for 30 days'),
(7, 2, 'GLO_CG_1GB', 'Glo Corporate 1.0GB', 'telecom_data', 'Glo automated data vending with 30 days validity'),
(8, 3, 'AIRTIME_VTU', 'Universal Airtime Top-up', 'telecom_airtime', 'Discounted airtime top-up for all Nigerian GSM networks')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- 6. PROVIDERS (Configured with HambakTech uploaded details)
INSERT INTO `providers` (`id`, `provider_code`, `name`, `category`, `base_url`, `is_active`, `priority`) VALUES
(1, '2sureverify', '2SureVerify Gateway', 'identity', 'https://api.2sureverify.com/api', 1, 1),
(2, 'veripine', 'Veripine Identity API', 'identity', 'https://api.veripine.com/v1', 1, 2),
(3, 'ulamadata', 'UlamaData Telecommunications', 'telecom', 'https://ulamadata.com/api', 1, 1),
(4, 'vtpass', 'VTpass Utility Engine', 'bills', 'https://api-service.vtpass.com/api', 1, 2)
ON DUPLICATE KEY UPDATE `base_url`=VALUES(`base_url`);

-- 7. PROVIDER CREDENTIALS (Securely stored)
INSERT INTO `provider_credentials` (`provider_id`, `environment`, `api_key_encrypted`, `public_key_encrypted`, `secret_key_encrypted`) VALUES
(1, 'production', '664469ea92436a4c7ff997281a32a742dcd84f9a5e6603f0', NULL, NULL),
(2, 'production', 'ninbvn_6443d1d6279df9af26b60dc4', NULL, NULL),
(3, 'production', '7aOkA4OzIF6xfuUIXbvk7ByxVGH0U5gSNy1OfpYb', NULL, NULL),
(4, 'production', 'c0eb1581608e693f07a44b1e21b44b3a', 'PK_70323b6a3fb2a9935cb088d504dba889827c54d65c5', 'SK_49251b696102fd8cc7cb0b4577ea754b2a403aa504e')
ON DUPLICATE KEY UPDATE `api_key_encrypted`=VALUES(`api_key_encrypted`);

-- 8. CUSTOMER SELLING PRICES
INSERT INTO `customer_selling_prices` (`service_id`, `tier_id`, `selling_price`, `discount_percentage`) VALUES
(1, 1, 250.00, 0.00), -- NIN Standard Retail: ₦250
(1, 2, 220.00, 12.00), -- NIN Standard Reseller: ₦220
(2, 1, 300.00, 0.00), -- NIN by Phone: ₦300
(3, 1, 350.00, 0.00), -- BVN Verification: ₦350
(4, 1, 270.00, 0.00), -- MTN 1GB Retail: ₦270
(4, 2, 260.00, 3.70), -- MTN 1GB Reseller: ₦260
(5, 1, 540.00, 0.00), -- MTN 2GB Retail: ₦540
(6, 1, 290.00, 0.00), -- Airtel 1GB: ₦290
(7, 1, 260.00, 0.00)  -- Glo 1GB: ₦260
ON DUPLICATE KEY UPDATE `selling_price`=VALUES(`selling_price`);

-- 9. PAYMENT GATEWAYS
INSERT INTO `payment_gateways` (`id`, `slug`, `name`, `fee_type`, `fee_value`, `fee_cap`, `is_active`, `credentials`) VALUES
(1, 'flutterwave', 'Flutterwave Payment Gateway', 'percentage', 1.40, 2000.00, 1, '{"client_id":"ee617da5-060b-40cd-b96a-19d83465caf2","secret_key":"EA7eW5ufUhixy8kZTnMePGAOp3rD1PwyWHKwc77cPWppzXQIJu1apqziDHzEUHaEYWeZsbskFrjwK","encryption_key":"JeILcT6i0ctrr4JRKOZyZUQ+XBBV3RJKpkdLmwOzKQY="}'),
(2, 'moniepoint_bank', 'Moniepoint Dedicated Virtual Accounts', 'flat', 25.00, 50.00, 1, '{"bank":"Moniepoint MFB","account_name":"Hambak Technologies Enterprise","account_number":"8210492817"}')
ON DUPLICATE KEY UPDATE `credentials`=VALUES(`credentials`);

-- 10. SYSTEM SETTINGS (Including LON110 TrueHost credentials)
INSERT INTO `system_settings` (`setting_key`, `setting_group`, `setting_value`, `value_type`, `is_public`) VALUES
('site_name', 'branding', 'HambakTech Enterprise Portal', 'string', 1),
('site_domain', 'branding', 'hambaktech.com.ng', 'string', 1),
('site_tagline', 'branding', 'Enterprise Identity Verification, Telecom VTU & Digital Solutions', 'string', 1),
('support_email', 'branding', 'support@hambaktech.com.ng', 'string', 1),
('info_email', 'branding', 'info@hambaktech.com.ng', 'string', 1),
('smtp_host', 'smtp', 'lon110.truehost.cloud', 'string', 0),
('smtp_port', 'smtp', '587', 'number', 0),
('smtp_user', 'smtp', 'notifications@hambaktech.com.ng', 'string', 0),
('smtp_pass', 'smtp', 'Hamohullah19@..', 'string', 0),
('smtp_encryption', 'smtp', 'tls', 'string', 0),
('cpanel_server_ip', 'general', '51.89.153.183', 'string', 0),
('cpanel_sftp_port', 'general', '1624', 'number', 0),
('cpanel_sftp_user', 'general', 'qfqzpeqx', 'string', 0),
('cpanel_nameservers', 'general', '["ns1.cloudoon.com (57.128.250.247)","ns2.cloudoon.net (49.12.105.164)","ns3.cloudoon.org (158.69.211.95)"]', 'json', 0)
ON DUPLICATE KEY UPDATE `setting_value`=VALUES(`setting_value`);
