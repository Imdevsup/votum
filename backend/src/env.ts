// Centralised environment loading. Validates once at startup so a
// misconfigured deploy fails loud rather than crashing a request later.
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Tiny .env loader so we don't need a runtime dotenv dep. Only loaded
// when NODE_ENV !== 'production' so prod platforms inject vars themselves.
function loadDotenv() {
  if (process.env.NODE_ENV === 'production') return;
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const dotenvPath = path.resolve(here, '..', '.env');
  if (!existsSync(dotenvPath)) return;
  const raw = readFileSync(dotenvPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key] !== undefined) continue;
    let value = m[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotenv();

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),

  // Firebase Auth handles the GitHub OAuth dance. We verify the ID token
  // server-side and consume the GitHub access token forwarded by the client.
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  // Optional service account JSON (string) for ID token verification in
  // environments without ADC. Falls back to applicationDefault() when empty.
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),

  WEB_BASE_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),
  COOKIE_DOMAIN: z.string().optional().default(''),
  ADMIN_TOKEN: z.string().min(8, 'ADMIN_TOKEN must be at least 8 characters'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => Number.parseInt(v, 10)),
  HOST: z.string().default('0.0.0.0'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('[votum] invalid environment:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
