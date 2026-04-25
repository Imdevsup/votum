# Votum

A bot-resistant endorsement system for GitHub, delivered as a browser extension.

When you visit a repository on GitHub, Votum injects a button next to **Star**. Clicking it shows how many real developers have *vouched* for the repo, with the people you follow surfaced first. Each developer holds only **10 active Votum slots**, and every vouch is publicly tied to their handle — making the signal expensive to fake.

> **Live URLs**
> - Site & sign-in: <https://votum-app.vercel.app>
> - API: <https://votum-backend.vercel.app/v1/health>
> - Latest extension zip: <https://github.com/Imdevsup/votum/releases/latest>

## Why

GitHub stars cost nothing. Bot networks routinely buy them by the thousand to inflate repo credibility before a supply-chain attack or a fake trending campaign. Stars also flatten judgement — a star from a senior maintainer counts the same as a star from an account that was created yesterday.

Votum re-introduces cost. Three rules:

1. **Ten slots, no more.** Want to vouch for an eleventh repo? Drop one of the others. Scarcity makes the signal mean something.
2. **Your name is on it.** Every Votum is public, attached to your handle. Stand by malware, that's on your record.
3. **Bots cannot enter.** Auto-qualify with twelve months of real merged PRs into other people's repos, or apply for manual review. Each application is a human looking at a real account for sixty seconds. To bot the system at scale, you'd need a thousand of those approvals one at a time. The economics break.

---

## Install

