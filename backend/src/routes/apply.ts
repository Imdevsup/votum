// POST /apply — submit a manual review application.
// Allowed only when the viewer is currently `pending` or `rejected`.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getViewer } from '../lib/session.js';
import { consume } from '../lib/rate-limit.js';

const Body = z.object({
  reason_text: z.string().min(40, 'Tell us at least a couple of sentences').max(2000),
  links: z.array(z.string().url()).max(8).default([]),
});

export const applyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/apply', async (req, reply) => {
    const v = await getViewer(req);
    if (!v) return reply.code(401).send({ error: 'unauthorized' });

    if (!consume(`apply:${v.user.id}`, 1, 24 * 60 * 60 * 1000)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    if (!['pending', 'rejected'].includes(v.user.eligibility)) {
      return reply.code(409).send({
        error: 'application_not_allowed',
        reason: `Current status: ${v.user.eligibility}.`,
      });
    }

    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_body', issues: parsed.error.issues });

    const existing = await prisma.manualReviewApplication.findFirst({
      where: { userId: v.user.id, status: 'pending' },
    });
    if (existing) {
      return reply.code(409).send({ error: 'application_already_pending' });
    }

    const created = await prisma.manualReviewApplication.create({
      data: {
        userId: v.user.id,
        reasonText: parsed.data.reason_text,
        links: JSON.stringify(parsed.data.links),
      },
    });

    return { ok: true, application_id: created.id, created_at: created.createdAt.toISOString() };
  });
};
