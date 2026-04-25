// Nightly maintenance: prune expired sessions / cache, recompute weekly
// auto-eligibility for users we haven't checked in 7+ days. Driven by a
// simple setInterval — fine for a single instance.
import { prisma } from '../db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function pruneExpired() {
  const now = new Date();
  const [sessions, cache] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.gitHubCache.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { sessions: sessions.count, cache: cache.count };
}

export async function listUsersDueForRecheck(): Promise<string[]> {
  const cutoff = new Date(Date.now() - 7 * DAY_MS);
  const rows = await prisma.user.findMany({
    where: {
      OR: [
        { eligibilityCheckedAt: null },
        { eligibilityCheckedAt: { lt: cutoff } },
      ],
      eligibility: { in: ['auto_eligible', 'pending', 'rejected'] },
    },
    select: { id: true, githubLogin: true },
    take: 200,
  });
  return rows.map((r) => r.githubLogin);
}

let timer: NodeJS.Timeout | undefined;

export function startNightly() {
  // Run an hour after start, then every 24h.
  const tick = async () => {
    try {
      const pruned = await pruneExpired();
      console.log(`[votum:nightly] pruned ${pruned.sessions} sessions, ${pruned.cache} cache rows`);
      // Auto-eligibility re-check needs a token per user. We don't keep
      // GitHub tokens, so the recheck here is delegated to the next time
      // the user signs in. For v0 we just record candidates and log.
      const due = await listUsersDueForRecheck();
      if (due.length) console.log(`[votum:nightly] ${due.length} users due for recheck`);
    } catch (err) {
      console.error('[votum:nightly] failed', err);
    }
  };
  if (timer) clearInterval(timer);
  setTimeout(tick, 60 * 60 * 1000); // 1h after start
  timer = setInterval(tick, DAY_MS);
}

export function stopNightly() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
