# Votum

A bot-resistant endorsement system for GitHub, delivered as a browser extension.

When you visit a repository on GitHub, Votum injects a button next to **Star**. Clicking it shows how many real developers have *vouched* for the repo, with the people you follow surfaced first. Each developer holds only **10 active Votum slots**, and every vouch is publicly tied to their handle — making the signal expensive to fake.

---

## Install (users)

1. Download **`votum-0.1.0.crx`** from the [latest release](https://github.com/khemanidev31-sudo/votum/releases/latest).
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Drag the `.crx` onto the page → click **Add extension**.
   - If Chrome refuses (some versions block sideloaded `.crx` files): clone this repo, then in `chrome://extensions` click **Load unpacked** and select the `extension/` folder.

Visit any GitHub repository — the **Votum** button appears next to Star.

## Vouching (users)

Click the extension icon and **Sign in with GitHub**. We auto-check three things:

- account ≥ 365 days old
- ≥ 3 merged PRs into repos you don't own
- ≥ 1 push in the last 90 days

If all three pass, you're auto-eligible immediately. If not, you'll be linked to a short application page — a couple of sentences about your work and a LinkedIn or personal site is enough. Manual review takes about a week.

You start with **10 slots**. Each vouch is public, attached to your handle, and withdrawable any time.

**Live URLs**

- Marketing & sign-in: https://votum-app.vercel.app
- API: https://votum-backend.vercel.app

---

## Repo layout

```
votum/
├── extension/   Browser extension (Manifest V3, vanilla JS)
├── backend/     Fastify + Prisma API server, deploys to Vercel as a single function
├── web/         Marketing site, sign-in, admin queue (static, deploys to Vercel)
└── package.json npm workspaces root
```

---

## Quick start (local dev)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:

- `SESSION_SECRET` — any 32+ character random string (used to sign cookies)
- `FIREBASE_PROJECT_ID` — your Firebase project ID (e.g. `votum-43e98`). Used to verify Firebase ID tokens server-side.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — *optional*. Paste the contents of a service-account JSON here for environments without Application Default Credentials. Leave blank if you've set `GOOGLE_APPLICATION_CREDENTIALS` to a file path or you're running on a Cloud platform with ADC.
- `ADMIN_TOKEN` — random string used to gate the admin queue.

### 2a. Configure Firebase Auth (one-time, on the Firebase console)

1. Open the Firebase project at <https://console.firebase.google.com/>.
2. **Authentication → Sign-in method → GitHub**: enable the provider.
3. Create a GitHub OAuth App at <https://github.com/settings/developers> (or reuse one). Copy its **Client ID** and **Client Secret** into the Firebase GitHub provider form.
4. Firebase will display an **Authorisation callback URL** like `https://votum-43e98.firebaseapp.com/__/auth/handler`. Paste that into the **Authorization callback URL** field on the GitHub OAuth App.
5. **Authentication → Settings → Authorized domains**: confirm `localhost` and your eventual `votum.dev` are listed.
6. The browser-side Firebase web config (`apiKey`, `authDomain`, etc.) lives in `web/firebase.js`. Update it if you've created a different Firebase project.

### 3. Initialize the database

SQLite by default for local dev (Prisma file URL).

```bash
npm run db:migrate --workspace=@votum/backend -- --name init
npm run db:seed --workspace=@votum/backend
```

### 4. Run the API

```bash
npm run dev
# → http://localhost:3000
```

Hit `http://localhost:3000/v1/health` to confirm it's up.

### 5. Load the extension in Chrome

1. Visit `chrome://extensions`.
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select the `extension/` folder.
4. Visit any GitHub repo, e.g. <https://github.com/sindresorhus/awesome-nodejs>.

The extension talks to `http://localhost:3000` by default. To point it at a deployed backend, edit `extension/config.js`.

> **Icons.** The manifest currently ships without a toolbar icon so the extension loads cleanly in dev. Drop PNGs at `extension/icons/seal-{16,32,128}.png` and add the `icons` block back to `extension/manifest.json` before publishing to the Chrome Web Store. SVG source lives at `extension/icons/seal.svg`.

### 6. Serve the marketing/admin site (optional in dev)

The `web/` directory is plain static HTML. Any static server works:

```bash
npx --yes serve web -l 5173
```

The admin page lives at `/admin.html` and prompts for the admin token.

---

## API surface

All endpoints are mounted under `/v1`.

| Method | Path                                | Auth     | Notes                                                |
| ------ | ----------------------------------- | -------- | ---------------------------------------------------- |
| GET    | `/health`                           | —        | Liveness probe                                       |
| GET    | `/repos/:owner/:name`               | Optional | Public counts and personalised top-5 vouchers        |
| GET    | `/badge/:owner/:name.svg`           | —        | Shields.io-compatible SVG (cached 1h)                |
| POST   | `/auth/firebase-callback`           | —        | `{ id_token, github_access_token }` from Firebase Auth; verifies, runs eligibility, sets session cookie |
| POST   | `/auth/logout`                      | Cookie   | Clears the session                                   |
| GET    | `/auth/status`                      | Cookie?  | `{ signed_in: boolean }` cheap probe                 |
| GET    | `/auth/config`                      | —        | `{ project_id, web_base_url }` for ops              |
| GET    | `/me`                               | Cookie   | Current user, eligibility, slot usage                |
| GET    | `/me/vouches`                       | Cookie   | Active vouches owned by the viewer                   |
| POST   | `/vouch`                            | Cookie   | `{ repo_full_name }`                                 |
| DELETE | `/vouch/:owner/:name`               | Cookie   | Withdraw a vouch                                     |
| POST   | `/apply`                            | Cookie   | Submit manual review application                     |
| GET    | `/admin/queue`                      | Token    | List pending applications                            |
| POST   | `/admin/queue/:id/approve`          | Token    | Approve an application                               |
| POST   | `/admin/queue/:id/reject`           | Token    | Reject with note                                     |
| POST   | `/admin/users/:id/suspend`          | Token    | Suspend a user                                       |

CORS is configured for `chrome-extension://*`, `moz-extension://*`, the marketing origin, and `http://localhost:5173`.

---

## Eligibility

A user can issue Votums when one of the following holds:

- **Auto-eligible** — checked at sign-in and weekly afterwards:
  - GitHub account ≥ 365 days old, AND
  - ≥ 3 PRs merged into repos the user does not own, AND
  - ≥ 1 push event in the last 90 days.
- **Manually eligible** — approved through `/v1/apply` and the admin queue.
- **Suspended** — admin-flagged. Their vouches stay in the database but are excluded from public counts.

The hard ceiling of **10 active vouches per user** is enforced inside `POST /vouch` under a transaction.

---

## Production checklist (out of scope for v0 build, captured for later)

- [ ] Switch `prisma/schema.prisma` datasource to `postgresql` and re-run migrations.
- [ ] Provision Postgres (Neon, Supabase, or Marketplace) and Redis (rate limiting).
- [ ] Replace the in-memory rate limiter with `@fastify/rate-limit` backed by Redis.
- [ ] Add the toolbar icons back to `manifest.json`.
- [ ] Set `COOKIE_DOMAIN=.votum.dev` and ensure cookies are `Secure; SameSite=None`.
- [ ] Rotate and store `SESSION_SECRET` in your hosting platform's secret manager.
- [ ] Submit `votum-extension.zip` to the Chrome Web Store.
- [ ] Wire `votum.dev` DNS to the static host and `api.votum.dev` to the backend.

See `Section 13` of the build spec for the known-fragile areas and how the code defends against them (selector rot, Turbo nav, GitHub rate limits, store-review surface area, privacy disclosure).
