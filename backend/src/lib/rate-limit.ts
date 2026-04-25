// In-memory token-bucket helper for per-user write endpoints. Public read
// endpoints use @fastify/rate-limit's per-IP store. This is intentionally
// simple — for production scale, swap to Redis (tracked in README).
interface Bucket {
  resetAt: number;
  remaining: number;
}

const buckets = new Map<string, Bucket>();

export function consume(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { resetAt: now + windowMs, remaining: limit };
    buckets.set(key, b);
  }
  if (b.remaining <= 0) return false;
  b.remaining -= 1;
  return true;
}

export function gc() {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}
