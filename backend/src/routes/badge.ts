// GET /badge/:owner/:name.svg — Shields.io-style SVG badge.
// Cached by callers for 1 hour via Cache-Control.
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';

const WINE = '#7B1F2A';

function escape(s: string): string {
  return s.replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&#39;';
      case '"': return '&quot;';
      default: return ch;
    }
  });
}

function badgeSvg(label: string, value: string): string {
  // Approximate text width using a 6.5px-per-char heuristic. Crude but
  // sufficient for the small label/value strings we render.
  const labelW = Math.ceil(label.length * 6.5) + 14;
  const valueW = Math.ceil(value.length * 7.5) + 14;
  const total = labelW + valueW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${escape(label)}: ${escape(value)}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${WINE}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="14">${escape(label)}</text>
    <text x="${labelW + valueW / 2}" y="14">${escape(value)}</text>
  </g>
</svg>`;
}

export const badgeRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { owner: string; name: string } }>(
    '/badge/:owner/:name.svg',
    async (req, reply) => {
      const fullName = `${req.params.owner}/${req.params.name}`;
      const repo = await prisma.repo.findUnique({ where: { fullName } });
      let count = 0;
      if (repo) {
        count = await prisma.votum.count({
          where: {
            repoId: repo.id,
            withdrawnAt: null,
            user: { eligibility: { not: 'suspended' } },
          },
        });
      }
      reply
        .header('Content-Type', 'image/svg+xml; charset=utf-8')
        .header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
        .send(badgeSvg('votum', String(count)));
    },
  );
};
