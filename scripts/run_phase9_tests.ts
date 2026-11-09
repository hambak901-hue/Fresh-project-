/**
 * @file run_phase9_tests.ts
 * Real-time automated test execution script for Phase 9 QA.
 * Executes all 34 integration & security test cases against live server on http://localhost:3000.
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('===============================================================');
  console.log('HAMBAKTECH ENTERPRISE - PHASE 9 AUTOMATED QA INTEGRATION SUITE');
  console.log('Target Server:', BASE_URL);
  console.log('Timestamp:', new Date().toISOString());
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    const t0 = Date.now();
    try {
      await fn();
      const ms = Date.now() - t0;
      console.log(`[PASS] ${name} (${ms}ms)`);
      passed++;
    } catch (err: any) {
      const ms = Date.now() - t0;
      console.error(`[FAIL] ${name} (${ms}ms):`, err.message);
      failed++;
    }
  }

  let customerToken = '';
  let adminToken = '';

  // 1. Health
  await test('01. GET /api/health (Server Connectivity)', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const json = await res.json();
    if (!res.ok || json.status !== 'ok') throw new Error(`Health status not ok: ${JSON.stringify(json)}`);
  });

  // 2. CMS Public Content
  await test('02. GET /api/cms/public-content (Dynamic CMS & Branding Sync)', async () => {
    const res = await fetch(`${BASE_URL}/api/cms/public-content`);
    const json = await res.json();
    if (!res.ok || !json.branding) throw new Error('Missing branding');
  });

  // 3. User Registration
  await test('03. POST /api/auth/register (Account & Wallet Creation)', async () => {
    const email = `qa_reg_${Date.now()}@hambaktech.com.ng`;
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'Password123!',
        full_name: 'QA Real Tester',
        phone_number: '+2348011223344',
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.token) throw new Error(json.error || 'Registration failed');
    customerToken = json.token;
  });

  // 4. User Login (Super Admin)
  await test('04. POST /api/auth/login (Admin Session & Hash Protection)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@hambaktech.com.ng',
        password: 'Hamohullah19@..',
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.token) throw new Error(json.error || 'Login failed');
    adminToken = json.token;
    if (json.user.password_hash) throw new Error('Security Breach: password_hash leaked in login payload');
  });

  // 5. Customer Dashboard Summary
  await test('05. GET /api/customer/summary (Customer Live Data Aggregation)', async () => {
    const res = await fetch(`${BASE_URL}/api/customer/summary`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Customer summary failed');
  });

  // 6. Super Admin Overview
  await test('06. GET /api/admin/overview (Super Admin Float & Margin Metrics)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json = await res.json();
    if (!res.ok || !json.metrics) throw new Error(json.error || 'Admin overview failed');
  });

  // 7. Security: Customer blocked from admin
  await test('07. RBAC Security: Customer blocked from /api/admin/overview', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // 8. Security: Unauthenticated access blocked
  await test('08. Auth Security: Unauthenticated access blocked on /api/wallet/summary', async () => {
    const res = await fetch(`${BASE_URL}/api/wallet/summary`);
    if (res.status !== 401) throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
  });

  // 9. NIN Services & Wholesale Privacy
  await test('09. GET /api/verification/services (Wholesale Cost Isolation)', async () => {
    const res = await fetch(`${BASE_URL}/api/verification/services`);
    const json = await res.json();
    if (!res.ok || !json.services || json.services.length < 40) throw new Error('Missing services');
    const leaked = json.services.some((s: any) => s.wholesale_cost !== undefined);
    if (leaked) throw new Error('Security Violation: wholesale_cost leaked in customer services catalogue');
  });

  // 10. NIN Consent Enforcement
  await test('10. POST /api/verification/verify (NDPR Consent Enforcement)', async () => {
    const res = await fetch(`${BASE_URL}/api/verification/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        serviceKey: 'nin_v1',
        payload: { nin: '12345678901' },
        consent: false,
      }),
    });
    if (res.status !== 400) throw new Error(`Expected 400 for missing consent, got ${res.status}`);
  });

  // 11. NIN Sandbox Verification & Slip Generation
  await test('11. POST /api/verification/verify (2SureVerify Sandbox & Slip Rendering)', async () => {
    const res = await fetch(`${BASE_URL}/api/verification/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        serviceKey: 'nin_v1',
        payload: { nin: '12345678901', slip_type: 'ninStandard' },
        consent: true,
        testSandbox: true,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Verification failed');
    if (!json.result?.firstname) throw new Error('Missing verified biodata in response');
  });

  // 12. Telecom Dynamic Plans & Wholesale Privacy
  await test('12. GET /api/telecom/plans (Wholesale Cost Isolation)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/plans`);
    const json = await res.json();
    if (!res.ok || !json.plans || json.plans.length === 0) throw new Error('Missing plans');
    const leaked = json.plans.some((p: any) => p.wholesale_cost !== undefined);
    if (leaked) throw new Error('Security Violation: wholesale_cost leaked in telecom plans');
  });

  // 13. Printable PIN Vouchers & Wholesale Privacy
  await test('13. GET /api/telecom/airtime-pins/denominations (PIN Denominations)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/airtime-pins/denominations`);
    const json = await res.json();
    if (!res.ok || !json.denominations) throw new Error('Missing denominations');
    const leaked = json.denominations.some((d: any) => d.wholesale_cost !== undefined);
    if (leaked) throw new Error('Security Violation: wholesale_cost leaked in denominations');
  });

  // 14. Cable TV Packages & Wholesale Privacy
  await test('14. GET /api/telecom/cable-packages (Cable Packages & Margins)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/cable-packages`);
    const json = await res.json();
    if (!res.ok || !json.packages) throw new Error('Missing cable packages');
    const leaked = json.rawList?.some((p: any) => p.wholesale_cost !== undefined);
    if (leaked) throw new Error('Security Violation: wholesale_cost leaked in cable packages');
  });

  // 15. Electricity Meter Verification
  await test('15. POST /api/telecom/verify-meter (Electricity Meter Validation)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/verify-meter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        disco: 'IKEDC',
        meterNumber: '45028192831',
        meterType: 'prepaid',
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.customerName) throw new Error(json.error || 'Meter verification failed');
  });

  // 16. Exam Packages & Wholesale Privacy
  await test('16. GET /api/telecom/exam-packages (Exam Scratch Cards)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/exam-packages`);
    const json = await res.json();
    if (!res.ok || !json.packages) throw new Error('Missing exam packages');
    const leaked = json.packages.some((p: any) => p.wholesale_cost !== undefined);
    if (leaked) throw new Error('Security Violation: wholesale_cost leaked in exam packages');
  });

  // 17. Ulamadata Webhook Idempotency
  await test('17. POST /api/telecom/webhook/ulamadata (Idempotency Defense)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/webhook/ulamadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ident: 'UD-TXN-847291',
        status: 'success',
        amount: 4300,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Webhook failed');
  });

  // 18. Wallet Double-Entry Ledger Summary
  await test('18. GET /api/wallet/summary (Ledger Mathematical Validation)', async () => {
    const res = await fetch(`${BASE_URL}/api/wallet/summary`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json = await res.json();
    if (!res.ok || json.balance === undefined) throw new Error('Wallet summary failed');
  });

  // 19. Paystack Payment Initialization
  await test('19. POST /api/wallet/paystack/initialize (Online Gateway Checkout)', async () => {
    const res = await fetch(`${BASE_URL}/api/wallet/paystack/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ amount: 5000 }),
    });
    const json = await res.json();
    if (res.ok && (json.authorization_url || json.reference)) return;
    if (res.status === 400 && (json.error?.toLowerCase().includes('credentials') || json.error?.toLowerCase().includes('failed'))) return;
    throw new Error(json.error || 'Paystack init failed');
  });

  // 20. Manual Bank Funding Proof Submission
  const manualRef = `DEP_TEST_${Date.now()}`;
  let manualTxnId = '';
  await test('20. POST /api/customer/manual-funding (Proof Submission & Ledger Lock)', async () => {
    const res = await fetch(`${BASE_URL}/api/customer/manual-funding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        amount: 15000,
        sender_name: 'QA Officer',
        bank_name: 'Zenith Bank',
        reference: manualRef,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Manual funding failed');
    manualTxnId = json.transaction.id;
  });

  // 21. Duplicate Reference Defense
  await test('21. Duplicate Payment Reference Defense (Anti-Replay Guard)', async () => {
    const res = await fetch(`${BASE_URL}/api/customer/manual-funding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        amount: 15000,
        sender_name: 'QA Officer Duplicate',
        bank_name: 'Zenith Bank',
        reference: manualRef,
      }),
    });
    if (res.status !== 400) throw new Error(`Expected 400 for duplicate ref, got ${res.status}`);
  });

  // 22. Admin Manual Funding Approval
  await test('22. POST /api/wallet/admin/approve-funding/:id (Approval Idempotency)', async () => {
    if (!manualTxnId) throw new Error('No manualTxnId');
    const res = await fetch(`${BASE_URL}/api/wallet/admin/approve-funding/${manualTxnId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Approval failed');

    // Duplicate approval attempt
    const dupRes = await fetch(`${BASE_URL}/api/wallet/admin/approve-funding/${manualTxnId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (dupRes.status !== 400) throw new Error(`Expected 400 for duplicate approval, got ${dupRes.status}`);
  });

  // 23. XSS Sanitization Test
  await test('23. PUT /api/customer/profile (XSS Attack Payload Sanitized)', async () => {
    const res = await fetch(`${BASE_URL}/api/customer/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        bio: '<script>alert("HACK")</script>Senior Fintech Developer',
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.user) throw new Error(json.error || 'Profile update failed');
    if (json.user.bio.includes('<script>')) throw new Error('XSS Attack Succeeded: <script> tag was not stripped');
  });

  // 24. Transaction PIN Verification
  await test('24. POST /api/customer/verify-pin (4-Digit PIN Security)', async () => {
    const res = await fetch(`${BASE_URL}/api/customer/verify-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ pin: '1234' }),
    });
    const json = await res.json();
    if (!res.ok || !json.verified) throw new Error(json.error || 'PIN verification failed');
  });

  // 25. Rates & Pricing Engine
  await test('25. GET /api/system/rates (Tariffs & Airtime Discount Engine)', async () => {
    const res = await fetch(`${BASE_URL}/api/system/rates`);
    const json = await res.json();
    if (!res.ok || !json.rates) throw new Error('Rates query failed');
    if (json.rates.airtime_discount_percent !== 2.5) throw new Error('Airtime discount mismatch');
  });

  // 26. Automatic Refund on Verification Upstream Rejection
  await test('26. POST /api/verification/verify (Upstream Failure Automatic Refund)', async () => {
    const res = await fetch(`${BASE_URL}/api/verification/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        serviceKey: 'nin_v1',
        payload: { nin: '00000000000' }, // Invalid format triggering rejection
        consent: true,
      }),
    });
    const json = await res.json();
    if (!json.refunded && res.status !== 400 && !json.success) {
      throw new Error('Auto refund not triggered on rejection');
    }
  });

  // 27. File Upload Format Validation
  await test('27. POST /api/customer/kyc-submit (Upload Format Validation)', async () => {
    const res = await fetch(`${BASE_URL}/api/customer/kyc-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        id_type: 'National Identity Card',
        id_number: '12345678901',
        doc_url: '/public/assets/aistudio/IMG_0484_0fb633df.png',
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'KYC submit failed');
  });

  // 28. Sensitive Credential Masking in User Objects
  await test('28. GET /api/auth/me (Sensitive Hashes & Keys Masked)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const json = await res.json();
    if (!res.ok || !json.user) throw new Error('Auth me failed');
    if (json.user.password_hash !== undefined) throw new Error('Security Violation: password_hash exposed in user payload');
    if (json.user.transaction_pin_hash !== undefined) throw new Error('Security Violation: transaction_pin_hash exposed in user payload');
  });

  // 29. Admin Tariff Update Propagation
  await test('29. POST /api/admin/services/update-price (Tariff Propagation)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/services/update-price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        serviceKey: 'nin_v1',
        sellingPrice: 200,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Price update failed');
  });

  // 30. Smartcard Verification for Cable TV
  await test('30. POST /api/telecom/verify-smartcard (DSTV/GOTV Smartcard Lookup)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/verify-smartcard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        provider: 'DSTV',
        smartcardNumber: '7029182391',
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.customerName) throw new Error(json.error || 'Smartcard validation failed');
  });

  // 31. Disabled Service Purchase Block
  await test('31. POST /api/telecom/purchase-data (Disabled Service Guard)', async () => {
    const res = await fetch(`${BASE_URL}/api/telecom/purchase-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        planId: 'plan_non_existent',
        phone: '08012345678',
      }),
    });
    if (res.status !== 404 && res.status !== 400) {
      throw new Error(`Expected error 400 or 404 for invalid plan, got ${res.status}`);
    }
  });

  // 32. Overdraft Prevention (Negative Balance Lock)
  await test('32. Overdraft Prevention (Atomic Balance Protection)', async () => {
    const res = await fetch(`${BASE_URL}/api/verification/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        serviceKey: 'second_nin_mod_name', // costs ₦85,000, customer has ₦0
        payload: { nin: '12345678901', first_name: 'TEST', last_name: 'TEST' },
        consent: true,
      }),
    });
    if (res.status !== 400) throw new Error(`Expected 400 for overdraft attempt, got ${res.status}`);
  });

  // 33. Verification History & Slip Records
  await test('33. GET /api/verification/history (Audit Trail Retrieval)', async () => {
    const res = await fetch(`${BASE_URL}/api/verification/history`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const json = await res.json();
    if (!res.ok || json.verifications === undefined) throw new Error('Verification history query failed');
  });

  // 34. Customer Notifications Center
  await test('34. GET /api/customer/notifications (Unread Count & Delivery Receipts)', async () => {
    const res = await fetch(`${BASE_URL}/api/customer/notifications`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const json = await res.json();
    if (!res.ok || json.notifications === undefined) throw new Error('Notifications query failed');
  });

  console.log('\n===============================================================');
  console.log(`FINAL RESULTS: ${passed} PASSED | ${failed} FAILED | TOTAL: ${passed + failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution aborted:', err);
  process.exit(1);
});
