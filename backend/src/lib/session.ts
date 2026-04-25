// Session cookie helpers. We store the session id (a 32-byte random hex)
// signed via @fastify/cookie and resolve it to a User row on each request.
import type { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { env, isProd } from '../env.js';

export const SESSION_COOKIE = 'votum_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(userId: string): Promise<string> {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  return id;
}

export function setSessionCookie(reply: FastifyReply, sessionId: string) {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    signed: true,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, {
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
  });
}

export async function destroySession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/**
 * Resolves the current viewer (if any) from the signed cookie. Returns null
 * if there is no cookie, the signature is bad, or the session has expired.
 */
export async function getViewer(req: FastifyRequest) {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const session = await prisma.session.findUnique({
    where: { id: unsigned.value },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return { session, user: session.user };
}
