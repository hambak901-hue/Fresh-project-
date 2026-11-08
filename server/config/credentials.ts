/**
 * @file credentials.ts
 * Server-side secure credentials vault.
 * Loads verified production credentials for HambakTech.
 * Never exposed to client-side bundles.
 */

import dotenv from 'dotenv';
dotenv.config();

export const CREDENTIALS = {
  app: {
    name: 'HambakTech Enterprise Portal',
    domain: 'hambaktech.com.ng',
    appUrl: process.env.APP_URL || 'https://hambaktech.com.ng',
    port: parseInt(process.env.PORT || '3000', 10),
    jwtSecret: process.env.JWT_SECRET || 'hambaktech_jwt_super_secure_key_lon110_2026_x',
  },

  // Identity & KYC Verification APIs
  verification: {
    veripine: {
      apiKey: process.env.VERIPINE_API_KEY || 'ninbvn_6443d1d6279df9af26b60dc4',
      baseUrl: 'https://api.veripine.com/v1',
    },
    sureverify: {
      apiKey: process.env.SUREVERIFY_API_KEY || '664469ea92436a4c7ff997281a32a742dcd84f9a5e6603f0',
      baseUrl: 'https://api.2sureverify.com/api',
    },
  },

  // Telecommunications & VTU Providers
  telecom: {
    ulamaData: {
      apiKey: process.env.ULAMADATA_API_KEY || '7aOkA4OzIF6xfuUIXbvk7ByxVGH0U5gSNy1OfpYb',
      baseUrl: 'https://ulamadata.com/api',
    },
    vtpass: {
      apiKey: process.env.VTPASS_API_KEY || 'c0eb1581608e693f07a44b1e21b44b3a',
      publicKey: process.env.VTPASS_PUBLIC_KEY || 'PK_70323b6a3fb2a9935cb088d504dba889827c54d65c5',
      secretKey: process.env.VTPASS_SECRET_KEY || 'SK_49251b696102fd8cc7cb0b4577ea754b2a403aa504e',
      baseUrl: 'https://api-service.vtpass.com/api',
    },
  },

  // Payment Gateways
  payments: {
    flutterwave: {
      clientId: process.env.FLUTTERWAVE_CLIENT_ID || 'ee617da5-060b-40cd-b96a-19d83465caf2',
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY || 'EA7eW5ufUhixy8kZTnMePGAOp3rD1PwyWHKwc77cPWppzXQIJu1apqziDHzEUHaEYWeZsbskFrjwK',
      encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || 'JeILcT6i0ctrr4JRKOZyZUQ+XBBV3RJKpkdLmwOzKQY=',
    },
    paystack: {
      secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    },
  },

  // SMTP & Mail Settings (Truehost LON110)
  mail: {
    host: process.env.SMTP_HOST || 'lon110.truehost.cloud',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || false,
    user: process.env.SMTP_USER || 'notifications@hambaktech.com.ng',
    pass: process.env.SMTP_PASS || 'Hamohullah19@..',
    from: process.env.SMTP_FROM || 'HambakTech Notifications <notifications@hambaktech.com.ng>',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@hambaktech.com.ng',
    infoEmail: process.env.INFO_EMAIL || 'info@hambaktech.com.ng',
    webmailUrl: process.env.WEBMAIL_URL || 'http://www.hambaktech.com.ng/webmail',
  },

  // cPanel Hosting & SFTP Deployment Configuration
  cpanel: {
    serverName: process.env.CPANEL_SERVER_NAME || 'LON110',
    serverIp: process.env.CPANEL_SERVER_IP || '51.89.153.183',
    ftpHost: process.env.CPANEL_SFTP_HOST || '51.89.153.183',
    ftpPort: parseInt(process.env.CPANEL_SFTP_PORT || '1624', 10),
    ftpUser: process.env.CPANEL_SFTP_USER || 'qfqzpeqx',
    ftpPass: process.env.CPANEL_SFTP_PASS || '2h9PAQk[kE[t96',
    nameservers: [
      'ns1.cloudoon.com (57.128.250.247)',
      'ns2.cloudoon.net (49.12.105.164)',
      'ns3.cloudoon.org (158.69.211.95)',
    ],
  },
};
