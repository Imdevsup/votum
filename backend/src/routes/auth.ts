// GitHub OAuth flow.
//
//   POST /v1/auth/github/start    → returns the GitHub authorisation URL
//   GET  /v1/auth/github/callback → consumes the OAuth code, runs the
//                                    eligibility check, sets the session
//                                    cookie, redirects to /auth-done.html
//   POST /v1/auth/logout          → clears the session
//   GET  /v1/auth/status          → cheap signed-in probe
//
// Direct OAuth, no third-party broker. The session cookie set here is
// what every subsequent request rides on.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { exchangeOAuthCode, github } from '../lib/github.js';
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  getViewer,
  SESSION_COOKIE,
} from '../lib/session.js';
import { consumeState, createState } from '../lib/oauth-state.js';
import { applyEligibilityResult, computeAutoEligibility } from '../lib/eligibility.js';

const SCOPES = 'read:user user:follow';

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Start sign-in. Returns the GitHub authorise URL the client should
   * navigate to. Optionally accepts `{ return_to }` so the callback can
   * bounce the user back to where they came from.
   */
  app.post('/auth/github/start', async (req, reply) => {
    const body = z.object({ return_to: z.string().url().optional() }).safeParse(req.body ?? {});
    const return_to = body.success ? body.data.return_to : undefined;
    const state = createState(return_to);

    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.GITHUB_OAUTH_REDIRECT,
      scope: SCOPES,
      state,
      allow_signup: 'true',
    });
    return reply.send({
      authorize_url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  });

  /**
   * Convenience: redirect-style start. Hitting this URL in a browser tab
   * sends the user straight into GitHub — handy for the extension popup
   * which just opens this in a new tab.
   */
  app.get<{ Querystring: { return_to?: string } }>('/auth/github/start', async (req, reply) => {
    const state = createState(req.query.return_to);
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.GITHUB_OAUTH_REDIRECT,
      scope: SCOPES,
      state,
      allow_signup: 'true',
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  /**
   * GitHub redirects here after the user authorises. We exchange the code
   * for an access token, fetch the profile, upsert the User row, run the
   * eligibility check + follow-graph sync, then set the session cookie
   * and bounce to /auth-done.html.
   */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/github/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (error) {
        return reply.redirect(
          `${env.WEB_BASE_URL}/auth-done.html?status=error&reason=${encodeURIComponent(error)}`,
        );
      }
      if (!code || !state) {
        return reply.code(400).send({ error: 'missing_code_or_state' });
      }

      const stateRec = consumeState(state);
      if (!stateRec) {
        return reply.redirect(
          `${env.WEB_BASE_URL}/auth-done.html?status=error&reason=invalid_or_expired_state`,
        );
      }

      let token: string;
      try {
        token = await exchangeOAuthCode(code, env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
      } catch (err) {
        req.log.error({ err }, 'oauth exchange failed');
        return reply.redirect(
          `${env.WEB_BASE_URL}/auth-done.html?status=error&reason=oauth_exchange_failed`,
        );
      }

      const ghProfile = await github.user(token);
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
        const result = await computeAutoEligibility(ghProfile.login, token);
        await applyEligibilityResult(user.id, result);
      } catch (err) {
        req.log.warn({ err }, 'eligibility compute failed at sign-in');
      }

      try {
        const following = await github.following(token);
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

      const params = new URLSearchParams({ status: 'ok', login: user.githubLogin });
      if (stateRec.return_to) params.set('return_to', stateRec.return_to);
      return reply.redirect(`${env.WEB_BASE_URL}/auth-done.html?${params.toString()}`);
    },
  );

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
};
