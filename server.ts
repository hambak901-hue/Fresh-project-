/**
 * @file server.ts
 * Main entry point for HambakTech Enterprise Portal.
 * Runs Express with API endpoints and Vite middlewares in development.
 */

import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './server/routes/auth.js';
import { systemRouter } from './server/routes/system.js';
import { walletRouter } from './server/routes/wallet.js';
import { verificationRouter } from './server/routes/verification.js';
import { telecomRouter } from './server/routes/telecom.js';
import { cpanelRouter } from './server/routes/cpanel.js';
import { cmsRouter } from './server/routes/cms.js';
import { customerRouter } from './server/routes/customer.js';
import { adminRouter } from './server/routes/admin.js';
import { CREDENTIALS } from './server/config/credentials.js';

import { rateLimiter, sanitizeBody } from './server/services/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process-level exception handling to prevent dev server exit
process.on('uncaughtException', (err) => {
  console.error('[HambakTech] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[HambakTech] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  const app = express();
  const portArgIndex = process.argv.indexOf('--port');
  const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : null;
  // AI Studio requires port 3000. In Cloud Run containers, process.env.PORT is 8080 (reserved for container ingress).
  const PORT = cliPort || (process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Security Headers & XSS Prevention
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeBody(req.body);
    }
    next();
  });

  // Health and root API ping
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: CREDENTIALS.app.name,
      domain: CREDENTIALS.app.domain,
      timestamp: new Date().toISOString(),
    });
  });

  // Rate limit sensitive endpoints
  app.use('/api/auth/login', rateLimiter('auth', 30, 60000));
  app.use('/api/auth/register', rateLimiter('auth', 20, 60000));
  app.use('/api/verification/verify', rateLimiter('financial', 50, 60000));
  app.use('/api/wallet/manual-funding', rateLimiter('financial', 30, 60000));

  // Mount API modules
  app.use('/api/auth', authRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/verification', verificationRouter);
  app.use('/api/telecom', telecomRouter);
  app.use('/api/cpanel', cpanelRouter);
  app.use('/api/cms', cmsRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/admin', adminRouter);

  const httpServer = http.createServer(app);

  httpServer.on('error', (err: any) => {
    console.error('[HambakTech Server Error]:', err);
  });

  // Development: Vite middleware mode / Production: Static bundle
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[HambakTech Enterprise] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
