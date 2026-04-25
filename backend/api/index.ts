// Single Vercel function. The vercel.json rewrites every public URL to
// /api so this handler fires for every request, then Fastify's internal
// routing (registered in src/app.ts) does the actual dispatch.
//
// Fluid Compute reuses warm instances across invocations, so the Fastify
// app + plugins + Prisma client all live for the lifetime of the warm
// container.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await buildApp();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

// Vercel preserves the original public URL on req.url after a rewrite
// to /api, so Fastify's `/v1/*` routes match without further surgery.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
