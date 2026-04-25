// Admin queue. Token-gated via x-votum-admin header (compared against
// env.ADMIN_TOKEN). Cheap and adequate for v0; swap for proper RBAC later.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ApplicationSummary } from '../types.js';
import { prisma } from '../db.js';
import { env } from '../env.js';

function requireAdmin(req: { headers: Record<string, unknown> }): boolean {
  const provided = req.headers['x-votum-admin'];
  if (typeof provided !== 'string') return false;
  // Constant-time compare.
  const a = Buffer.from(provided);
  const b = Buffer.from(env.ADMIN_TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    if (!requireAdmin(req)) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/admin/queue', async () => {
    const rows = await prisma.manualReviewApplication.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { user: true },
    });
    const out: ApplicationSummary[] = rows.map((r) => ({
      id: r.id,
      applicant: { login: r.user.githubLogin, avatar_url: r.user.avatarUrl },
      reason_text: r.reasonText,
      links: safeJsonArray(r.links),
      created_at: r.createdAt.toISOString(),
    }));
    return out;
  });

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    '/admin/queue/:id/approve',
    async (req, reply) => {
      const note = z.object({ note: z.string().max(2000).optional() })
        .safeParse(req.body ?? {});
      if (!note.success) return reply.code(400).send({ error: 'bad_body' });

      const application = await prisma.manualReviewApplication.findUnique({
        where: { id: req.params.id },
      });
      if (!application) return reply.code(404).send({ error: 'not_found' });
      if (application.status !== 'pending') {
        return reply.code(409).send({ error: 'not_pending' });
      }

      await prisma.$transaction([
        prisma.manualReviewApplication.update({
          where: { id: application.id },
          data: {
            status: 'approved',
            decisionNote: note.data.note ?? null,
            reviewedAt: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: application.userId },
          data: {
            eligibility: 'manually_eligible',
            eligibilityReason: note.data.note ?? 'Approved via manual review.',
          },
        }),
      ]);

      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    '/admin/queue/:id/reject',
    async (req, reply) => {
      const note = z.object({ note: z.string().max(2000).optional() })
        .safeParse(req.body ?? {});
      if (!note.success) return reply.code(400).send({ error: 'bad_body' });

      const application = await prisma.manualReviewApplication.findUnique({
        where: { id: req.params.id },
      });
      if (!application) return reply.code(404).send({ error: 'not_found' });
      if (application.status !== 'pending') {
        return reply.code(409).send({ error: 'not_pending' });
      }

      await prisma.$transaction([
        prisma.manualReviewApplication.update({
          where: { id: application.id },
          data: {
            status: 'rejected',
            decisionNote: note.data.note ?? null,
            reviewedAt: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: application.userId },
          data: {
            eligibility: 'rejected',
            eligibilityReason: note.data.note ?? 'Rejected via manual review.',
          },
        }),
      ]);

      return { ok: true };
    },
  );

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    '/admin/users/:id/suspend',
    async (req, reply) => {
      const note = z.object({ note: z.string().max(2000).optional() })
        .safeParse(req.body ?? {});
      if (!note.success) return reply.code(400).send({ error: 'bad_body' });

      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) return reply.code(404).send({ error: 'not_found' });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          eligibility: 'suspended',
          eligibilityReason: note.data.note ?? 'Suspended by admin.',
        },
      });
      return { ok: true };
    },
  );
};

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
    return [];
  } catch {
    return [];
  }
}
