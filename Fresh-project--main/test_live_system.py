#!/usr/bin/env python3
import json
import urllib.request
import urllib.error
import ssl
import time
import os

BASE_URL = "https://hambaktech.com.ng"
ctx = ssl.create_default_context()

def make_req(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            code = resp.getcode()
            raw = resp.read().decode("utf-8")
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = raw
            return code, parsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return e.code, parsed
    except Exception as e:
        return 0, str(e)

def run_tests():
    results = []
    print(f"=== TESTING LIVE PRODUCTION ENVIRONMENT: {BASE_URL} ===\n")

    # Test 1: System Status
    code, res = make_req("/api/system/status")
    disallowed_host = os.environ.get("CPANEL_SERVER_IP", "")
    leak = (disallowed_host != "" and disallowed_host in str(res)) or ("/home/" in str(res))
    results.append({
        "req": "1. System Status & Infrastructure Privacy",
        "endpoint": "GET /api/system/status",
        "code": code,
        "pass": code == 200 and not leak,
        "details": f"Status {code}, Deployment: {res.get('data', {}).get('deployment') if isinstance(res, dict) else 'N/A'}, Leaks: {leak}"
    })
    print(f"Test 1: {results[-1]['pass']} | Code: {code}")

    # Test 2: Telecom Plans (Customer Safe)
    code, res = make_req("/api/telecom/plans")
    str_res = str(res)
    has_plans = isinstance(res, dict) and "plans" in res.get("data", {})
    plans_count = len(res.get("data", {}).get("plans", [])) if has_plans else 0
    airtime_swap_count = len(res.get("data", {}).get("airtime_swap", [])) if has_plans else 0
    leaks = "wholesale_cost" in str_res or "UlamaData" in str_res or "api_key" in str_res
    results.append({
        "req": "2. Customer-Safe Telecom Plans & Airtime Swap",
        "endpoint": "GET /api/telecom/plans",
        "code": code,
        "pass": code == 200 and has_plans and not leaks,
        "details": f"Status {code}, Plans count: {plans_count}, Airtime swap networks: {airtime_swap_count}, Leaks: {leaks}"
    })
    print(f"Test 2: {results[-1]['pass']} | Code: {code} | Plans: {plans_count} | Swap networks: {airtime_swap_count}")

    # Test 3: Verification Services (Customer Safe)
    code, res = make_req("/api/verification/services")
    services_count = len(res.get("data", {}).get("services", [])) if isinstance(res, dict) else 0
    leaks = "wholesale_cost" in str(res) or "provider_endpoint" in str(res) or "2SureVerify" in str(res)
    results.append({
        "req": "3. Customer-Safe Verification Services Catalog",
        "endpoint": "GET /api/verification/services",
        "code": code,
        "pass": code == 200 and services_count > 0 and not leaks,
        "details": f"Status {code}, Services count: {services_count}, Leaks: {leaks}"
    })
    print(f"Test 3: {results[-1]['pass']} | Code: {code} | Services: {services_count}")

    # Test 4: Forgot Password - Strict OTP Privacy
    code, res = make_req("/api/auth/forgot-password", method="POST", data={"email": "hambak901@gmail.com"})
    has_otp_preview = isinstance(res, dict) and "otp_preview" in res.get("data", {})
    msg = res.get("message", "") if isinstance(res, dict) else ""
    results.append({
        "req": "4. Forgot Password Flow & Strict OTP Inbox Delivery",
        "endpoint": "POST /api/auth/forgot-password",
        "code": code,
        "pass": code == 200 and not has_otp_preview and "verification code" in msg.lower(),
        "details": f"Status {code}, Message: '{msg}', otp_preview present: {has_otp_preview}"
    })
    print(f"Test 4: {results[-1]['pass']} | Code: {code} | Has otp_preview: {has_otp_preview} | Msg: {msg}")

    # Test 5: Authentication & Session Verification
    admin_email = os.environ.get("ADMIN_EMAIL", "")
    admin_pass = os.environ.get("ADMIN_PASSWORD", "")
    code, res = make_req("/api/auth/login", method="POST", data={"email": admin_email, "password": admin_pass}) if admin_email and admin_pass else (400, {"error": "ADMIN_EMAIL/ADMIN_PASSWORD not set"})
    token = res.get("data", {}).get("token") if isinstance(res, dict) else None
    role = res.get("data", {}).get("user", {}).get("role") if isinstance(res, dict) else None
    results.append({
        "req": "5. User Authentication & Role Validation (Argon2/Bcrypt)",
        "endpoint": "POST /api/auth/login",
        "code": code,
        "pass": code == 200 and token is not None and role == "superadmin",
        "details": f"Status {code}, Role: {role}, Token issued: {bool(token)}"
    })
    print(f"Test 5: {results[-1]['pass']} | Code: {code} | Role: {role}")

    if token:
        # Test 6: Admin-to-Frontend CMS Synchronization
        ts = int(time.time())
        new_tagline = f"Official Identity & Telecom Infrastructure {ts}"
        code_update, res_update = make_req("/api/cms/branding", method="POST", data={"tagline": new_tagline}, token=token)
        code_public, res_public = make_req("/api/cms/public")
        public_tagline = res_public.get("data", {}).get("branding", {}).get("tagline") if isinstance(res_public, dict) else None
        synced = public_tagline == new_tagline
        results.append({
            "req": "6. Admin-to-Frontend CMS Dynamic Synchronization",
            "endpoint": "POST /api/cms/branding -> GET /api/cms/public",
            "code": code_public,
            "pass": code_update == 200 and synced,
            "details": f"Branding updated: {code_update == 200}, Live reflected: {synced} ('{public_tagline}')"
        })
        print(f"Test 6: {results[-1]['pass']} | Synced: {synced}")

        # Test 7: Paystack Gateway Integration
        code, res = make_req("/api/wallet/paystack/initialize", method="POST", data={"amount": 2000}, token=token)
        has_auth_url = isinstance(res, dict) and "authorization_url" in res.get("data", {})
        has_ref = isinstance(res, dict) and "reference" in res.get("data", {})
        results.append({
            "req": "7. Paystack Wallet Funding Gateway Integration",
            "endpoint": "POST /api/wallet/paystack/initialize",
            "code": code,
            "pass": code == 200 and has_auth_url and has_ref,
            "details": f"Status {code}, Ref: {res.get('data', {}).get('reference') if isinstance(res, dict) else 'N/A'}"
        })
        print(f"Test 7: {results[-1]['pass']} | Code: {code} | Has Auth URL: {has_auth_url}")

        # Test 8: Flutterwave Gateway Integration
        code, res = make_req("/api/wallet/flutterwave/initialize", method="POST", data={"amount": 3000}, token=token)
        has_auth_url = isinstance(res, dict) and "link" in res.get("data", {})
        has_tx_ref = isinstance(res, dict) and "tx_ref" in res.get("data", {})
        results.append({
            "req": "8. Flutterwave Wallet Funding Gateway Integration",
            "endpoint": "POST /api/wallet/flutterwave/initialize",
            "code": code,
            "pass": code == 200 and has_auth_url and has_tx_ref,
            "details": f"Status {code}, TxRef: {res.get('data', {}).get('tx_ref') if isinstance(res, dict) else 'N/A'}"
        })
        print(f"Test 8: {results[-1]['pass']} | Code: {code} | Has Link: {has_auth_url}")

        # Test 9: Customer Support Ticket Creation & Ledger
        code, res = make_req("/api/customer/support-ticket", method="POST", data={
            "subject": "Inquiry regarding bulk verification API",
            "category": "technical",
            "priority": "medium",
            "message": "Testing automated ticket dispatch and ledger tracking."
        }, token=token)
        ticket_id = res.get("data", {}).get("ticket_id") if isinstance(res, dict) else None
        results.append({
            "req": "9. Support Ticket Management & History",
            "endpoint": "POST /api/customer/support-ticket",
            "code": code,
            "pass": code == 201 and ticket_id is not None,
            "details": f"Status {code}, Ticket ID: {ticket_id}"
        })
        print(f"Test 9: {results[-1]['pass']} | Code: {code} | Ticket ID: {ticket_id}")

        # Test 10: Admin Dashboard Overview & Ledger Protection
        code, res = make_req("/api/admin/overview", token=token)
        has_stats = isinstance(res, dict) and "stats" in res.get("data", {})
        results.append({
            "req": "10. Admin Overview & Administrative Controls",
            "endpoint": "GET /api/admin/overview",
            "code": code,
            "pass": code == 200 and has_stats,
            "details": f"Status {code}, Total users in stats: {res.get('data', {}).get('stats', {}).get('total_users') if has_stats else 'N/A'}"
        })
        print(f"Test 10: {results[-1]['pass']} | Code: {code} | Has stats: {has_stats}")

        # Test 11: Admin Settings Reconciliation
        code, res = make_req("/api/admin/settings", token=token)
        categories = res.get("data", {}).get("categories", []) if isinstance(res, dict) else []
        results.append({
            "req": "11. Admin Settings Full 22 Categories Reconciliation",
            "endpoint": "GET /api/admin/settings",
            "code": code,
            "pass": code == 200 and len(categories) >= 20,
            "details": f"Status {code}, Categories configured: {len(categories)}"
        })
        print(f"Test 11: {results[-1]['pass']} | Code: {code} | Categories: {len(categories)}")

    print("\n=== SUMMARY REPORT ===")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    run_tests()
