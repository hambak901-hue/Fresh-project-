-- ==============================================================================
-- HAMBAKTECH ENTERPRISE PORTAL — PRODUCTION MYSQL SEED DATA
-- Fully compatible with MariaDB 10.11+ / MySQL 8.0+ / cPanel phpMyAdmin
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. ROLES & PERMISSIONS SEED
-- -----------------------------------------------------------------------------
INSERT INTO roles (id, name, slug, description) VALUES
('rol_superadmin', 'Super Administrator', 'superadmin', 'Global system authority with unrestricted access'),
('rol_admin', 'Administrator', 'admin', 'Management authority over services, customers, and transactions'),
('rol_customer', 'Customer / Agent', 'customer', 'Standard portal customer with digital wallet and API access')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- -----------------------------------------------------------------------------
-- 2. PROVIDERS SEED
-- -----------------------------------------------------------------------------
INSERT INTO providers (id, name, provider_type, base_url, api_key, is_active, is_default, timeout_seconds, balance, last_ping_status) VALUES
('2sureverify', '2SureVerify Gateway (Primary)', 'identity', 'https://2sureverify.com', '', 1, 1, 30, 48250.00, 'operational'),
('veripine', 'Veripine Identity API (Secondary Failover)', 'identity', 'https://api.veripine.com/v1', '', 1, 0, 30, 15000.00, 'operational'),
('ulamadata', 'UlamaData Telecom API (Primary)', 'telecom', 'https://ulamadata.com', '', 1, 1, 30, 38920.00, 'operational'),
('vtpass', 'VTpass Gateway (Secondary Telecom)', 'telecom', 'https://api-service.vtpass.com/api', '', 1, 0, 30, 12500.00, 'operational'),
('paystack', 'Paystack Merchant Checkout', 'payment', 'https://api.paystack.co', 'pk_live_hambaktech_mock_key', 1, 1, 30, 0.00, 'operational')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- -----------------------------------------------------------------------------
-- 3. SERVICE CATEGORIES SEED
-- -----------------------------------------------------------------------------
INSERT INTO service_categories (id, code, name, icon, display_order, is_active) VALUES
('cat_nin', 'nin_verification', 'NIN Verification', 'ShieldCheck', 1, 1),
('cat_bvn', 'bvn_verification', 'BVN Verification', 'CreditCard', 2, 1),
('cat_mod', 'nin_modification', 'NIN Modification', 'Edit3', 3, 1),
('cat_prs', 'personalisation', 'Personalisation', 'UserCheck', 4, 1),
('cat_enr', 'enrolment', 'Enrolment', 'FilePlus', 5, 1),
('cat_add', 'additional_services', 'Additional Services', 'Layers', 6, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- -----------------------------------------------------------------------------
-- 4. SERVICE CATALOGUE SEED (42 SOVEREIGN IDENTITY SERVICES)
-- -----------------------------------------------------------------------------
INSERT INTO service_catalogue (id, category_id, service_key, name, description, provider_id, endpoint, wholesale_cost, selling_price, required_fields, slip_type_supported, is_active) VALUES
('srv_nin_v1', 'cat_nin', 'nin_v1', 'NIN Verification (V1 Standard)', 'Direct NIMC lookup with slip style selection (ninBasic, ninStandard, ninPremium, ninVnin, ninSpecial).', '2sureverify', '/api/v1/nin_v1.php', 85.00, 200.00, '["nin", "slip_type"]', 1, 1),
('srv_nin_v2', 'cat_nin', 'nin_v2', 'NIN Verification (V2 Multi-Tier)', 'Multi-tier NIN verification with tier selection (basic, standard, premium, regular, vnin, vip).', '2sureverify', '/api/v1/nin_v2.php', 95.00, 220.00, '["nin", "tier"]', 0, 1),
('srv_nin_v3', 'cat_nin', 'nin_v3', 'NIN Verification (V3 5-Version Selector)', '5 independent upstream verification versions with custom slip styling.', '2sureverify', '/api/v1/nin_v3.php', 97.00, 250.00, '["nin", "tier", "slip_type"]', 1, 1),
('srv_phone_v1', 'cat_nin', 'phone_v1', 'Phone Verification (V1)', 'Locate linked NIN record using registered Nigerian SIM card.', '2sureverify', '/api/v1/phone_v1.php', 85.00, 200.00, '["phone", "slip_type"]', 1, 1),
('srv_phone_v2', 'cat_nin', 'phone_v2', 'Phone Verification (V2 Multi-Tier)', 'Phone to NIN matching across basic, standard, premium and VIP tiers.', '2sureverify', '/api/v1/phone_v2.php', 95.00, 220.00, '["phone", "tier"]', 0, 1),
('srv_phone_v3', 'cat_nin', 'phone_v3', 'Phone Verification (V3 5-Version)', '5-version phone to NIN resolution with slip generation.', '2sureverify', '/api/v1/phone_v3.php', 102.00, 250.00, '["phone", "tier", "slip_type"]', 1, 1),
('srv_demo_v1', 'cat_nin', 'demo_v1', 'Demographic Verification (V1)', 'Search and confirm NIN matching name, birth date, and gender.', '2sureverify', '/api/v1/demo_v1.php', 90.00, 200.00, '["firstname", "lastname", "dob", "gender"]', 0, 1),
('srv_demo_v2', 'cat_nin', 'demo_v2', 'Demographic Verification (V2)', 'Multi-tier demographic match search.', '2sureverify', '/api/v1/demo_v2.php', 95.00, 220.00, '["firstname", "lastname", "dob", "gender", "tier"]', 0, 1),
('srv_demo_v3', 'cat_nin', 'demo_v3', 'Demographic Verification (V3)', 'Extended demographic matching with slip generation.', '2sureverify', '/api/v1/demo_v3.php', 97.00, 250.00, '["firstname", "lastname", "dob", "gender", "tier", "slip_type"]', 1, 1),
('srv_vnin', 'cat_nin', 'vnin_verification', 'Virtual NIN (VNIN) Verification', 'Verify enterprise 16-character virtual NIN or generate verifiable record.', '2sureverify', '/api/v1/nin_v2.php', 95.00, 200.00, '["nin"]', 0, 1),
('srv_bvn_v1', 'cat_bvn', 'bvn_v1', 'BVN Verification (V1 Standard)', 'Bank Verification Number validation with slip choice (bvnBasic, bvnAdvanced, plasticBvn).', '2sureverify', '/api/v1/bvn_v1.php', 85.00, 250.00, '["bvn", "slip_type"]', 1, 1),
('srv_bvn_v2', 'cat_bvn', 'bvn_v2', 'BVN Verification (V2)', 'Standard Central Bank of Nigeria BVN biometric record check.', '2sureverify', '/api/v1/bvn_v2.php', 85.00, 250.00, '["bvn"]', 0, 1),
('srv_bvn_v3', 'cat_bvn', 'bvn_v3', 'BVN Verification (V3 Multi-Version)', '5-version BVN biometric query with document printing.', '2sureverify', '/api/v1/bvn_v3.php', 85.00, 250.00, '["bvn", "tier", "slip_type"]', 1, 1),
('srv_bvn_ret', 'cat_bvn', 'bvn_retrieval', 'BVN Retrieval by Phone', 'Retrieve 11-digit BVN linked to a phone number.', '2sureverify', '/api/v1/bvn_retrieval.php', 700.00, 1200.00, '["phone"]', 0, 1),
('srv_mod_name', 'cat_mod', 'nin_mod_name', 'NIN Name Modification', 'Official correction of first name, middle name, or surname.', '2sureverify', '/api/v1/nin_mod_name.php', 4000.00, 6000.00, '["nin", "first_name", "last_name"]', 0, 1),
('srv_mod_phone', 'cat_mod', 'nin_mod_phone', 'NIN Phone Number Modification', 'Update telephone number registered on NIMC database.', '2sureverify', '/api/v1/nin_mod_phone.php', 4000.00, 6000.00, '["nin", "phone"]', 0, 1),
('srv_mod_addr', 'cat_mod', 'nin_mod_address', 'NIN Address Modification', 'Update residential address, state, or LGA.', '2sureverify', '/api/v1/nin_mod_address.php', 4000.00, 6000.00, '["nin", "address", "state", "lga"]', 0, 1),
('srv_mod_dob', 'cat_mod', 'nin_mod_dob', 'NIN Date of Birth Modification', 'Official NIMC date of birth modification with affidavit.', '2sureverify', '/api/v1/nin_mod_dob.php', 53000.00, 65000.00, '["nin", "dob"]', 0, 1),
('srv_mod_dob_name', 'cat_mod', 'nin_mod_dob_name', 'NIN Name & DOB Modification', 'Simultaneous correction of full names and date of birth.', '2sureverify', '/api/v1/nin_mod_dob_name.php', 58000.00, 72000.00, '["nin", "first_name", "last_name", "dob"]', 0, 1),
('srv_mod_name_phone', 'cat_mod', 'nin_mod_name_phone', 'NIN Name & Phone Modification', 'Simultaneous update of names and registered telephone number.', '2sureverify', '/api/v1/nin_mod_name_phone.php', 8000.00, 12000.00, '["nin", "first_name", "last_name", "phone"]', 0, 1),
('srv_mod_gender', 'cat_mod', 'gender_modification', 'NIN Gender Modification', 'Correction of gender classification on identity record.', '2sureverify', '/api/v1/gender_modification.php', 5000.00, 7500.00, '["nin", "gender"]', 0, 1),
('srv_mod_susp', 'cat_mod', 'suspended_modification', 'Suspended NIN Modification', 'Rectification and lifting of suspension on flagged NIN.', '2sureverify', '/api/v1/suspended_modification.php', 23000.00, 30000.00, '["nin", "tracking_id"]', 0, 1),
('srv_mod_bvn_gen', 'cat_mod', 'bvn_generated_modification', 'BVN Generated NIN Modification', 'Upgrade and bio-capture modification for auto-generated BVN-NINs.', '2sureverify', '/api/v1/bvn_generated_modification.php', 22000.00, 28000.00, '["nin", "bvn"]', 0, 1),
('srv_mod_child', 'cat_mod', 'child_modification', 'Child NIN Modification', 'Update child identity record with parental consent linkage.', '2sureverify', '/api/v1/child_modification.php', 13000.00, 18000.00, '["nin", "parent_nin"]', 0, 1),
('srv_mod_overage', 'cat_mod', 'nin_over_age', 'Over-Age NIN Modification', 'Age bracket adjustment (5-9, 10-15, 15-20 years).', '2sureverify', '/api/v1/nin_over_age.php', 10000.00, 15000.00, '["nin", "age_range"]', 0, 1),
('srv_mod_sec_name', 'cat_mod', 'second_nin_mod_name', 'Second NIN Name Mod (No Email/Pass)', 'Secondary NIN name modification without email or password auth.', '2sureverify', '/api/v1/second_nin_mod_name.php', 70000.00, 85000.00, '["nin", "first_name", "last_name"]', 0, 1),
('srv_mod_sec_phone', 'cat_mod', 'second_nin_mod_phone', 'Second NIN Phone Mod (No Email/Pass)', 'Secondary NIN phone number modification without email or password auth.', '2sureverify', '/api/v1/second_nin_mod_phone.php', 18000.00, 25000.00, '["nin", "phone"]', 0, 1),
('srv_mod_sec_name_pass', 'cat_mod', 'second_nin_mod_name_pass', 'Second NIN Name Mod (With Email/Pass)', 'Secondary NIN name modification with authenticated credentials.', '2sureverify', '/api/v1/second_nin_mod_name_pass.php', 28000.00, 36000.00, '["nin", "first_name", "last_name", "email", "password"]', 0, 1),
('srv_mod_sec_phone_pass', 'cat_mod', 'second_nin_mod_phone_pass', 'Second NIN Phone Mod (With Email/Pass)', 'Secondary NIN phone modification with authenticated credentials.', '2sureverify', '/api/v1/second_nin_mod_phone_pass.php', 15000.00, 20000.00, '["nin", "phone", "email", "password"]', 0, 1),
('srv_mod_bvn_mod', 'cat_mod', 'bvn_modification', 'BVN Modification Service', 'Direct update and correction of NIBSS BVN records.', '2sureverify', '/api/v1/bvn_modification.php', 8000.00, 12000.00, '["bvn", "field_to_modify", "new_value"]', 0, 1)
ON DUPLICATE KEY UPDATE selling_price=VALUES(selling_price);

-- -----------------------------------------------------------------------------
-- 5. TELECOMMUNICATIONS BUNDLES SEED
-- -----------------------------------------------------------------------------
INSERT INTO telecom_plans (id, provider_plan_id, network, name, size, plan_type, validity, wholesale_cost, price, is_active, provider_id) VALUES
('plan_mtn_500mb', '101', 'MTN', 'MTN SME 500MB', '500MB', 'SME', '30 Days', 135.00, 160.00, 1, 'ulamadata'),
('plan_mtn_1gb', '102', 'MTN', 'MTN SME 1GB', '1GB', 'SME', '30 Days', 270.00, 310.00, 1, 'ulamadata'),
('plan_mtn_2gb', '103', 'MTN', 'MTN SME 2GB', '2GB', 'SME', '30 Days', 540.00, 620.00, 1, 'ulamadata'),
('plan_mtn_3gb', '104', 'MTN', 'MTN SME 3GB', '3GB', 'SME', '30 Days', 810.00, 930.00, 1, 'ulamadata'),
('plan_mtn_5gb', '105', 'MTN', 'MTN SME 5GB', '5GB', 'SME', '30 Days', 1350.00, 1550.00, 1, 'ulamadata'),
('plan_mtn_10gb', '106', 'MTN', 'MTN SME 10GB', '10GB', 'SME', '30 Days', 2700.00, 3100.00, 1, 'ulamadata'),
('plan_air_1gb', '201', 'AIRTEL', 'Airtel Corporate 1GB', '1GB', 'Corporate', '30 Days', 290.00, 340.00, 1, 'ulamadata'),
('plan_air_2gb', '202', 'AIRTEL', 'Airtel Corporate 2GB', '2GB', 'Corporate', '30 Days', 580.00, 680.00, 1, 'ulamadata'),
('plan_air_5gb', '203', 'AIRTEL', 'Airtel Corporate 5GB', '5GB', 'Corporate', '30 Days', 1450.00, 1700.00, 1, 'ulamadata'),
('plan_glo_1gb', '301', 'GLO', 'Glo Corporate 1GB', '1GB', 'Corporate', '30 Days', 260.00, 300.00, 1, 'ulamadata'),
('plan_glo_2gb', '302', 'GLO', 'Glo Corporate 2GB', '2GB', 'Corporate', '30 Days', 520.00, 600.00, 1, 'ulamadata'),
('plan_glo_5gb', '303', 'GLO', 'Glo Corporate 5GB', '5GB', 'Corporate', '30 Days', 1300.00, 1500.00, 1, 'ulamadata'),
('plan_9mob_1gb', '401', '9MOBILE', '9mobile SME 1GB', '1GB', 'SME', '30 Days', 250.00, 290.00, 1, 'ulamadata'),
('plan_9mob_2gb', '402', '9MOBILE', '9mobile SME 2GB', '2GB', 'SME', '30 Days', 500.00, 580.00, 1, 'ulamadata')
ON DUPLICATE KEY UPDATE price=VALUES(price);

-- -----------------------------------------------------------------------------
-- 6. UTILITIES: ELECTRICITY & CABLE PACKAGES SEED
-- -----------------------------------------------------------------------------
INSERT INTO electricity_discos (id, name, code, minimum_amount, is_active) VALUES
('disc_ikj', 'Ikeja Electric (IKEDC)', 'ikeja-electric', 500.00, 1),
('disc_ekd', 'Eko Electric (EKEDC)', 'eko-electric', 500.00, 1),
('disc_abj', 'Abuja Electric (AEDC)', 'abuja-electric', 500.00, 1),
('disc_kan', 'Kano Electric (KEDCO)', 'kano-electric', 500.00, 1),
('disc_por', 'Port Harcourt Electric (PHED)', 'portharcourt-electric', 500.00, 1),
('disc_iba', 'Ibadan Electric (IBEDC)', 'ibadan-electric', 500.00, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO cable_packages (id, provider, name, code, channels, wholesale_cost, price, is_active) VALUES
('cab_dstv_jin', 'dstv', 'DStv Yanga', 'dstv-yanga', 85, 4100.00, 4200.00, 1),
('cab_dstv_cnf', 'dstv', 'DStv Confam', 'dstv-confam', 105, 7300.00, 7400.00, 1),
('cab_dstv_cpt', 'dstv', 'DStv Compact', 'dstv-compact', 130, 12400.00, 12500.00, 1),
('cab_gotv_sml', 'gotv', 'GOtv Smallie', 'gotv-smallie', 35, 1200.00, 1300.00, 1),
('cab_gotv_jin', 'gotv', 'GOtv Jinja', 'gotv-jinja', 45, 2600.00, 2700.00, 1),
('cab_gotv_jli', 'gotv', 'GOtv Jolli', 'gotv-jolli', 65, 3850.00, 3950.00, 1),
('cab_gotv_max', 'gotv', 'GOtv Max', 'gotv-max', 75, 5600.00, 5700.00, 1),
('cab_star_nov', 'startimes', 'StarTimes Nova', 'startimes-nova', 40, 1400.00, 1500.00, 1),
('cab_star_bas', 'startimes', 'StarTimes Basic', 'startimes-basic', 60, 2500.00, 2600.00, 1),
('cab_star_cls', 'startimes', 'StarTimes Classic', 'startimes-classic', 80, 3700.00, 3800.00, 1)
ON DUPLICATE KEY UPDATE price=VALUES(price);

INSERT INTO exam_packages (id, exam_name, name, description, wholesale_cost, price, is_active) VALUES
('exm_waec', 'WAEC', 'WAEC Result Checker PIN', 'Direct e-PIN scratch card for checking WASSCE results.', 3300.00, 3600.00, 1),
('exm_neco', 'NECO', 'NECO Result Checker Token', 'Official NECO token for SSCE results validation.', 1150.00, 1300.00, 1),
('exm_jamb', 'JAMB', 'JAMB UTME Registration Profile Code', 'E-facility profile code and exam registration PIN.', 4500.00, 4800.00, 1),
('exm_nabteb', 'NABTEB', 'NABTEB Result Checker Card', 'Official NABTEB National Technical Certificate PIN.', 1350.00, 1500.00, 1)
ON DUPLICATE KEY UPDATE price=VALUES(price);

INSERT INTO airtime_swap_configs (id, network, conversion_rate_percent, merchant_phone, ussd_code, is_active) VALUES
('swp_mtn', 'MTN', 82.00, '+2348030001122', '*600*08030001122*AMOUNT*PIN#', 1),
('swp_airtel', 'AIRTEL', 80.00, '+2348020001122', '*432*1*08020001122*AMOUNT*PIN#', 1),
('swp_glo', 'GLO', 75.00, '+2348050001122', '*131*08050001122*AMOUNT*PIN#', 1),
('swp_9mobile', '9MOBILE', 75.00, '+2348090001122', '*223*PIN*AMOUNT*08090001122#', 1)
ON DUPLICATE KEY UPDATE conversion_rate_percent=VALUES(conversion_rate_percent);

-- -----------------------------------------------------------------------------
-- 7. DEFAULT SUPERADMIN ACCOUNT SEED
-- -----------------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, full_name, phone_number, role, wallet_balance, kyc_status, tier, referral_code, status) VALUES
('usr_superadmin', 'admin@hambaktech.com.ng', '$2y$10$wT0Xh9F2hXfR9l0Y2n5nPe5W6A4i7yQjBvQ2w0zT6v6tq4YkF7l2e', 'Bakar Hambak (Super Admin)', '+2348030001122', 'superadmin', 500000.00, 'verified', 3, 'HAMBAK-SUPER', 'active'),
('usr_customer_demo', 'customer@hambaktech.com.ng', '$2y$10$wT0Xh9F2hXfR9l0Y2n5nPe5W6A4i7yQjBvQ2w0zT6v6tq4YkF7l2e', 'Fatimoh Musbau', '+2348123456789', 'customer', 50000.00, 'verified', 2, 'FATIMOH99', 'active')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

INSERT INTO wallets (id, user_id, balance, currency, ledger_version, status) VALUES
('wal_superadmin', 'usr_superadmin', 500000.00, 'NGN', 1, 'active'),
('wal_customer_demo', 'usr_customer_demo', 50000.00, 'NGN', 3, 'active')
ON DUPLICATE KEY UPDATE balance=VALUES(balance);

INSERT INTO user_profiles (user_id, nin, bvn, address, state, lga, bio) VALUES
('usr_superadmin', '11122233344', '22233344455', 'Plot 14 Commercial Avenue, Ikeja', 'Lagos', 'Ikeja', 'Executive Director & Chief Systems Architect'),
('usr_customer_demo', '12345678901', '22334455667', 'Plot 28 Victoria Island, Lagos', 'Lagos', 'Eti-Osa', 'Certified Telecom & Identity Agent')
ON DUPLICATE KEY UPDATE nin=VALUES(nin);

SET FOREIGN_KEY_CHECKS = 1;
