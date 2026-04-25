# Votum

A bot-resistant endorsement system for GitHub, delivered as a browser extension.

When you visit a repository on GitHub, Votum injects a button next to **Star**. Clicking it shows how many real developers have *vouched* for the repo, with the people you follow surfaced first. Each developer holds only **10 active Votum slots**, and every vouch is publicly tied to their handle — making the signal expensive to fake.

> **Live URLs**
> - Site & sign-in: <https://votum-app.vercel.app>
> - API: <https://votum-backend.vercel.app/v1/health>
> - Latest CRX: <https://github.com/khemanidev31-sudo/votum/releases/latest>

---

## Install

1. Download **`votum-0.1.0.crx`** from the [latest release](https://github.com/khemanidev31-sudo/votum/releases/latest).
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Drag the `.crx` onto the page → click **Add extension**.
   - If Chrome refuses (some recent versions block sideloaded `.crx` files): clone this repo, then in `chrome://extensions` click **Load unpacked** and select the `extension/` folder.

Visit any GitHub repository — the **Votum** button appears next to Star.

## Sign in & vouch

Click the extension icon and **Sign in with GitHub**. We auto-check three things:

| Rule | Threshold |
| --- | --- |
| Account age | ≥ 365 days |
| Merged PRs into other people's repos | ≥ 3 |
| Push activity | ≥ 1 push in the last 90 days |

Pass all three → auto-eligible immediately. Otherwise the popup links you to a one-page application — a couple of sentences about your work and a LinkedIn or personal-site URL is enough. Manual review takes about a week.

You start with **ten slots**. Vouches are public, attached to your handle, and withdrawable any time.

---

## How it works

```
┌──────────────────┐    Firebase Auth    ┌──────────────────┐
│ Browser ext.     │ ◀─── GitHub OAuth ──│ Sign-in page     │
│ (Manifest V3)    │      cookie set     │ (votum-app)      │
└────────┬─────────┘                     └──────────────────┘
         │ /v1/repos/:o/:n             ┌──────────────────┐
         │ /v1/vouch                   │ Fastify          │
         └────────────────────────────▶│ (single function)│
                                       │ on Vercel        │
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
- **Auth** rides on Firebase Auth's GitHub provider. The backend verifies the Firebase ID token and stores its own session cookie, so subsequent requests don't need to re-validate against Firebase.
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

- `DATABASE_URL` — a Postgres URL. For local: spin up Postgres any way you like (Docker, Postgres.app, [Neon](https://neon.tech) free tier). For prod: this is auto-provisioned by the Vercel/Neon Marketplace integration.
- `SESSION_SECRET` — 32+ random characters (used to sign session cookies).
- `FIREBASE_PROJECT_ID` — your Firebase project ID (e.g. `votum-43e98`). Used to verify Firebase ID tokens.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — *optional*. Paste the JSON content of a service-account key for environments without ADC. Skip if running on a Cloud platform with Application Default Credentials.
- `ADMIN_TOKEN` — random string used to gate the admin queue.

### 3. Configure Firebase Auth (one-time, in the console)

1. <https://console.firebase.google.com/> → your project → **Authentication → Sign-in method → GitHub** → enable.
2. Create a GitHub OAuth App at <https://github.com/settings/developers>. Copy its **Client ID** and **Client Secret** into Firebase's GitHub provider form.
3. Firebase shows an **Authorisation callback URL** like `https://<project-id>.firebaseapp.com/__/auth/handler`. Paste that into the GitHub OAuth App's **Authorization callback URL**.
4. Firebase **Authentication → Settings → Authorized domains**: confirm `localhost` is listed.
5. The browser-side Firebase config (`apiKey`, `authDomain`, …) lives in `web/firebase.js`. Update if you've created a different project.

### 4. Migrate + seed

```bash
npm run db:migrate --workspace=@votum/backend
npm run db:seed --workspace=@votum/backend
```

### 5. Run

```bash
npm run dev
# → http://localhost:3000/v1/health
```

### 6. Load the extension

For dev: temporarily edit `extension/config.js` to point `API_BASE` and `WEB_BASE` at `http://localhost:3000` and `http://localhost:5173`, then `chrome://extensions` → **Load unpacked** → pick `extension/`.

### 7. Serve the static site (optional)

```bash
npx --yes serve web -l 5173
```

The admin queue is at `/admin.html` — it prompts for `ADMIN_TOKEN`.

---

## API surface

All endpoints are mounted under `/v1`. CORS allows `chrome-extension://*`, `moz-extension://*`, `*.vercel.app`, and `http://localhost:5173`.

| Method | Path                              | Auth     | Notes                                                                          |
| ------ | --------------------------------- | -------- | ------------------------------------------------------------------------------ |
| GET    | `/health`                         | —        | Liveness probe                                                                 |
| GET    | `/repos/:owner/:name`             | Optional | Count + personalised top-5 vouchers (you_follow → notable → ecosystem → other) |
| GET    | `/badge/:owner/:name.svg`         | —        | Shields-style SVG, cached 1h                                                   |
| POST   | `/auth/firebase-callback`         | —        | `{ id_token, github_access_token }` from Firebase Auth; sets session cookie    |
| POST   | `/auth/logout`                    | Cookie   | Clears the session                                                             |
| GET    | `/auth/status`                    | Cookie?  | `{ signed_in: boolean }`                                                       |
| GET    | `/auth/config`                    | —        | `{ project_id, web_base_url }`                                                 |
| GET    | `/me`                             | Cookie   | Profile, eligibility, slot usage                                               |
| GET    | `/me/vouches`                     | Cookie   | Active vouches the viewer holds                                                |
| POST   | `/vouch`                          | Cookie   | `{ repo_full_name }` — slot ceiling enforced in transaction                    |
| DELETE | `/vouch/:owner/:name`             | Cookie   | Withdraw a vouch                                                               |
| POST   | `/apply`                          | Cookie   | Submit a manual review application                                             |
| GET    | `/admin/queue`                    | Token    | List pending applications                                                      |
| POST   | `/admin/queue/:id/approve`        | Token    | Approve an application                                                         |
| POST   | `/admin/queue/:id/reject`         | Token    | Reject (decision note shown to the applicant)                                  |
| POST   | `/admin/users/:id/suspend`        | Token    | Suspend a user (their vouches stop counting)                                   |

Admin endpoints require an `X-Votum-Admin: <ADMIN_TOKEN>` header.

---

## Eligibility model

A user can issue vouches when one of these holds:

- **Auto-eligible** — three checks (account age, merged PRs in others' repos, recent push) re-run weekly.
- **Manually eligible** — approved via `POST /v1/apply` and the admin queue. Persists indefinitely.
- **Suspended** — admin-flagged. Existing vouches stay in the DB but stop counting in public totals.

The hard ceiling of **10 active vouches per user** is enforced inside `POST /v1/vouch` under `prisma.$transaction` — the count, the unique `(user_id, repo_id)` constraint, and the new row are checked together.

---

## Production checklist

Done:

- [x] Postgres datasource (Neon)
- [x] Backend deployed to Vercel as a serverless function
- [x] Web deployed to Vercel
- [x] CRX published as a GitHub release asset

Outstanding before a wider launch:

- [ ] Replace the in-memory rate limiter with `@fastify/rate-limit` backed by Redis (or Upstash / Vercel KV) — currently single-instance only.
- [ ] Tighter CORS — drop the `*.vercel.app` wildcard once the canonical origins are stable.
- [ ] CSRF token on `POST /vouch` — currently relies on `SameSite=None; Secure` + cookie signing.
- [ ] DB ping in `/v1/health` so uptime monitors catch Postgres outages.
- [ ] Toolbar icon PNGs at `extension/icons/seal-{16,32,128}.png` + restore the `icons` block in `manifest.json` for Chrome Web Store submission.
- [ ] Set `COOKIE_DOMAIN=.votum.dev` once a real domain is in front of both projects.
- [ ] Rotate `SESSION_SECRET` and `ADMIN_TOKEN` to platform-managed secrets.
- [ ] Tests covering: slot-cap transaction, eligibility computation, personalisation ordering.

---

## License

MIT.
