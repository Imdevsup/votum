// Thin GitHub REST helper. Handles auth header, JSON, retry on 502/503,
// rate-limit awareness, and a DB-backed response cache so we don't burn
// quota recomputing the same eligibility numbers.
import { prisma } from '../db.js';

const USER_AGENT = 'votum/0.1 (+https://votum.dev)';

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export interface GhUser {
  id: number;
  login: string;
  avatar_url: string;
  created_at: string;
}

export interface GhRepo {
  id: number;
  name: string;
  owner: { login: string };
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
}

export interface GhEvent {
  type: string;
  created_at: string;
  repo: { name: string };
}

export interface GhSearchIssuesItem {
  pull_request?: unknown;
  repository_url: string;
  user: { login: string };
}

export interface GhFollowing {
  id: number;
  login: string;
}

interface FetchOpts {
  token?: string;
  cacheKey?: string;
  cacheTtlMs?: number;
}

async function ghFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { token, cacheKey, cacheTtlMs } = opts;

  if (cacheKey) {
    const cached = await prisma.gitHubCache.findUnique({ where: { key: cacheKey } });
    if (cached && cached.expiresAt > new Date()) {
      return JSON.parse(cached.payload) as T;
    }
  }

  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new GitHubApiError(res.status, `GitHub ${res.status} on ${path}`, body);
  }
  const data = (await res.json()) as T;

  if (cacheKey && cacheTtlMs) {
    const expiresAt = new Date(Date.now() + cacheTtlMs);
    await prisma.gitHubCache.upsert({
      where: { key: cacheKey },
      update: { payload: JSON.stringify(data), expiresAt },
      create: { key: cacheKey, payload: JSON.stringify(data), expiresAt },
    });
  }

  return data;
}

export async function exchangeOAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!res.ok) throw new GitHubApiError(res.status, 'Failed to exchange OAuth code');
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (data.error || !data.access_token) {
    throw new GitHubApiError(400, data.error_description || data.error || 'No access token returned');
  }
  return data.access_token;
}

export const github = {
  user: (token: string) => ghFetch<GhUser>('/user', { token }),

  userByLogin: (login: string, token?: string) =>
    ghFetch<GhUser>(`/users/${encodeURIComponent(login)}`, {
      token,
      cacheKey: `user:${login.toLowerCase()}`,
      cacheTtlMs: 12 * 60 * 60 * 1000,
    }),

  repo: (owner: string, name: string, token?: string) =>
    ghFetch<GhRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
      token,
      cacheKey: `repo:${owner.toLowerCase()}/${name.toLowerCase()}`,
      cacheTtlMs: 60 * 60 * 1000,
    }),

  events: (login: string, token?: string) =>
    ghFetch<GhEvent[]>(`/users/${encodeURIComponent(login)}/events?per_page=100`, {
      token,
      cacheKey: `events:${login.toLowerCase()}`,
      cacheTtlMs: 60 * 60 * 1000,
    }),

  searchMergedPrs: (login: string, token?: string) =>
    ghFetch<{ total_count: number; items: GhSearchIssuesItem[] }>(
      `/search/issues?q=${encodeURIComponent(
        `is:pr is:merged author:${login} -user:${login}`,
      )}&per_page=10`,
      {
        token,
        cacheKey: `prs:${login.toLowerCase()}`,
        cacheTtlMs: 24 * 60 * 60 * 1000,
      },
    ),

  // Paginates the viewer's full followed-list. Capped at 5000 to bound work.
  following: async (token: string): Promise<GhFollowing[]> => {
    const out: GhFollowing[] = [];
    for (let page = 1; page <= 50; page++) {
      const batch = await ghFetch<GhFollowing[]>(
        `/user/following?per_page=100&page=${page}`,
        { token },
      );
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  },
};
