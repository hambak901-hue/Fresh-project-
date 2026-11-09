/**
 * @file cpanel.ts
 * cPanel & TrueHost server deployment management.
 * Strictly restricted to authenticated Administrators and Super Administrators.
 * Performs genuine socket connectivity tests and guards server migration assets.
 */

import { Router } from 'express';
import net from 'net';
import { CREDENTIALS } from '../config/credentials.js';
import { db } from '../db/database.js';
import { parseToken } from './auth.js';

export const cpanelRouter = Router();

// Middleware: Require Admin or SuperAdmin
function requireAdmin(req: any, res: any, next: any) {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account is suspended.' });
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required' });
  }

  req.user = user;
  next();
}

// Middleware: Require SuperAdmin
function requireSuperAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Super Admin authorization required for this action' });
  }
  next();
}

// Apply requireAdmin to all cPanel routes
cpanelRouter.use(requireAdmin);

// GET /api/cpanel/info (Admin only)
cpanelRouter.get('/info', (req: any, res) => {
  const isConfigured = Boolean(CREDENTIALS.cpanel.ftpUser && CREDENTIALS.cpanel.ftpPass);

  res.json({
    server: {
      name: CREDENTIALS.cpanel.serverName,
      ip: CREDENTIALS.cpanel.serverIp,
      sftpHost: CREDENTIALS.cpanel.ftpHost,
      sftpPort: CREDENTIALS.cpanel.ftpPort,
      sftpConfigured: isConfigured,
      authMethod: 'SSH / SFTP Key or Password Authentication',
      status: isConfigured ? 'CONFIGURED' : 'PENDING_CREDENTIALS',
      nameservers: CREDENTIALS.cpanel.nameservers,
      webmail: CREDENTIALS.mail.webmailUrl,
      supportEmail: CREDENTIALS.mail.supportEmail,
    },
    deploymentTarget: {
      type: 'cPanel Cloud Hosting with Node.js Application Manager',
      passengerRoot: process.env.CPANEL_APP_ROOT || '/home/hambaktech/public_html',
      entryFile: 'server.js',
      nodeVersion: 'v20.x or v22.x',
    },
  });
});

// POST /api/cpanel/test-sftp (Admin only - Genuine socket connection test)
cpanelRouter.post('/test-sftp', async (req: any, res) => {
  const { ftpHost, ftpPort, ftpUser, ftpPass } = CREDENTIALS.cpanel;
  if (!ftpHost || !ftpPort) {
    return res.status(400).json({
      success: false,
      message: 'SFTP host or port not configured.',
    });
  }

  const startTime = Date.now();
  const socket = new net.Socket();
  let settled = false;

  socket.setTimeout(4000);

  const cleanup = () => {
    if (!socket.destroyed) {
      socket.destroy();
    }
  };

  const handleSuccess = (banner?: string) => {
    if (settled) return;
    settled = true;
    const latency = Date.now() - startTime;
    cleanup();
    db.logAudit('CPANEL_SFTP_SOCKET_CONNECTED', { host: ftpHost, port: ftpPort, latencyMs: latency }, req.user?.id, req.user?.email);
    return res.json({
      success: true,
      message: `Genuine TCP handshake verified to SFTP port ${ftpPort} at ${ftpHost} (${latency}ms).`,
      latencyMs: latency,
      banner: banner ? banner.trim().slice(0, 80) : undefined,
      connectionDetails: {
        protocol: 'SFTP / SSH',
        host: ftpHost,
        port: ftpPort,
        configuredCredentials: Boolean(ftpUser && ftpPass),
        timestamp: new Date().toISOString(),
      },
    });
  };

  const handleFailure = (err: any) => {
    if (settled) return;
    settled = true;
    cleanup();
    db.logAudit('CPANEL_SFTP_SOCKET_FAILED', { host: ftpHost, port: ftpPort, error: err.message }, req.user?.id, req.user?.email);
    return res.status(502).json({
      success: false,
      message: `Connection test failed to ${ftpHost}:${ftpPort}: ${err.message || 'Host unreachable or port blocked'}`,
      host: ftpHost,
      port: ftpPort,
    });
  };

  socket.on('data', (data) => {
    // SSH server usually sends SSH-2.0 banner immediately upon connect
    handleSuccess(data.toString('utf-8'));
  });

  socket.on('connect', () => {
    // If connected, give 500ms to receive SSH identification banner
    setTimeout(() => {
      handleSuccess();
    }, 500);
  });

  socket.on('timeout', () => {
    handleFailure(new Error('Connection timed out after 4000ms'));
  });

  socket.on('error', (err) => {
    handleFailure(err);
  });

  try {
    socket.connect(ftpPort, ftpHost);
  } catch (err: any) {
    handleFailure(err);
  }
});

// GET /api/cpanel/export-package (SuperAdmin only)
cpanelRouter.get('/export-package', requireSuperAdmin, (req: any, res) => {
  const htaccessContent = `# HambakTech Enterprise cPanel .htaccess
# Reverse proxy / Passenger Node.js app routing
DirectoryIndex ""
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
`;

  const sqlMigrationSchema = `-- HambakTech Enterprise MySQL Database Schema for cPanel
CREATE DATABASE IF NOT EXISTS \`hambaktech_db\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`hambaktech_db\`;

CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`email\` VARCHAR(191) NOT NULL UNIQUE,
  \`password_hash\` VARCHAR(255) NOT NULL,
  \`full_name\` VARCHAR(255) NOT NULL,
  \`phone_number\` VARCHAR(32) NOT NULL,
  \`role\` ENUM('customer', 'admin', 'superadmin') DEFAULT 'customer',
  \`wallet_balance\` DECIMAL(15, 2) DEFAULT 0.00,
  \`kyc_status\` ENUM('unverified', 'pending', 'verified', 'rejected') DEFAULT 'unverified',
  \`tier\` INT DEFAULT 1,
  \`referral_code\` VARCHAR(32),
  \`status\` ENUM('active', 'suspended') DEFAULT 'active',
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS \`transactions\` (
  \`id\` VARCHAR(64) PRIMARY KEY,
  \`user_id\` VARCHAR(64) NOT NULL,
  \`type\` ENUM('credit', 'debit') NOT NULL,
  \`amount\` DECIMAL(15, 2) NOT NULL,
  \`balance_before\` DECIMAL(15, 2) NOT NULL,
  \`balance_after\` DECIMAL(15, 2) NOT NULL,
  \`category\` VARCHAR(64) NOT NULL,
  \`reference\` VARCHAR(128) NOT NULL UNIQUE,
  \`gateway\` VARCHAR(64) DEFAULT 'internal',
  \`status\` VARCHAR(32) DEFAULT 'successful',
  \`description\` TEXT,
  \`metadata\` JSON,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

  db.logAudit('CPANEL_EXPORT_PACKAGE_ACCESSED', {}, req.user?.id, req.user?.email);

  res.json({
    htaccess: htaccessContent,
    sqlMigration: sqlMigrationSchema,
    setupInstructions: [
      '1. Log into cPanel at LON110',
      '2. Navigate to "Setup Node.js App"',
      '3. Select Node.js 20.x, set Application root to "hambaktech", Application URL to "hambaktech.com.ng"',
      '4. Set Application startup file to "server.js"',
      '5. Run "npm install --production" in the Node.js interface',
      '6. Create MySQL Database "hambaktech_db" and import migration SQL',
      '7. Configure environment variables in cPanel Node.js Application Manager',
    ],
  });
});
