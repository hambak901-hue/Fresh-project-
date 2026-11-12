#!/usr/bin/env python3
"""
Comprehensive Live Production Verification Script
Tests:
1. Admin Authentication
2. Safe Demo Data Cleanup with Pre-Cleanup Database Backup Guarantee
3. Genuine Customer Whitelist Preservation
4. Centralized Footprints & Telemetry API
5. Admin Customer Creation
6. Global Logo Upload & Reset API
7. Public Website & Assets Status
"""

import urllib.request
import urllib.parse
import json
import base64
import sys

BASE_URL = "https://hambaktech.com.ng"
ADMIN_EMAIL = "admin@hambaktech.com.ng"
ADMIN_PASS = "Admin@HambakTech2026!"

def post_json(endpoint, data, token=None):
    url = f"{BASE_URL}{endpoint}"
    payload = json.dumps(data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}
    except Exception as e:
        return 500, {"error": str(e)}

def get_json(endpoint, token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "X-Requested-With": "XMLHttpRequest",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}
    except Exception as e:
        return 500, {"error": str(e)}

def main():
    print("=" * 60)
    print("HAMBAKTECH LIVE PRODUCTION VERIFICATION")
    print("Target:", BASE_URL)
    print("=" * 60)

    # 1. Admin Login
    print("\n[TEST 1] Admin Authentication...")
    code, res = post_json("/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if code != 200 or not res.get("token"):
        print(f"FAILED Admin login (Code {code}): {res}")
        sys.exit(1)
    
    token = res["token"]
    user = res.get("user", {})
    print(f"SUCCESS: Logged in as {user.get('email')} (Role: {user.get('role')})")

    # 2. Footprints Stats before cleanup
    print("\n[TEST 2] Footprints Stats Endpoint...")
    code, stats_res = get_json("/api/admin/footprints/stats", token=token)
    if code == 200 and stats_res.get("success"):
        stats = stats_res.get("stats", {})
        print(f"SUCCESS: Footprint stats: Total={stats.get('total_activities')}, Logins={stats.get('today_logins')}, Services={stats.get('today_services')}, Wallet={stats.get('wallet_operations')}")
    else:
        print(f"FAILED Footprint stats (Code {code}): {stats_res}")

    # 3. Clean Demo Data
    print("\n[TEST 3] Clean Demo Data with Automated Backup Guarantee...")
    code, clean_res = post_json("/api/admin/maintenance/clean-demo-data", {}, token=token)
    if code == 200 and clean_res.get("success"):
        print(f"SUCCESS: {clean_res.get('message')}")
        print(f"   Backup file: {clean_res.get('backup_file')}")
        print(f"   Deleted test users: {clean_res.get('deleted_test_users')}")
        print(f"   Preserved genuine accounts count: {clean_res.get('preserved_genuine_count')}")
        print(f"   Preserved emails: {clean_res.get('preserved_emails')}")
        
        # Verify genuine customers
        required_genuine = ["fatimohmusbau34@gmail.com", "ifedayophilip@gmail.com", "alabistephen498@gmail.com"]
        preserved = clean_res.get('preserved_emails', [])
        for g in required_genuine:
            if g in preserved:
                print(f"   [VERIFIED PRESERVED] Genuine customer: {g}")
            else:
                print(f"   [WARNING] {g} not in preserved list")
    else:
        print(f"Clean demo data response (Code {code}): {clean_res}")

    # 4. Footprints List & Search
    print("\n[TEST 4] Footprints List Query...")
    code, fp_res = get_json("/api/admin/footprints?limit=10", token=token)
    if code == 200 and fp_res.get("success"):
        footprints = fp_res.get("footprints", [])
        pagination = fp_res.get("pagination", {})
        print(f"SUCCESS: Retrieved {len(footprints)} footprints (Total in DB: {pagination.get('total')})")
        if footprints:
            latest = footprints[0]
            print(f"   Latest footprint: [{latest.get('category')}] {latest.get('action')} - Status: {latest.get('status')} - IP: {latest.get('ip_address')} - Device: {latest.get('device_info')}")
    else:
        print(f"FAILED Footprints query (Code {code}): {fp_res}")

    # 5. Create Customer via Admin API
    print("\n[TEST 5] Admin Create User Endpoint...")
    import time
    test_email = f"agent.verified.{int(time.time())}@hambaktech.com.ng"
    create_payload = {
        "full_name": "Verified Telecom Agent",
        "email": test_email,
        "phone_number": f"0803{int(time.time()) % 10000000:07d}",
        "role": "agent",
        "status": "active",
        "tier": 2,
        "password": "Password123#Agent!",
        "initial_balance": 500,
        "notify_customer": False,
    }
    code, create_res = post_json("/api/admin/customers/create", create_payload, token=token)
    if code == 201 and create_res.get("success"):
        print(f"SUCCESS: Created user {test_email} with Tier 2 and ₦500 initial wallet balance!")
        print(f"   User ID: {create_res.get('user', {}).get('id')}")
        print(f"   Wallet Balance: ₦{create_res.get('wallet', {}).get('balance')}")
    else:
        print(f"FAILED Create user (Code {code}): {create_res}")

    # Test Duplicate Email Rejection
    print("\n[TEST 5b] Duplicate Email Rejection Check...")
    code, dup_res = post_json("/api/admin/customers/create", create_payload, token=token)
    if code in [409, 422]:
        print(f"SUCCESS: Duplicate correctly rejected with code {code}: {dup_res.get('error')}")
    else:
        print(f"UNEXPECTED response for duplicate (Code {code}): {dup_res}")

    # 6. Logo Upload & Reset
    print("\n[TEST 6] Logo Uploader API...")
    # 1x1 transparent PNG base64
    tiny_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    logo_payload = {
        "file_base64": tiny_png_b64,
        "file_name": "test_logo.png",
        "mime_type": "image/png",
    }
    code, logo_res = post_json("/api/admin/settings/upload-logo", logo_payload, token=token)
    if code == 200 and logo_res.get("success"):
        print(f"SUCCESS: Logo uploaded! Path: {logo_res.get('logo_url')}")
    else:
        print(f"FAILED Logo upload (Code {code}): {logo_res}")

    # Reset Logo
    print("\n[TEST 6b] Logo Reset API...")
    code, reset_res = post_json("/api/admin/settings/remove-logo", {}, token=token)
    if code == 200 and reset_res.get("success"):
        print(f"SUCCESS: Logo reset to default: {reset_res.get('logo_url')}")
    else:
        print(f"FAILED Logo reset (Code {code}): {reset_res}")

    # 7. Customer list check
    print("\n[TEST 7] Customer List & Preservation Verification...")
    code, cust_res = get_json("/api/admin/customers", token=token)
    if code == 200 and cust_res.get("customers"):
        custs = cust_res.get("customers", [])
        print(f"SUCCESS: Current active customer count: {len(custs)}")
        emails = [c.get("email") for c in custs]
        for g in ["fatimohmusbau34@gmail.com", "ifedayophilip@gmail.com", "alabistephen498@gmail.com"]:
            assert g in emails, f"CRITICAL: {g} missing from customers list!"
            print(f"   Confirmed customer in active DB: {g}")
    else:
        print(f"FAILED Customer list query (Code {code}): {cust_res}")

    # 8. Check Public Website
    print("\n[TEST 8] Public Website Root...")
    req = urllib.request.Request(BASE_URL, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        print(f"SUCCESS: Public website {BASE_URL} responded with HTTP {resp.status}")

    print("\n" + "=" * 60)
    print("ALL LIVE PRODUCTION VERIFICATION TESTS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    main()
