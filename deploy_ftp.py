#!/usr/bin/env python3
"""
HambakTech cPanel Production Deployment Script
Deploys Vite static build (HTML/CSS/JS) and PHP backend to public_html via Pure-FTPd.
"""

import os
import ftplib
import sys
import time

FTP_HOST = "51.89.153.183"
FTP_PORT = 21
FTP_USER = "qfqzpeqx"
FTP_PASS = os.environ.get("CPANEL_SFTP_PASS", "2h9PAQk[kE[t96")
REMOTE_ROOT = "public_html"

def connect_ftp():
    print(f"Connecting to FTP {FTP_HOST}:{FTP_PORT}...")
    ftp = ftplib.FTP()
    ftp.connect(FTP_HOST, FTP_PORT, timeout=30)
    ftp.login(FTP_USER, FTP_PASS)
    ftp.set_pasv(True)
    print(f"Logged in as {FTP_USER}. Welcome banner:\n{ftp.getwelcome()}\n")
    return ftp

def ensure_remote_dir(ftp, remote_path):
    parts = [p for p in remote_path.strip("/").split("/") if p]
    current = ""
    for part in parts:
        current += "/" + part
        try:
            ftp.cwd(current)
        except Exception:
            try:
                ftp.mkd(current)
                print(f"Created remote directory: {current}")
                ftp.cwd(current)
            except Exception as e:
                print(f"Could not create/enter {current}: {e}")

def upload_file(ftp, local_path, remote_path):
    remote_dir = os.path.dirname(remote_path)
    filename = os.path.basename(remote_path)
    ensure_remote_dir(ftp, remote_dir)
    ftp.cwd(remote_dir)
    print(f"Uploading {local_path} -> {remote_path}...", end=" ", flush=True)
    with open(local_path, "rb") as f:
        ftp.storbinary(f"STOR {filename}", f)
    print("DONE")

def upload_directory_recursive(ftp, local_dir, remote_base_dir, skip_dirs=None, skip_files=None):
    skip_dirs = set(skip_dirs or [])
    skip_files = set(skip_files or [])
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith('.')]
        rel_dir = os.path.relpath(root, local_dir)
        if rel_dir == ".":
            target_remote_dir = remote_base_dir
        else:
            target_remote_dir = os.path.join(remote_base_dir, rel_dir).replace("\\", "/")

        for file in files:
            if file in skip_files or file.endswith('.log'):
                continue
            local_file = os.path.join(root, file)
            remote_file = os.path.join(target_remote_dir, file).replace("\\", "/")
            upload_file(ftp, local_file, remote_file)

def main():
    print("=== STARTING HAMBAKTECH CPANEL DEPLOYMENT ===")
    start_time = time.time()
    
    # 1. Connect
    ftp = connect_ftp()
    
    # Check if remote_root exists
    try:
        ftp.cwd(f"/{REMOTE_ROOT}")
    except Exception as e:
        print(f"Error navigating to /{REMOTE_ROOT}: {e}")
        sys.exit(1)

    # 2. Ensure upload directories exist
    ensure_remote_dir(ftp, f"/{REMOTE_ROOT}/uploads/logos")

    # 3. Backup existing index.html if present
    try:
        ftp.cwd(f"/{REMOTE_ROOT}")
        filenames = ftp.nlst()
        if "index.html" in filenames:
            print("Backing up existing remote index.html to index.html.prev_backup...")
            try:
                ftp.rename("index.html", "index.html.prev_backup")
            except Exception:
                pass
    except Exception as e:
        print("Notice checking existing files:", e)

    # 4. Upload Vite build assets (dist/)
    print("\n--- Deploying Frontend (dist/ -> public_html/) ---")
    dist_dir = "dist"
    if not os.path.exists(dist_dir):
        print(f"Error: {dist_dir} does not exist. Run 'npm run build' first.")
        sys.exit(1)
    
    upload_directory_recursive(ftp, dist_dir, f"/{REMOTE_ROOT}")

    # 5. Deploy PHP Backend (/backend/ -> public_html/backend/ and public_html/api/)
    # Preserve live config/, storage/, logs on cPanel
    print("\n--- Deploying PHP Backend (backend/ -> public_html/backend/ and public_html/api/, preserving config/) ---")
    backend_dir = "backend"
    if os.path.exists(backend_dir):
        skip_d = ["config", "storage", "uploads"]
        skip_f = ["error_log", ".env"]
        upload_directory_recursive(ftp, backend_dir, f"/{REMOTE_ROOT}/backend", skip_dirs=skip_d, skip_files=skip_f)
        upload_directory_recursive(ftp, backend_dir, f"/{REMOTE_ROOT}/api", skip_dirs=skip_d, skip_files=skip_f)

    # 6. Verify public_html contents
    ftp.cwd(f"/{REMOTE_ROOT}")
    print("\n--- Final public_html listing ---")
    print(ftp.nlst()[:30])

    ftp.quit()
    elapsed = time.time() - start_time
    print(f"\n=== DEPLOYMENT COMPLETED SUCCESSFULLY IN {elapsed:.2f}s ===")

if __name__ == "__main__":
    main()
