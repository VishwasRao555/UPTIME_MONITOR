# Deploying UPTime Monitor

The stack, and why each piece is where it is:

| Piece | Service | Why this one |
|---|---|---|
| Database | **MongoDB Atlas** (M0 free) | Free forever, 512 MB, no card required |
| Backend + scheduler | **Railway** | Keeps a Node process alive permanently — the scheduler needs that |
| Frontend | **Vercel** | Static React build on a CDN, deploys on push |

Everything below assumes the repo is already on GitHub. Both platforms deploy
from it directly.

---

## The one constraint that shapes all of this

**The scheduler needs a process that never stops.**
`server/src/scheduler/index.js` runs a `node-cron` job every
`CHECK_TICK_SECONDS`, in-process, forever. That is what detects outages without
anyone pressing a button. Serverless platforms — Vercel Functions, Netlify
Functions, Lambda — only run code in response to a request and shut down in
between. There is no "forever" there for a background timer to live in, so the
backend cannot go on Vercel next to the frontend. Railway runs a normal
long-lived container, which is exactly what this needs.

That split has one consequence worth understanding before you hit a confusing
bug, covered next.

---

## Why the auth cookie needed changing

`uptime-monitor.vercel.app` and `uptime-monitor.up.railway.app` are **different
sites**, not just different subdomains — `vercel.app` and `up.railway.app` are
both on the Public Suffix List, so browsers treat them as unrelated registrable
domains. Every API call the dashboard makes is therefore cross-site.

The session cookie used to be `SameSite=Lax`, and browsers **never** attach a
Lax cookie to a cross-site `fetch`/XHR. Deployed as-is, that produces the worst
kind of bug: login returns `200`, the cookie is stored, and every request after
it goes out unauthenticated — with nothing in the network tab saying why.

So the cookie policy is now configurable, defaulting to `SameSite=None` in
production (`COOKIE_SAMESITE` in `server/src/config/env.js`). Two guardrails
come with it:

- Browsers reject `SameSite=None` without `Secure`, silently. The server now
  **refuses to boot** on that combination instead of shipping a cookie the
  browser throws away.
- `SameSite=None` means other sites can cause the browser to *send* the cookie,
  so the CORS allow-list has to be exact. `CORS_ORIGIN` is matched exactly (no
  wildcards, trailing slashes stripped), and a blocked origin is logged with the
  value it would have needed — because a CORS failure is invisible from the
  client side.

This is safe here because the API never mutates state through `GET`, so the
CSRF surface a Lax cookie was protecting against does not exist.

---

## Step 1 — MongoDB Atlas

1. Create a free **M0** cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. **Database Access** → add a database user with a username and password. This
   is a *separate* account from your Atlas login.
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere).

   Railway does not give free services a static outbound IP, so there is no
   narrower CIDR that would keep working. The database is still protected by
   the user password and TLS — but this is the real reason that password needs
   to be a strong one.
4. **Connect → Drivers → Node.js** → copy the connection string:

   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

   Two edits before it will work:

   - Replace `<password>` with the database user's actual password. If it
     contains `@ : / ? # [ ]`, percent-encode them (`@` → `%40`, `#` → `%23`).
     An unencoded `@` splits the URI in the wrong place and produces an
     authentication error that looks like a wrong password.
   - Add the database name to the path: `.mongodb.net/uptime?retryWrites=...`.
     Without it Mongoose connects happily and writes into a default `test`
     database — the app works, and then your data is not where you look for it.

Keep the finished string somewhere handy; Step 2 and your local `server/.env`
both need it.

---

## Step 2 — Backend on Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub
   repo** → pick this repo.
2. Open the service → **Settings**:
   - **Root Directory:** `server`

     This matters. It points the build at `server/package.json` and
     `server/railway.json`, so Railway installs only the API's dependencies and
     picks up the health check. Left at the repo root, the root `railway.toml`
     is a fallback — but setting Root Directory to `server` is still the
     clearer setup.
   - Leave build and start commands alone — `server/railway.json` supplies them
     (`npm start`, health check on `/health`).
   - Confirm **Healthcheck Path** is `/health` and timeout is at least `300`
     seconds (Settings → Healthcheck). A shorter UI override will mark a cold
     Atlas wake as a failed deploy.
3. **Variables** → add:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGO_URI` | your Atlas string from Step 1 (`MONGO_URL` is accepted too) |
   | `JWT_SECRET` | generate it — see below |
   | `JWT_EXPIRES_DAYS` | `30` |
   | `TRUST_PROXY` | `true` |
   | `CHECK_TICK_SECONDS` | `30` |
   | `FAILURE_THRESHOLD` | `3` |
   | `NOTIFIER_CHANNELS` | `console,gmail` |
   | `GMAIL_USER` | your Gmail address |
   | `GMAIL_APP_PASSWORD` | the 16-character App Password (spaces are stripped for you) |
   | `ALERT_EMAIL_FROM_NAME` | `Uptime Monitor` |
   | `SSRF_GUARD` | `true` |
   | `CORS_ORIGIN` | *(placeholder for now — filled in at Step 4)* |

   Generate the secret locally:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Do **not** set `PORT` — Railway injects it, and the server already reads it.

   `TRUST_PROXY=true` is required here specifically: requests arrive through
   Railway's edge proxy, so without it every client appears to come from the
   same IP and the login rate limiter throttles all your users as one attacker.

4. **Settings → Networking → Generate Domain**. Copy the result, e.g.
   `https://uptime-monitor-production.up.railway.app`. This is your API URL.

