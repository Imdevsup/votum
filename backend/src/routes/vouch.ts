// POST /vouch — { repo_full_name } — creates a vouch (under transaction).
// DELETE /vouch/:owner/:name — withdraws an existing vouch.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SLOTS_PER_USER } from '../types.js';
import { prisma } from '../db.js';
import { getViewer } from '../lib/session.js';
import { github } from '../lib/github.js';
import { consume } from '../lib/rate-limit.js';

const FullNameSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[\w.\-]+\/[\w.\-]+$/, 'expected owner/name');

async function ensureRepo(fullName: string) {
  const cached = await prisma.repo.findUnique({ where: { fullName } });
  if (cached) return cached;

  const [owner, name] = fullName.split('/') as [string, string];
  const gh = await github.repo(owner, name);
  return prisma.repo.upsert({
    where: { fullName: gh.full_name },
    update: {
      owner: gh.owner.login,
      name: gh.name,
      description: gh.description ?? undefined,
      language: gh.language ?? undefined,
      stars: gh.stargazers_count,
      lastSyncedAt: new Date(),
    },
    create: {
      githubId: BigInt(gh.id),
      owner: gh.owner.login,
      name: gh.name,
      fullName: gh.full_name,
      description: gh.description ?? undefined,
      language: gh.language ?? undefined,
      stars: gh.stargazers_count,
    },
  });
}

export const vouchRoutes: FastifyPluginAsync = async (app) => {
  app.post('/vouch', async (req, reply) => {
    const v = await getViewer(req);
    if (!v) return reply.code(401).send({ error: 'unauthorized' });

    if (!consume(`vouch:${v.user.id}`, 10, 60 * 60 * 1000)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }

    const eligible = ['auto_eligible', 'manually_eligible'].includes(v.user.eligibility);
    if (!eligible) {
      return reply.code(403).send({ error: 'not_eligible', eligibility: v.user.eligibility });
    }

    const body = z.object({ repo_full_name: FullNameSchema }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_body' });

    let repo;
    try {
      repo = await ensureRepo(body.data.repo_full_name);
    } catch (err) {
      req.log.warn({ err, fullName: body.data.repo_full_name }, 'repo lookup failed');
      return reply.code(404).send({ error: 'repo_not_found' });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const slotsUsed = await tx.votum.count({
          where: { userId: v.user.id, withdrawnAt: null },
        });
        if (slotsUsed >= SLOTS_PER_USER) {
          throw Object.assign(new Error('slots_full'), { code: 'SLOTS_FULL' as const });
        }
        const existing = await tx.votum.findUnique({
          where: { userId_repoId: { userId: v.user.id, repoId: repo.id } },
        });
        if (existing && existing.withdrawnAt === null) {
          throw Object.assign(new Error('already_vouched'), { code: 'ALREADY' as const });
        }
        if (existing) {
          return tx.votum.update({
            where: { id: existing.id },
            data: { withdrawnAt: null, createdAt: new Date() },
          });
        }
        return tx.votum.create({ data: { userId: v.user.id, repoId: repo.id } });
      });
      return { ok: true, vouch_id: result.id, vouched_at: result.createdAt.toISOString() };
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'SLOTS_FULL') return reply.code(429).send({ error: 'slots_full' });
      if (e.code === 'ALREADY') return reply.code(409).send({ error: 'already_vouched' });
      req.log.error({ err }, 'vouch failed');
      return reply.code(500).send({ error: 'internal' });
    }
  });

  app.delete<{ Params: { owner: string; name: string } }>(
    '/vouch/:owner/:name',
    async (req, reply) => {
      const v = await getViewer(req);
      if (!v) return reply.code(401).send({ error: 'unauthorized' });
      const fullName = `${req.params.owner}/${req.params.name}`;
      const repo = await prisma.repo.findUnique({ where: { fullName } });
      if (!repo) return reply.code(404).send({ error: 'repo_not_found' });
      const updated = await prisma.votum.updateMany({
        where: { userId: v.user.id, repoId: repo.id, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });
      if (updated.count === 0) return reply.code(404).send({ error: 'no_active_vouch' });
      return { ok: true };
    },
  );
};
