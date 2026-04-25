// Personalises a repo's voucher list. Returns up to N vouchers, ordered by
// relation: you_follow → notable → ecosystem → other.
import type { VoucherEntry, VoucherRelation } from '../types.js';
import { VOUCHERS_RETURNED } from '../types.js';
import { prisma } from '../db.js';
import { isNotable } from './notable.js';

interface ActiveVoucherRow {
  voucherId: string;
  githubId: bigint;
  login: string;
  avatar_url: string;
  vouched_at: Date;
}

export interface PersonalizationContext {
  /// The viewer's GitHub numeric id, when signed in. Used to look up the
  /// follow graph; anonymous viewers get notable + ecosystem only.
  viewerGithubId: bigint | null;
  /// The repo's primary language. Used to widen "ecosystem" matches.
  repoLanguage: string | null;
}

export async function pickTopVouchers(
  repoId: string,
  ctx: PersonalizationContext,
): Promise<{ count: number; vouchers: VoucherEntry[]; viewerHasVouched: boolean }> {
  const all = await prisma.votum.findMany({
    where: { repoId, withdrawnAt: null, user: { eligibility: { not: 'suspended' } } },
    orderBy: { createdAt: 'desc' },
    include: { user: true },
  });

  const visible: ActiveVoucherRow[] = all.map((v) => ({
    voucherId: v.userId,
    githubId: v.user.githubId,
    login: v.user.githubLogin,
    avatar_url: v.user.avatarUrl,
    vouched_at: v.createdAt,
  }));

  const count = visible.length;
  const viewerHasVouched =
    ctx.viewerGithubId !== null && visible.some((v) => v.githubId === ctx.viewerGithubId);

  // Relation classification.
  const followedSet = new Set<bigint>();
  if (ctx.viewerGithubId) {
    const rows = await prisma.followGraph.findMany({
      where: { followerId: ctx.viewerGithubId },
      select: { followedId: true },
    });
    for (const r of rows) followedSet.add(r.followedId);
  }

  // Pre-compute ecosystem matches: a voucher is "ecosystem" if they have any
  // *other* active vouch on a repo whose language matches this repo's.
  let ecosystemSet = new Set<string>();
  if (ctx.repoLanguage) {
    const rows = await prisma.votum.findMany({
      where: {
        withdrawnAt: null,
        repo: { language: ctx.repoLanguage },
        userId: { in: visible.map((v) => v.voucherId) },
        NOT: { repoId },
      },
      select: { userId: true },
    });
    ecosystemSet = new Set(rows.map((r) => r.userId));
  }

  function relationOf(row: ActiveVoucherRow): VoucherRelation {
    if (followedSet.has(row.githubId)) return 'you_follow';
    if (isNotable(row.login)) return 'notable';
    if (ecosystemSet.has(row.voucherId)) return 'ecosystem';
    return 'other';
  }

  const RELATION_ORDER: Record<VoucherRelation, number> = {
    you_follow: 0,
    notable: 1,
    ecosystem: 2,
    other: 3,
  };

  const ranked = visible
    .map((row) => ({ row, rel: relationOf(row) }))
    .sort((a, b) => {
      const r = RELATION_ORDER[a.rel] - RELATION_ORDER[b.rel];
      if (r !== 0) return r;
      return b.row.vouched_at.getTime() - a.row.vouched_at.getTime();
    })
    .slice(0, VOUCHERS_RETURNED);

  const vouchers: VoucherEntry[] = ranked.map(({ row, rel }) => ({
    login: row.login,
    avatar_url: row.avatar_url,
    relation: rel,
    vouched_at: row.vouched_at.toISOString(),
  }));

  return { count, vouchers, viewerHasVouched };
}