5. Check the deploy log for:

   ```
   MongoDB connected
   Alert channels active {"channels":["console","gmail"]}
   Scheduler started {"everySeconds":30}
   API listening
   ```

   A missing `JWT_SECRET` or `MONGO_URI` fails the boot with a message naming
   the variable — the app is written to fail loudly rather than start broken.

6. Confirm it is up: open `https://<your-railway-domain>/health` in a browser.
   You want `{"status":"ok","db":"connected"}`.

> **Keep it at one replica.** The scheduler runs inside the web process, so two
> replicas would each check every monitor and you would get duplicate alerts.
> `railway.json` pins `numReplicas: 1`.

---

## Step 3 — Frontend on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import this repo.
2. **Root Directory:** `client` — the React app is not at the repo root, and
   Vercel builds nothing useful if this is left blank.
3. Framework preset should auto-detect **Vite**. `client/vercel.json` already
   sets the build command, output directory, and the SPA rewrite that makes
   `/monitor/:id` survive a refresh instead of returning Vercel's 404.
4. **Environment Variables** → add:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-railway-domain>/api` |

   Include the `/api` suffix and no trailing slash. Vite inlines this at **build
   time**, so if you change it later you must redeploy — editing the variable
   alone does nothing to the already-built site.
5. **Deploy**, then copy the resulting URL, e.g.
   `https://uptime-monitor.vercel.app`.

---

## Step 4 — Introduce them to each other

Back in Railway → **Variables**, set:

```
CORS_ORIGIN=https://uptime-monitor.vercel.app
```

Your exact Vercel URL, **no trailing slash**. Railway redeploys automatically.

This is the step people skip. Without it the browser blocks every API call, the
dashboard looks completely dead, and the Railway logs are the only place that
says why:

```
Blocked a cross-origin request: add this origin to CORS_ORIGIN
```

Vercel preview deployments get their own URLs and are **not** covered by the
production entry. If you want a preview branch to talk to the API, add its URL
to the same comma-separated list.

---

## Step 5 — Verify end to end

1. Open the Vercel URL. The navbar's indicator should read **API online** — that
   is a live `/health` call against Railway, so it is a real cross-origin test.
2. Sign up with an email you can check, and confirm the welcome email arrives
   (look in Spam once).
3. **Refresh the page.** This is the important one: if you stay signed in, the
   cross-site cookie is working. If you get bounced to login, the cookie was
   dropped — check `COOKIE_SAMESITE`/`COOKIE_SECURE` and that `NODE_ENV` is
   `production` on Railway.
4. Navigate to a monitor detail page and refresh again — that tests the SPA
   rewrite in `vercel.json`.
5. Create a monitor pointing at a deliberately broken URL, then leave it alone.
   After `FAILURE_THRESHOLD` (3) failed checks the DOWN alert should arrive
   without you touching "Check now" — that proves the scheduler is running on
   Railway.

---

## Redeploying

Both platforms auto-deploy on push to `main`:

```bash
git add -A
git commit -m "your change"
git push
```

Vercel rebuilds the client, Railway rebuilds the API. They are independent — a
frontend-only change does not restart the scheduler.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Login succeeds, refresh signs you out | Cookie dropped. `NODE_ENV` must be `production` on Railway so `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` apply |
| Dashboard empty, console shows CORS errors | `CORS_ORIGIN` missing your Vercel URL, or has a trailing slash |
| Navbar says "API offline" | `VITE_API_URL` wrong or missing — remember it needs a **redeploy**, not just an edit |
| Railway boot fails: `MONGO_URI is required in production` | Variable unset, empty, or **named something else**. Only `MONGO_URI` and `MONGO_URL` are read — `MONGODB_URI`, `DATABASE_URL` and friends are invisible |
| `Healthcheck failed` with no app logs at all | The process exited before opening a port, so there was nothing to probe. Scroll the deploy log to the last line before it died — it names the variable |
| `Healthcheck failed` after ~1–2 min, logs show Mongo retries | Atlas unreachable or still waking. Confirm Network Access allows `0.0.0.0/0` and `MONGO_URI`/`MONGO_URL` is set. The API now binds `$PORT` before Mongo so Railway can probe `/health` (503 until connected, then 200) |
| Build succeeds but healthcheck never gets a response | Service **Root Directory** must be `server` (or the repo-root `railway.toml` fallback must apply). Root `npm start` is local-dev only and does not bind Railway's `$PORT` |
| `querySrv ENOTFOUND` / server selection timeout | Atlas → Network Access is missing `0.0.0.0/0` |
| `querySrv ECONNREFUSED` | Not Atlas — the machine's DNS resolver refused the query, so `mongodb+srv://` cannot discover the shards. Point DNS at `1.1.1.1`, or use the SRV-free seed list from **Connect → Drivers → Node.js 2.2.12 or later** |
| `bad auth` on boot | Wrong database-user password, or a special character that needs percent-encoding |
| Deep links 404 on refresh | Vercel Root Directory is not `client`, so `vercel.json`'s rewrite is not being applied |
| Duplicate alert emails | More than one Railway replica — the scheduler runs per-process |

---

## Appendix — running it locally after this change

Local development is unchanged except that the database is now Atlas instead of
a container:

```bash
npm run setup     # installs everything, writes server/.env with a random JWT_SECRET
# paste your Atlas string into MONGO_URI in server/.env
npm start         # API on :5000, client on :5173
```

Locally both halves are same-origin through Vite's dev proxy, so
`COOKIE_SAMESITE` resolves to `lax` and `VITE_API_URL` stays unset. Nothing
about the production cookie configuration applies on localhost — which is why
it is derived from `NODE_ENV` rather than hardcoded.

`server/.env.example` documents every variable, including the Telegram and Brevo
alert channels this guide did not need.