1. Download **`votum-extension-0.1.1.zip`** from the [latest release](https://github.com/Imdevsup/votum/releases/latest).
2. Unzip it. You'll get a folder containing `manifest.json`.
3. Open `chrome://extensions` in Chrome.
4. Toggle **Developer mode** on (top-right).
5. Click **Load unpacked** and select the unzipped folder.

Visit any GitHub repository — the **Votum** button appears next to Star.

> One-click install from the Chrome Web Store is on the way; until then, Load unpacked is the supported path.

## Sign in & vouch

Click the extension icon and **Sign in with GitHub**. We auto-check three things:

| Rule | Threshold |
| --- | --- |
| Account age | ≥ 180 days |
| Merged PRs into other people's repos | ≥ 3 |
| Push activity | ≥ 1 push in the last 90 days |

Pass all three → auto-eligible immediately. Otherwise the popup links you to a one-page application — a couple of sentences about your work and a LinkedIn or personal-site URL is enough. Manual review is usually within an hour right now (small queue).

You start with **ten slots**. Vouches are public, attached to your handle, and withdrawable any time.

---

## How it works

```
┌──────────────────┐                           ┌──────────────────────┐
│ Browser ext.     │ ── opens new tab to ────▶ │ /v1/auth/github/     │
│ (Manifest V3)    │                           │   start (302 to GH)  │
└────────┬─────────┘                           └──────────┬───────────┘
         │                                                │
         │ /v1/repos/:o/:n           ┌──────────────────┐ │
         │ /v1/vouch                 │ Fastify          │◀┘ GitHub OAuth
         └──────────────────────────▶│ (single function)│   callback
                                     │ on Vercel        │   sets session cookie
                                     └────────┬─────────┘
                                              │
                                     ┌────────▼─────────┐
                                     │ Neon Postgres    │
                                     │  • users         │
                                     │  • vouches       │
                                     │  • repos         │
                                     │  • follow graph  │
                                     │  • applications  │
                                     └──────────────────┘
```

- **Extension** detects the repo, fetches data, renders a panel beside Star. Modular under `extension/content/`.
- **Backend** is one Fastify app exposed via a Vercel function. Routes live under `/v1/*`.
- **Auth** is direct GitHub OAuth: the popup opens `${API_BASE}/v1/auth/github/start`, GitHub redirects back to `/v1/auth/github/callback`, the backend exchanges the code, runs eligibility, and sets a signed session cookie. No third-party broker.
- **Slot enforcement** runs inside a Prisma transaction in `POST /v1/vouch` — there is no client-trusted counter.

---

## Repo layout

```
votum/
├── extension/   Browser extension (Manifest V3, vanilla JS)
│   └── content/  Modular content script: util · api · render · lifecycle
├── backend/     Fastify + Prisma API; deploys to Vercel as a single function
│   ├── api/      Vercel function entry (catches everything via vercel.json rewrite)
│   ├── prisma/   Schema + migrations
│   └── src/      app.ts (build) · server.ts (local listen) · routes/ · lib/
├── web/         Marketing site, sign-in, admin queue (static, deploys to Vercel)
└── package.json npm workspaces root
```

---

## Local development

### 1. Install

```bash
npm install
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Fill in:

- `DATABASE_URL` — a Postgres URL. For local: any Postgres works ([Neon](https://neon.tech) free tier is fastest). For prod: auto-provisioned by the Vercel/Neon Marketplace integration.
- `SESSION_SECRET` — 32+ random characters (used to sign session cookies).
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from a GitHub OAuth App at <https://github.com/settings/developers>.
- `GITHUB_OAUTH_REDIRECT` — must match the OAuth App's **Authorization callback URL**, e.g. `http://localhost:3000/v1/auth/github/callback` for local dev.
- `ADMIN_TOKEN` — random string used to gate the admin queue.

### 3. Migrate + seed

```bash
npm run db:migrate --workspace=@votum/backend
npm run db:seed --workspace=@votum/backend
```

### 4. Run

```bash
npm run dev
# → http://localhost:3000/v1/health
```

### 5. Load the extension

For dev: temporarily edit `extension/config.js` to point `API_BASE` at `http://localhost:3000` and `WEB_BASE` at `http://localhost:5173`, then `chrome://extensions` → **Load unpacked** → pick `extension/`.

### 6. Serve the static site (optional)

```bash
npx --yes serve web -l 5173
```

The admin queue is at `/admin.html` — paste your `ADMIN_TOKEN` to load pending applications.

---

## API surface

All endpoints are mounted under `/v1`. CORS allows `chrome-extension://*`, `moz-extension://*`, `*.vercel.app`, and `http://localhost:5173`.

| Method   | Path                              | Auth     | Notes                                                                          |
| -------- | --------------------------------- | -------- | ------------------------------------------------------------------------------ |
| GET      | `/health`                         | —        | Liveness probe                                                                 |
| GET      | `/repos/:owner/:name`             | Optional | Count + personalised top-5 vouchers (you_follow → notable → ecosystem → other) |
| GET      | `/badge/:owner/:name.svg`         | —        | Shields-style SVG, cached 1h                                                   |
| POST/GET | `/auth/github/start`              | —        | POST returns the authorise URL; GET 302-redirects to it                        |
| GET      | `/auth/github/callback`           | —        | OAuth callback — exchanges code, runs eligibility, sets session cookie         |
| POST     | `/auth/logout`                    | Cookie   | Clears the session                                                             |
| GET      | `/auth/status`                    | Cookie?  | `{ signed_in: boolean }`                                                       |
| GET      | `/me`                             | Cookie   | Profile, eligibility, slot usage                                               |
| GET      | `/me/vouches`                     | Cookie   | Active vouches the viewer holds                                                |
| POST     | `/vouch`                          | Cookie   | `{ repo_full_name }` — slot ceiling enforced in transaction                    |
| DELETE   | `/vouch/:owner/:name`             | Cookie   | Withdraw a vouch                                                               |
| POST     | `/apply`                          | Cookie   | Submit a manual review application                                             |
| GET      | `/admin/queue`                    | Token    | List pending applications                                                      |
| POST     | `/admin/queue/:id/approve`        | Token    | Approve an application                                                         |
| POST     | `/admin/queue/:id/reject`         | Token    | Reject (decision note shown to the applicant)                                  |
| POST     | `/admin/users/:id/suspend`        | Token    | Suspend a user (their vouches stop counting)                                   |

Admin endpoints require an `X-Votum-Admin: <ADMIN_TOKEN>` header.

---

## Eligibility model

A user can issue vouches when one of these holds:

- **Auto-eligible** — three checks (account age ≥ 180 days, ≥ 3 merged PRs in others' repos, recent push) re-run weekly.
- **Manually eligible** — approved via `POST /v1/apply` and the admin queue. Persists indefinitely.
- **Suspended** — admin-flagged. Existing vouches stay in the DB but stop counting in public totals.

The hard ceiling of **10 active vouches per user** is enforced inside `POST /v1/vouch` under `prisma.$transaction` — the count, the unique `(user_id, repo_id)` constraint, and the new row are checked together.

---

## Production checklist

Done:

- [x] Postgres datasource (Neon, via Vercel Marketplace)
- [x] Backend deployed to Vercel as a serverless function
- [x] Web deployed to Vercel
- [x] CRX published as a GitHub release asset
- [x] Direct GitHub OAuth (no third-party brokers)

Outstanding before a wider launch:

- [ ] Replace the in-memory rate limiter + OAuth state store with Redis (Upstash, Vercel KV) — currently single-instance only.
- [ ] Tighter CORS — drop the `*.vercel.app` wildcard once canonical origins are stable.
- [ ] CSRF token on `POST /vouch` — currently relies on `SameSite=None; Secure` + cookie signing.
- [ ] DB ping in `/v1/health` so uptime monitors catch Postgres outages.
- [ ] Toolbar icon PNGs at `extension/icons/seal-{16,32,128}.png` + restore the `icons` block in `manifest.json` for Chrome Web Store submission.
- [ ] Set `COOKIE_DOMAIN=.votum.dev` once a real domain is in front of both projects.
- [ ] Rotate `SESSION_SECRET` and `ADMIN_TOKEN` to platform-managed secrets.
- [ ] Tests covering: slot-cap transaction, eligibility computation, personalisation ordering.

---

## License

MIT.
