/**
 * @file server.ts
 * Main entry point for HambakTech Enterprise Portal.
 * Runs Express with API endpoints and Vite middlewares in development.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './server/routes/auth.js';
import { systemRouter } from './server/routes/system.js';
import { walletRouter } from './server/routes/wallet.js';
import { verificationRouter } from './server/routes/verification.js';
import { telecomRouter } from './server/routes/telecom.js';
import { cpanelRouter } from './server/routes/cpanel.js';
import { CREDENTIALS } from './server/config/credentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health and root API ping
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: CREDENTIALS.app.name,
      domain: CREDENTIALS.app.domain,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API modules
  app.use('/api/auth', authRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/verification', verificationRouter);
  app.use('/api/telecom', telecomRouter);
  app.use('/api/cpanel', cpanelRouter);

  // Development: Vite middleware mode / Production: Static bundle
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HambakTech Enterprise] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
