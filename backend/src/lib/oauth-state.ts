// Short-lived state tokens we hand to GitHub during OAuth and expect
// back. Stored in-process — fine for a single-instance backend; swap for
// Redis if you horizontally scale beyond one Vercel function instance.
import crypto from 'node:crypto';

interface StateRecord {
  expiresAt: number;
  // Optional URL to redirect the user back to after the OAuth round-trip.
  return_to?: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const states = new Map<string, StateRecord>();

function gc() {
  const now = Date.now();
  for (const [key, rec] of states) {
    if (rec.expiresAt < now) states.delete(key);
  }
}

export function createState(return_to?: string): string {
  gc();
  const value = crypto.randomBytes(24).toString('hex');
  states.set(value, { expiresAt: Date.now() + STATE_TTL_MS, return_to });
  return value;
}

export function consumeState(value: string): StateRecord | null {
  gc();
  const rec = states.get(value);
  if (!rec) return null;
  states.delete(value);
  if (rec.expiresAt < Date.now()) return null;
  return rec;
}
