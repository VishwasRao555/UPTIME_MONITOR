# Uptime Monitor — Prototype (v1)

A self-hosted MERN service that periodically probes websites, records latency
and availability, raises an alert when a site changes state, and serves a live
React dashboard. **No AI/LLM anywhere. Runs for free.**

This is the **prototype** described in `UPTIME_MONITOR_PLAN.md`. It implements
the MVP core and deliberately defers the complex features (see
[What's deferred](#whats-deferred)).

---

## What works today

- **CRUD monitors** — name, URL, method, interval, expected status, timeout.
  Create AND edit from the same modal.
- **Concurrent scheduler** — `node-cron` tick fans out over all due monitors
  with `Promise.allSettled`, so one failing probe never aborts the batch.
- **Check now** — trigger an immediate probe for any monitor, off-cadence,
  through the exact same pipeline the scheduler uses.
- **Debounced state machine** — a monitor flips to `DOWN` only after
  `FAILURE_THRESHOLD` consecutive failures, and fires a single alert on
  `UP→DOWN` and on `DOWN→UP`. This pure function is the highest-value unit
  test in the repo.
- **Incidents** — opened on `DOWN`, closed on recovery with a computed duration.
- **Pluggable notifier** (Strategy pattern) — `console`, **Telegram** and
  **email** (Brevo) ship today, and any combination can run at once. Channels
  are isolated: a dead email provider never costs you the Telegram message.
- **SSRF guard** — user URLs that resolve to loopback / private / link-local
  ranges (e.g. `169.254.169.254`) are rejected before any probe.
- **Sentinel dashboard** — a bold yellow-and-black poster UI (Anton display +
  Space Grotesk): a live fleet stats bar (total / up / down / avg response /
  overall uptime), status-filtered monitor cards with a recent-checks strip,
  response-time and uptime metrics, and a detail page with a switchable
  latency range (1h / 24h / 7d / 30d) plus an incident table.
- **Search, sort & filter** — filter by status (with live counts), full-text
  search across name/URL, and sort by newest / name / uptime / slowest.
  Keyboard shortcuts: `n` to add a monitor, `/` to focus search.
- **Inline quick actions** — check-now, pause/resume, and open straight from
  each card; copy-URL and check/edit/pause/delete on the detail page.
- **Live feedback** — a navbar API-status indicator (polls `/health`), a
  self-ticking "updated Ns ago" live indicator with manual refresh, and toast
  notifications on every action (create / check / pause / delete / errors).
- **Full UI states** — loading skeletons, empty states, inline errors with
  retry, visible keyboard focus rings, and a lazy-loaded detail route so the
  Recharts bundle never weighs down the dashboard's first paint.
- **Zero-setup storage** — with no `MONGO_URI` set, the server boots an
  in-memory MongoDB so you can run the whole thing with no database install.

---

## Quick start

Two terminals. **No MongoDB install required** for a first run.

```bash
# Terminal 1 — backend (in-memory DB, API + scheduler)
cd server
npm install
cp .env.example .env      # optional; sensible defaults work as-is
npm run dev               # → http://localhost:5000

# Terminal 2 — frontend
cd client
npm install
npm run dev               # → http://localhost:5173
```

Open **http://localhost:5173** and click **+ New Monitor**. Try
`https://example.com` (goes UP) and `https://httpstat.us/500` (goes DOWN after
the failure threshold — watch the backend log for the `[ALERT:DOWN]` line).

> The in-memory database is discarded on exit. To **persist** data, set
> `MONGO_URI` in `server/.env` to a MongoDB Atlas (free tier) or local `mongod`
> connection string.

### Validate the core idea in isolation

```bash
cd server
node scripts/probe.js https://example.com https://httpstat.us/500
```

### Run the state-machine tests

```bash
cd server
npm test
```

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Service liveness + DB status |
| `GET` | `/api/overview` | Fleet summary (counts, avg response, overall uptime) |
| `GET` | `/api/monitors` | List monitors + status + 24h uptime + recent strip |
| `POST` | `/api/monitors` | Create monitor |
| `POST` | `/api/monitors/:id/check` | Run an immediate check now |
| `GET` | `/api/monitors/:id` | Monitor detail |
| `PATCH` | `/api/monitors/:id` | Update / pause / resume |
| `DELETE` | `/api/monitors/:id` | Remove monitor (+ its results & incidents) |
| `GET` | `/api/monitors/:id/results?range=24h` | Latency time-series |
| `GET` | `/api/monitors/:id/incidents` | Incident history |

---

## Architecture

Layered: **routes → controllers → services → models**. Business logic never
lives in a route.

```
React (Vite) ──REST──▶ Express API ──▶ services ──▶ MongoDB
                             │
        node-cron tick ──▶ checkRunner ──▶ probe ──▶ stateMachine ──▶ notifier
                                                          │
                                                      incidents
```

The two modules worth calling out, both kept **pure** (no Express, no Mongoose)
so they are trivially testable:

- `services/stateMachine.service.js` — the `UP/DOWN` transition + debounce.
- `services/checker.service.js` — one HTTP probe → a plain result object.

The `notifiers/` folder is a **seam**: `Notifier.send(payload)` is the whole
interface; the scheduler knows nothing about channels.

---

## Running it

### Requirements

| Tool | Why |
|---|---|
| **Node.js 20+** | Runs both the API and the client build |
| **A MongoDB Atlas cluster** | Stores everything. The free M0 tier is enough; no card required |

Nothing else. No global npm packages, no local MongoDB install, no Docker.

### First time

```bash
npm run setup     # installs all three package sets + writes server/.env
```

`setup` generates `server/.env` with a random `JWT_SECRET`. It never overwrites
an existing `.env`, so re-running it is safe.

Open `server/.env` and set `MONGO_URI` to your Atlas connection string
(Atlas → **Connect** → **Drivers**):

```
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/uptime?retryWrites=true&w=majority
```

Two things that string needs before it works: the `<password>` placeholder
replaced with the **database user's** password (Atlas → Database Access — a
different account from your Atlas login), and a database name in the path
(`/uptime` above). Without the database name Mongoose connects fine and writes
into a default `test` database instead, which looks like your data vanishing.

```bash
npm start         # API + client together
```

Then open **http://localhost:5173** and create an account.

### Every time after that

```bash
npm start
```

### Why one command matters

The app is **two servers**: the API on `:5000` and the Vite client on `:5173`.
The client proxies `/api` to the API, so if the API is not running every
request fails — including sign-in, which just looks like a broken login page.
`npm start` starts both, so they cannot drift apart. (`npm start` is an alias
for `npm run dev`.)

### Database

MongoDB lives in **Atlas** — the same cluster in development and production,
unless you create a second one. `server/.env` points `MONGO_URI` at it.

**Leave `MONGO_URI` unset and the server falls back to an in-process MongoDB
that is wiped on exit** — your account disappears on every restart. That
fallback exists so a fresh clone runs before you have credentials to paste in;
it is not what you want once you have an account. In production it is refused
outright rather than silently losing data on each deploy.

If the connection fails, the error says which of the two usual causes it is —
your IP missing from Atlas → **Network Access**, or bad credentials — because
the driver's own message ("querySrv ENOTFOUND", "bad auth") names neither.
`npm run doctor` reports the same thing against a running database.

---

## Accounts

Every `/api` route except `/api/auth/*` requires a session, and **monitors are
private to the account that created them**.

```
POST /api/auth/signup     name, email, password  → 201 + session cookie
POST /api/auth/login      email, password        → 200 + session cookie
POST /api/auth/logout     ends this session
POST /api/auth/logout-all ends every session on every device
GET  /api/auth/me         the signed-in user, or 401
```

**The token never reaches JavaScript.** It is issued as an `httpOnly`,
`SameSite=Lax` cookie (`Secure` in production) with a 30-day lifetime, so an
XSS bug on the page has no token to steal. The client cannot read it and does
not try — it calls `/auth/me` to find out whether it is signed in.

**A 30-day token is still revocable.** Each user carries a `tokenVersion`
stamped into every token they are issued; bumping it invalidates all of them at
once. That is what `logout-all` does.

**Other people's monitors return `404`, not `403`.** A 403 confirms the id
exists, which turns a guessable id into a way to enumerate someone else's
monitors.

Other measures: bcrypt at 12 rounds; a constant-time-ish login path that spends
the same work on an unknown email as on a wrong password (so timing does not
reveal who has an account); one message for both failures; `express-rate-limit`
at 10 attempts per 15 minutes on the credential endpoints; a 100kb body cap;
and `trust proxy` off by default, since trusting `X-Forwarded-For` from
anywhere lets a client forge its IP past the rate limiter.

`JWT_SECRET` is **required in production** — the server exits if it is missing.
In development one is generated at boot, so restarting signs you out.

Upgrading a database that predates accounts? Monitors without an owner are
invisible to every query. Hand them to an account with:

```bash
npm run claim:monitors -- you@example.com          # dry run
npm run claim:monitors -- you@example.com --apply
```

---

## Alerts

Set `NOTIFIER_CHANNELS` to any comma-separated combination of `console`,
`telegram` and `email`. Every listed channel gets every alert, and a channel
that fails is logged and stepped over rather than taking the others down.

Enabling a channel without its credentials is a **startup error**, not a
silently dropped 3 a.m. page.

### Telegram — free, unlimited, pushes to your phone

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token
2. Open your new bot and **send it any message** — a bot cannot start a
   conversation, so skipping this is the usual cause of `chat not found`
3. `npm run telegram:id` → prints the chat id

```env
NOTIFIER_CHANNELS=console,telegram
TELEGRAM_BOT_TOKEN=123456789:AAE...
TELEGRAM_CHAT_ID=987654321
```

### Email — Brevo, 300/day free forever

Sign up at [brevo.com](https://www.brevo.com), then **SMTP & API → Create an
API key**. `ALERT_EMAIL_FROM` must be a *verified sender* on the account.

```env
NOTIFIER_CHANNELS=console,telegram,email
BREVO_API_KEY=xkeysib-...
ALERT_EMAIL_FROM=alerts@yourdomain.com
ALERT_EMAIL_TO=you@example.com,teammate@example.com
```

### Verify it

```bash
npm run notify:test -- --both     # fires a fake DOWN, then a RECOVERY
```

Sends through the real configured channels — no database, no waiting for
something to actually break. It prints per-channel success or the exact
provider error.

> **SMS?** There is no genuinely free option. Twilio/Vonage give one-time
> trial credit and only reach pre-verified numbers, and in India transactional
> SMS additionally requires DLT registration. Telegram is the free substitute.

---

## Configuration

All backend config is validated at boot in `server/src/config/env.js` — a bad
value fails fast instead of crashing later. Key knobs (`server/.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `CHECK_TICK_SECONDS` | `30` | How often the scheduler dispatches due checks (**1-59**; it is the seconds field of a cron expression) |
| `FAILURE_THRESHOLD` | `3` | Consecutive failures before flipping `DOWN` |
| `REQUEST_TIMEOUT_MS` | `10000` | Per-probe hard timeout |
| `RESULT_RETENTION_DAYS` | `30` | TTL for check results (auto-purge) |
| `SSRF_GUARD` | `true` | Block private/loopback target IPs |
| `MONGO_URI` | *(unset)* | Atlas connection string. **Required in production**; unset → in-memory (dev only) |
| `NOTIFIER_CHANNELS` | `console` | Comma-separated: `console,telegram,email` |
| `NOTIFY_TIMEOUT_MS` | `10000` | Per-provider timeout (one retry on 5xx/429/timeout) |
| `JWT_SECRET` | *(dev: generated)* | **Required in production** — signs session cookies |
| `JWT_EXPIRES_DAYS` | `30` | Session lifetime; the cookie's Max-Age matches |
| `TRUST_PROXY` | `false` | Enable only behind a proxy you control (**`true` on Railway**) |
| `CORS_ORIGIN` | `http://localhost:5173` | Exact origins allowed to call the API with credentials, comma-separated |
| `COOKIE_SECURE` | *(prod: `true`)* | HTTPS-only auth cookie |
| `COOKIE_SAMESITE` | *(prod: `none`)* | `none` lets the Vercel frontend send the cookie to the Railway API; `lax` if both share one origin |

---

## What's deferred

Intentionally **not** in this prototype (planned for later phases):

- Google OAuth (the button is present but disabled — it needs a Google Cloud
  client id/secret), password reset, email verification
- Alert cooldown / flap suppression, per-monitor recipients
- Keyword assertion, SSL-expiry warnings
- Real-time dashboard via Socket.IO (currently 10s polling)
- Public shareable status page
- CI pipeline

The structure is already shaped for these — e.g. adding auth is a `userId`
field on `Monitor` plus a filter, and a new notifier is one class at the
existing seam.

---

## Project layout

```
uptime-monitor/
├── server/     # Express API + node-cron scheduler + services + models  → Railway
│   ├── src/config, models, services, scheduler, notifiers, routes, controllers, middleware, utils
│   ├── scripts/probe.js          # Phase-1 standalone probe
│   ├── scripts/notify-test.js    # fire a fake alert through real channels
│   ├── scripts/telegram-chat-id.js
│   ├── railway.json              # Railway build/deploy + /health check
│   └── tests/unit/               # state machine truth table + notifiers
└── client/     # React + Vite dashboard                                 → Vercel
    ├── vercel.json               # SPA rewrites so deep links survive refresh
    └── src/api, components, pages, utils
```

Database: **MongoDB Atlas**. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full
deploy walkthrough.
