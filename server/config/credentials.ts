/**
 * @file credentials.ts
 * Server-side secure credentials vault.
 * Loads verified production credentials for HambakTech from environment variables.
 * Never exposed to client-side bundles.
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// Generate an ephemeral random key in development if JWT_SECRET is not explicitly provided in environment
const ephemeralSecret = crypto.randomBytes(32).toString('hex');

export const CREDENTIALS = {
  app: {
    name: 'HambakTech Enterprise Portal',
    domain: 'hambaktech.com.ng',
    appUrl: process.env.APP_URL || 'https://hambaktech.com.ng',
    port: parseInt(process.env.PORT || '3000', 10),
    jwtSecret: process.env.JWT_SECRET || ephemeralSecret,
  },

  // Identity & KYC Verification APIs
  verification: {
    veripine: {
      apiKey: process.env.VERIPINE_API_KEY || '',
      baseUrl: 'https://api.veripine.com/v1',
    },
    sureverify: {
      apiKey: process.env.SUREVERIFY_API_KEY || '',
      baseUrl: 'https://api.2sureverify.com/api',
    },
  },

  // Telecommunications & VTU Providers
  telecom: {
    ulamaData: {
      apiKey: process.env.ULAMADATA_API_KEY || '',
      baseUrl: 'https://ulamadata.com/api',
    },
    vtpass: {
      apiKey: process.env.VTPASS_API_KEY || '',
      publicKey: process.env.VTPASS_PUBLIC_KEY || '',
      secretKey: process.env.VTPASS_SECRET_KEY || '',
      baseUrl: 'https://api-service.vtpass.com/api',
    },
  },

  // Payment Gateways
  payments: {
    flutterwave: {
      clientId: process.env.FLUTTERWAVE_CLIENT_ID || '',
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
      encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
    },
    paystack: {
      secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    },
  },

  // SMTP & Mail Settings (Truehost LON110)
  mail: {
    host: process.env.SMTP_HOST || 'mail.hambaktech.com.ng',
    fallbackHost: 'lon110.truehost.cloud',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    fallbackPort: 587,
    secure: process.env.SMTP_SECURE === 'true' || true,
    user: process.env.SMTP_USER || 'support@hambaktech.com.ng',
    infoUser: 'info@hambaktech.com.ng',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'HambakTech Support <support@hambaktech.com.ng>',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@hambaktech.com.ng',
    infoEmail: process.env.INFO_EMAIL || 'info@hambaktech.com.ng',
    webmailUrl: process.env.WEBMAIL_URL || 'http://www.hambaktech.com.ng/webmail',
    incomingServer: 'mail.hambaktech.com.ng',
    imapPort: 993,
    pop3Port: 995,
  },

  // cPanel Hosting & SFTP Deployment Configuration
  cpanel: {
    serverName: process.env.CPANEL_SERVER_NAME || 'LON110',
    serverIp: process.env.CPANEL_SERVER_IP || '51.89.153.183',
    ftpHost: process.env.CPANEL_SFTP_HOST || '51.89.153.183',
    ftpPort: parseInt(process.env.CPANEL_SFTP_PORT || '1624', 10),
    ftpUser: process.env.CPANEL_SFTP_USER || '',
    ftpPass: process.env.CPANEL_SFTP_PASS || '',
    nameservers: [
      'ns1.cloudoon.com (57.128.250.247)',
      'ns2.cloudoon.net (49.12.105.164)',
      'ns3.cloudoon.org (158.69.211.95)',
    ],
  },
};
