// Builds and configures the Fastify app. Used by both the local listener
// (`server.ts`) and the Vercel function handler (`api/[...path].ts`).
// Returns a ready-to-go Fastify instance — call `.listen()` or
// `.ready()` then dispatch from the caller.
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

import { env, isProd } from './env.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { repoRoutes } from './routes/repos.js';
import { vouchRoutes } from './routes/vouch.js';
import { applyRoutes } from './routes/apply.js';
import { adminRoutes } from './routes/admin.js';
import { badgeRoutes } from './routes/badge.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd
      ? { level: 'info' }
      : { level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } },
    trustProxy: true,
  });

  await app.register(cookie, { secret: env.SESSION_SECRET });

  const ALLOWED_WEB_ORIGINS = new Set<string>([env.WEB_BASE_URL, 'http://localhost:5173']);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // server-to-server / curl
      if (origin.startsWith('chrome-extension://')) return cb(null, true);
      if (origin.startsWith('moz-extension://')) return cb(null, true);
      if (ALLOWED_WEB_ORIGINS.has(origin)) return cb(null, true);
      // Permit any *.vercel.app preview/production domains so we don't have
      // to redeploy the backend every time the web frontend gets a new
      // preview URL.
      if (/\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true);
      cb(new Error('Origin not allowed'), false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Votum-Admin'],
  });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip || 'unknown',
  });

  app.get('/v1/health', async () => ({
    ok: true,
    version: '0.1.0',
    time: new Date().toISOString(),
  }));

  await app.register(
    async (instance) => {
      await instance.register(authRoutes);
      await instance.register(meRoutes);
      await instance.register(repoRoutes);
      await instance.register(vouchRoutes);
      await instance.register(applyRoutes);
      await instance.register(adminRoutes);
      await instance.register(badgeRoutes);
    },
    { prefix: '/v1' },
  );

  return app;
}
