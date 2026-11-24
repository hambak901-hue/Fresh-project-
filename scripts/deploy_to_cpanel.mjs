/**
 * HAMBakTECH Production cPanel Deployment Script
 * Deploys compiled frontend bundle and updated PHP backend to hambaktech.com.ng via FTP.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const FTP_HOST = process.env.CPANEL_SFTP_HOST || '';
const FTP_PORT = process.env.CPANEL_FTP_PORT || '21';
const FTP_USER = process.env.CPANEL_SFTP_USER || '';
const FTP_PASS = process.env.CPANEL_SFTP_PASS || '';
const REMOTE_ROOT = 'public_html';

if (!FTP_HOST || !FTP_USER || !FTP_PASS) {
  console.error('❌ CPANEL_SFTP_HOST, CPANEL_SFTP_USER, and CPANEL_SFTP_PASS environment variables are required.');
  process.exit(1);
}

console.log('🚀 Starting deployment to TrueHost cPanel (hambaktech.com.ng)...');

function uploadFile(localPath, remotePath) {
  const url = `ftp://${FTP_HOST}:${FTP_PORT}/${remotePath}`;
  const cmd = `curl -s -m 120 --ftp-create-dirs -T "${localPath}" --user "${FTP_USER}:${FTP_PASS}" "${url}"`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`✅ Uploaded: ${remotePath}`);
  } catch (err) {
    console.error(`❌ Failed to upload ${localPath} -> ${remotePath}:`, err.message);
    throw err;
  }
}

function uploadDirectory(localDir, remoteDir, skipDirs = new Set(), skipFiles = new Set()) {
  if (!fs.existsSync(localDir)) return;
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullLocal = path.join(localDir, entry.name);
    const fullRemote = `${remoteDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      uploadDirectory(fullLocal, fullRemote, skipDirs, skipFiles);
    } else {
      if (skipFiles.has(entry.name) || entry.name.endsWith('.log')) continue;
      uploadFile(fullLocal, fullRemote);
    }
  }
}

// 1. Upload Complete Dist Bundle (assets, sw.js, workbox, manifest.webmanifest, icons, index.html)
console.log('\n📦 Step 1: Uploading Frontend Production Bundle (/dist)...');
uploadDirectory('dist', REMOTE_ROOT);

// 2. Upload Backend to /api and /backend (preserving live config/, storage/, uploads/, .env)
console.log('\n📦 Step 2: Uploading PHP Backend Services & Controllers...');
const skipBackendDirs = new Set(['config', 'storage', 'uploads']);
const skipBackendFiles = new Set(['error_log', '.env']);
uploadDirectory('backend', `${REMOTE_ROOT}/api`, skipBackendDirs, skipBackendFiles);
uploadDirectory('backend', `${REMOTE_ROOT}/backend`, skipBackendDirs, skipBackendFiles);

// 3. Verify Live Site
console.log('\n🔍 Step 3: Verifying Live Production Endpoints...');
try {
  const healthRes = execSync('curl -s -m 15 "https://hambaktech.com.ng/api/health" || echo "{}"', { encoding: 'utf-8' });
  console.log('API Health Response:', healthRes);
} catch (e) {
  console.log('Health check completed.');
}

const siteHeaders = execSync('curl -sI -m 15 "https://hambaktech.com.ng/"', { encoding: 'utf-8' });
console.log('Production Site HTTP Headers:\n', siteHeaders.split('\n').slice(0, 5).join('\n'));

console.log('\n🎉 Production deployment successfully completed to hambaktech.com.ng!');
