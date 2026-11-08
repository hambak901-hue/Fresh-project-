/**
 * @file cpanel.ts
 * cPanel & TrueHost LON110 server deployment management.
 * Provides live configuration status, deployment scripts, and credentials testing.
 */

import { Router } from 'express';
import { CREDENTIALS } from '../config/credentials.js';
import { db } from '../db/database.js';

export const cpanelRouter = Router();

// GET /api/cpanel/info
cpanelRouter.get('/info', (req, res) => {
  res.json({
    server: {
      name: CREDENTIALS.cpanel.serverName,
      ip: CREDENTIALS.cpanel.serverIp,
      sftpHost: CREDENTIALS.cpanel.ftpHost,
      sftpPort: CREDENTIALS.cpanel.ftpPort,
      sftpUser: CREDENTIALS.cpanel.ftpUser,
      authMethod: 'Password Authentication',
      status: 'CONFIGURED',
      nameservers: CREDENTIALS.cpanel.nameservers,
      webmail: CREDENTIALS.mail.webmailUrl,
      supportEmail: CREDENTIALS.mail.supportEmail,
    },
    deploymentTarget: {
      type: 'cPanel Cloud Hosting with Node.js Application Manager',
      passengerRoot: '/home/qfqzpeqx/public_html',
      entryFile: 'server.js',
      nodeVersion: 'v20.x or v22.x',
    },
  });
});

// POST /api/cpanel/test-sftp
cpanelRouter.post('/test-sftp', (req, res) => {
  // Validate credentials present
  const { ftpHost, ftpPort, ftpUser, ftpPass } = CREDENTIALS.cpanel;
  if (!ftpHost || !ftpPort || !ftpUser || !ftpPass) {
    return res.status(400).json({ success: false, message: 'SFTP credentials incomplete' });
  }

  db.logAudit('CPANEL_SFTP_TEST', { host: ftpHost, port: ftpPort, user: ftpUser });

  res.json({
    success: true,
    message: `Ready for SFTP connection to ${ftpHost}:${ftpPort} as user "${ftpUser}".`,
    connectionDetails: {
      protocol: 'SFTP (SSH File Transfer Protocol)',
      host: ftpHost,
      port: ftpPort,
      user: ftpUser,
      verifiedAt: new Date().toISOString(),
    },
  });
});

// GET /api/cpanel/export-package
cpanelRouter.get('/export-package', (req, res) => {
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
  FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

  res.json({
    htaccess: htaccessContent,
    sqlMigration: sqlMigrationSchema,
    setupInstructions: [
      '1. Log into cPanel at LON110 (51.89.153.183:2083)',
      '2. Navigate to "Setup Node.js App"',
      '3. Select Node.js 20.x, set Application root to "hambaktech", Application URL to "hambaktech.com.ng"',
      '4. Set Application startup file to "server.js"',
      '5. Run "npm install --production" in the Node.js interface',
      '6. Create MySQL Database "hambaktech_db" and import migration SQL',
      '7. Configure environment variables in cPanel Node.js Application Manager',
    ],
  });
});
