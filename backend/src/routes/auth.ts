// Auth routes.
//
// Sign-in is delegated to Firebase Auth on the client. The client performs
// the GitHub OAuth dance via Firebase, then POSTs the resulting Firebase
// ID token + GitHub access token here. We verify the ID token, run the
// eligibility check using the GitHub access token, then issue our own
// session cookie. The Firebase ID token is *not* used for subsequent
// requests — the cookie is.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { github } from '../lib/github.js';
import { verifyIdToken } from '../lib/firebase-admin.js';
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  getViewer,
  SESSION_COOKIE,
} from '../lib/session.js';
import { applyEligibilityResult, computeAutoEligibility } from '../lib/eligibility.js';

const Body = z.object({
  id_token: z.string().min(20),
  github_access_token: z.string().min(20),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/firebase-callback', async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_body' });
    const { id_token, github_access_token } = parsed.data;

    let decoded;
    try {
      decoded = await verifyIdToken(id_token);
    } catch (err) {
      req.log.warn({ err }, 'firebase id token verification failed');
      return reply.code(401).send({ error: 'invalid_id_token' });
    }

    if (decoded.firebase.sign_in_provider !== 'github.com') {
      return reply.code(400).send({
        error: 'must_use_github_provider',
        provider: decoded.firebase.sign_in_provider,
      });
    }

    let ghProfile;
    try {
      ghProfile = await github.user(github_access_token);
    } catch (err) {
      req.log.warn({ err }, 'github profile fetch failed');
      return reply.code(401).send({ error: 'invalid_github_token' });
    }

    const user = await prisma.user.upsert({
      where: { githubId: BigInt(ghProfile.id) },
      update: {
        githubLogin: ghProfile.login,
        avatarUrl: ghProfile.avatar_url,
        lastSeenAt: new Date(),
      },
      create: {
        githubId: BigInt(ghProfile.id),
        githubLogin: ghProfile.login,
        avatarUrl: ghProfile.avatar_url,
      },
    });

    try {
      const result = await computeAutoEligibility(ghProfile.login, github_access_token);
      await applyEligibilityResult(user.id, result);
    } catch (err) {
      req.log.warn({ err }, 'eligibility compute failed at sign-in');
    }

    try {
      const following = await github.following(github_access_token);
      await prisma.$transaction([
        prisma.followGraph.deleteMany({ where: { followerId: BigInt(ghProfile.id) } }),
        ...(following.length
          ? [
              prisma.followGraph.createMany({
                data: following.map((f) => ({
                  followerId: BigInt(ghProfile.id),
                  followedId: BigInt(f.id),
                })),
              }),
            ]
          : []),
        prisma.user.update({
          where: { id: user.id },
          data: { followGraphSyncedAt: new Date() },
        }),
      ]);
    } catch (err) {
      req.log.warn({ err }, 'follow-graph sync failed at sign-in');
    }

    const sid = await createSession(user.id);
    setSessionCookie(reply, sid);

    return reply.send({
      ok: true,
      login: user.githubLogin,
      eligibility: user.eligibility,
    });
  });

  app.post('/auth/logout', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        await destroySession(unsigned.value).catch(() => {});
      }
    }
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/auth/status', async (req) => {
    const v = await getViewer(req);
    return { signed_in: Boolean(v) };
  });

  // Surface a one-line config probe so the operator can confirm Firebase
  // is reachable from this backend before any user attempts sign-in.
  app.get('/auth/config', async () => ({
    project_id: env.FIREBASE_PROJECT_ID,
    web_base_url: env.WEB_BASE_URL,
  }));
};
