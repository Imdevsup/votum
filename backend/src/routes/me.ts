// /me — current user, eligibility, slot usage.
// /me/vouches — list of active vouches the viewer holds.
import type { FastifyPluginAsync } from 'fastify';
import type { ActiveVouch, MeResponse, Eligibility } from '../types.js';
import { SLOTS_PER_USER } from '../types.js';
import { prisma } from '../db.js';
import { getViewer } from '../lib/session.js';

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', async (req, reply) => {
    const v = await getViewer(req);
    if (!v) return reply.code(401).send({ error: 'unauthorized' });
    const slotsUsed = await prisma.votum.count({
      where: { userId: v.user.id, withdrawnAt: null },
    });
    const pending = await prisma.manualReviewApplication.count({
      where: { userId: v.user.id, status: 'pending' },
    });

    const body: MeResponse = {
      login: v.user.githubLogin,
      github_id: Number(v.user.githubId),
      avatar_url: v.user.avatarUrl,
      eligibility: v.user.eligibility as Eligibility,
      eligibility_reason: v.user.eligibilityReason ?? null,
      is_admin: v.user.isAdmin,
      slots_used: slotsUsed,
      slots_total: SLOTS_PER_USER,
      has_pending_application: pending > 0,
    };
    return body;
  });

  app.get('/me/vouches', async (req, reply) => {
    const v = await getViewer(req);
    if (!v) return reply.code(401).send({ error: 'unauthorized' });
    const rows = await prisma.votum.findMany({
      where: { userId: v.user.id, withdrawnAt: null },
      orderBy: { createdAt: 'desc' },
      include: { repo: true },
    });
    const result: ActiveVouch[] = rows.map((row) => ({
      repo_full_name: row.repo.fullName,
      vouched_at: row.createdAt.toISOString(),
    }));
    return result;
  });
};
