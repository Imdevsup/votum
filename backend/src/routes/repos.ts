// GET /repos/:owner/:name — public read endpoint with optional personalisation.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Eligibility, RepoVouchData } from '../types.js';
import { SLOTS_PER_USER } from '../types.js';
import { prisma } from '../db.js';
import { getViewer } from '../lib/session.js';
import { pickTopVouchers } from '../lib/personalization.js';

const ParamSchema = z.object({
  owner: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
});

const QuerySchema = z.object({
  viewer_login: z.string().optional(),
});

export const repoRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: z.infer<typeof ParamSchema>;
    Querystring: z.infer<typeof QuerySchema>;
  }>('/repos/:owner/:name', async (req, reply) => {
    const params = ParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'bad_params' });
    const { owner, name } = params.data;
    const fullName = `${owner}/${name}`;

    const repo = await prisma.repo.findUnique({ where: { fullName } });
    const viewer = await getViewer(req);
    if (viewer) {
      await prisma.user
        .update({ where: { id: viewer.user.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }

    const slotsUsed = viewer
      ? await prisma.votum.count({ where: { userId: viewer.user.id, withdrawnAt: null } })
      : null;

    const viewerCanVouch =
      !!viewer &&
      ['auto_eligible', 'manually_eligible'].includes(viewer.user.eligibility) &&
      slotsUsed !== null &&
      slotsUsed < SLOTS_PER_USER;

    if (!repo) {
      const body: RepoVouchData = {
        repo: { owner, name, full_name: fullName },
        count: 0,
        vouchers: [],
        viewer_has_vouched: false,
        viewer_can_vouch: viewerCanVouch,
        viewer_eligibility: (viewer?.user.eligibility as Eligibility | undefined) ?? null,
        viewer_slots_used: slotsUsed,
      };
      return body;
    }

    const { count, vouchers, viewerHasVouched } = await pickTopVouchers(repo.id, {
      viewerGithubId: viewer ? viewer.user.githubId : null,
      repoLanguage: repo.language,
    });

    const body: RepoVouchData = {
      repo: { owner: repo.owner, name: repo.name, full_name: repo.fullName },
      count,
      vouchers,
      viewer_has_vouched: viewerHasVouched,
      viewer_can_vouch: viewerCanVouch && !viewerHasVouched,
      viewer_eligibility: (viewer?.user.eligibility as Eligibility | undefined) ?? null,
      viewer_slots_used: slotsUsed,
    };
    return body;
  });
};
