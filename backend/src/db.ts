// Single Prisma client instance shared across the process.
//
// SQLite quirk: the Prisma CLI resolves a `file:./...` URL *relative to the
// schema file*, while @prisma/client at runtime resolves it relative to
// `process.cwd()`. Without normalisation, `prisma migrate dev` and the
// running app point at different files. We rewrite the URL to an absolute
// path here so both end up at the same database.
import path from 'node:path';
import url from 'node:url';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

declare global {
  // eslint-disable-next-line no-var
  var __votumPrisma: PrismaClient | undefined;
}

function resolveDatasourceUrl(raw: string): string {
  if (!raw.startsWith('file:')) return raw;
  const rel = raw.slice('file:'.length);
  if (path.isAbsolute(rel)) return raw;
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // src/db.ts → backend/prisma/<rel>
  const abs = path.resolve(here, '..', 'prisma', rel);
  return `file:${abs.replace(/\\/g, '/')}`;
}

export const prisma =
  globalThis.__votumPrisma ??
  new PrismaClient({
    datasourceUrl: resolveDatasourceUrl(env.DATABASE_URL),
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalThis.__votumPrisma = prisma;
