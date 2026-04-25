// Local listener. Boots the same Fastify app the serverless handler uses,
// listens on env.PORT, runs the nightly cron loop. Used for `npm run dev`
// and any container/VM-style deployment.
import { buildApp } from './app.js';
import { env } from './env.js';
import { prisma } from './db.js';
import { startNightly, stopNightly } from './jobs/nightly.js';

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  stopNightly();
  await app.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  startNightly();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
