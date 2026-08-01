# Getting UPTime Monitor onto GitHub and deployed for free

This covers two things: getting this project into its own GitHub repository, and
deploying the frontend, backend, and database somewhere free and working
together as one app.

---

## ⚠️ Read this first: your git repo is not scoped to this project

Running `git status` from inside this folder shows paths like `../../../.agents/`,
`../../../.bash_history`, `../../../NTUSER.DAT`, and unrelated project folders
(`AI-Interview/`, `DSA/`, `CashFlow/`, ...) as untracked files. That's because:

```
git rev-parse --show-toplevel  →  C:/Users/vishw
```

**The git repository you're currently inside is rooted at your entire Windows
user profile**, not at `UPTime_Monitor`. Its history (`Add my name`,
`AI Interview Coach SPA`, ...) belongs to a different project entirely. This was
almost certainly created by running `git init` once from the home directory
instead of from inside a project folder, and it's been silently sitting there
since.

**Do not run `git add .` or `git add -A` from that root, or from anywhere
relying on it.** It would stage your entire profile — browser data, the
`NTUSER.DAT` registry hive, SSH/config folders, every unrelated project — into
whatever you commit next. If that ever got pushed to a public GitHub repo, all
of that would be exposed.

I'm not touching that outer repository — whether to keep it, repurpose it for
the AI Interview project, or delete it is your call, and undoing a `git init`
higher up should be deliberate, not something a doc talks you into as a side
effect. Instead, the steps below create a **brand-new, independent repository
scoped only to this folder**. Once `UPTime_Monitor/.git` exists, Git always
uses the nearest `.git` upward from your working directory, so every command
you run from inside `UPTime_Monitor` from that point on operates on the new,
isolated repo and never touches the one at `C:/Users/vishw`.

---

## Part 1 — Put this project on GitHub

### 1. Initialize a repo scoped to this folder only

```bash
cd "C:\Users\vishw\OneDrive\Desktop\UPTime_Monitor"
git init
git status
```

`git status` should now list only files inside `UPTime_Monitor` — no `../`
paths. If you see anything from outside this folder, stop and re-check before
continuing.

### 2. Confirm secrets are actually ignored

```bash
git check-ignore -v server/.env
```

This should print a match against `.gitignore`'s `.env` line. If it prints
nothing, `server/.env` (which has your real `GMAIL_APP_PASSWORD` and
`JWT_SECRET`) would get committed — fix `.gitignore` before proceeding. The
existing `.gitignore` already covers `node_modules/`, `.env`, `dist/`, and
`build/`, which is everything this project needs excluded.

### 3. First commit

```bash
git add .
git status
```

Look through the output — you're checking that `server/.env` is **not**
listed (only `server/.env.example` should be), and that no `node_modules`
folders appear.

```bash
git commit -m "Initial commit: UPTime Monitor"
```

### 4. Create the GitHub repo and push

Using the GitHub CLI (`gh`), if you have it:

```bash
gh repo create uptime-monitor --private --source=. --remote=origin --push
```

Or manually: create an empty repository at github.com (no README, no
`.gitignore` — you already have both), then:

```bash
git remote add origin https://github.com/<your-username>/uptime-monitor.git
git branch -M main
git push -u origin main
```

`client/src/config.js` currently hardcodes
`GITHUB_URL = 'https://github.com/vishwasraoch555/uptime-monitor'` for the
navbar/docs links — update that to match whatever repo name and username you
actually use.

---

## Part 2 — Why this app needs a specific deployment shape

Two things about this codebase constrain where it can run for free, and
skipping past them is why a naive deployment breaks:

**1. The scheduler needs a process that never stops.**
`src/scheduler/index.js` runs a `node-cron` job every `CHECK_TICK_SECONDS`,
in-process, forever. That's what detects outages automatically. Serverless
platforms (Vercel functions, Netlify functions) only run code in response to
an incoming request and shut down between calls — there is no "forever" for a
background timer to live in. **The backend must run on a platform that keeps
a persistent Node process alive**, not a serverless one.

**2. The auth cookie only survives on a single origin.**
`src/utils/authCookie.js` sets the session cookie with `sameSite: 'lax'`.
Browsers do not attach a `lax` cookie to cross-site `fetch`/XHR calls — only
to top-level navigations. If the frontend and backend end up on two different
domains (e.g. a static site on one host, the API on another), login will
appear to succeed and then every subsequent request will silently go out
unauthenticated, with nothing informative in the browser's network tab.

To make a truly free, single-service deployment possible without changing
that cookie policy, I added a small piece of infrastructure in
`server/src/app.js`: when `NODE_ENV=production`, Express serves the built
React app (`client/dist`) directly, with any non-`/api`, non-`/health` path
falling back to `index.html` (required for React Router's client-side routes
like `/monitor/:id` to survive a page refresh). Frontend and backend become
one origin, one free service, and the cookie problem never comes up.

---

## Part 3 — The recommended free stack

| Piece | Service | Why |
|---|---|---|
| Database | MongoDB Atlas (M0 tier) | Free forever, 512MB, no card required |
| Backend + Frontend | Render (Web Service, free tier) | Persistent process (scheduler keeps running), serves both API and built frontend from one URL |

### Step 1 — MongoDB Atlas

1. Sign up at mongodb.com/cloud/atlas, create a free **M0** cluster.
2. **Database Access** → add a database user with a username/password (not
   your Atlas login).
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere). Render's free
   tier doesn't have static outbound IPs, so you can't scope this tighter
   without a paid Atlas network peering feature.
4. **Connect → Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/uptime?retryWrites=true&w=majority
   ```
   Make sure a database name (`uptime` above) is in the path — without it,
   Mongoose connects but writes to a default `test` database instead.

### Step 2 — Push the app.js change and commit

The static-serving change is already in `server/src/app.js` on your working
tree from this session — make sure it's included in the commit you push
(Part 1, step 3, if you haven't committed yet).

### Step 3 — Create the Render Web Service

1. Sign up at render.com, connect your GitHub account, select the
   `uptime-monitor` repo.
2. **New → Web Service**, and set:
   - **Root Directory:** leave blank (repo root)
   - **Build Command:**
     ```
     npm --prefix server install && npm --prefix client install && npm --prefix client run build
     ```
   - **Start Command:**
     ```
     npm --prefix server start
     ```
   - **Instance Type:** Free

3. **Environment** tab — add these variables:

   | Key | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables the static-serving block and secure cookies |
   | `MONGO_URI` | your Atlas connection string | From Step 1 |
   | `JWT_SECRET` | output of the command below | Required in production — server refuses to boot without it |
   | `JWT_EXPIRES_DAYS` | `30` | |
   | `CHECK_TICK_SECONDS` | `30` | |
   | `FAILURE_THRESHOLD` | `3` | |
   | `NOTIFIER_CHANNELS` | `console,gmail` | |
   | `GMAIL_USER` | `neerajkr5647@gmail.com` | |
   | `GMAIL_APP_PASSWORD` | your 16-char app password | No spaces needed — the app strips them |
   | `ALERT_EMAIL_FROM_NAME` | `Uptime Monitor` | |
   | `CORS_ORIGIN` | your Render URL, e.g. `https://uptime-monitor-xxxx.onrender.com` | Same-origin means this mostly won't be exercised, but set it correctly anyway |
   | `SSRF_GUARD` | `true` | |

   Generate `JWT_SECRET` locally first:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. Click **Create Web Service**. Render will run the build, then start the
   server. Watch the deploy log for:
   ```
   Alert channels active {"channels":["console","gmail"]}
   Scheduler started {"everySeconds":30}
   API listening
   ```
   If `JWT_SECRET` or `MONGO_URI` is missing/wrong, the log will say exactly
   that and the service will fail to start — the app is written to fail loudly
   here rather than boot in a broken state.

### Step 4 — The free-tier catch: keep the scheduler awake

Render's free web services **sleep after 15 minutes with no incoming HTTP
traffic**, and spinning back up on the next request takes 30-60 seconds. While
asleep, the process isn't running at all — which means the scheduler isn't
ticking, and a real outage during that window won't be detected until
something wakes the service up. This defeats the entire point of "automatic"
monitoring if left alone.

The standard fix: have something ping the app every 10-14 minutes so it never
gets the chance to sleep. Your own health endpoint (`GET /health`) is built
for exactly this. Pick one, free:

- **cron-job.org** — free account, add a job hitting
  `https://<your-app>.onrender.com/health` every 10 minutes.
- **UptimeRobot** free tier — same idea, and doubles as a second, independent
  uptime check on your own app.
- A scheduled **GitHub Actions** workflow in this repo (`curl` on a cron
  schedule) works too, if you'd rather not add another third-party account.

Yes — you'll be using an external uptime pinger to keep your own uptime
monitor from falling asleep. That's genuinely the tradeoff of the free tier,
not a workaround for a bug.

### Step 5 — Verify it actually works end to end

1. Open the Render URL in a browser, sign up with a real email you can check.
2. Confirm the welcome email arrives (check Spam once, per the earlier fix).
3. Create a monitor pointing at a URL you control or a deliberately broken one.
4. Wait for 3 failed checks (`FAILURE_THRESHOLD=3`, ~2-3 minutes at the
   default 60s interval) and confirm the DOWN alert email arrives without you
   touching "Check now."

---

## Part 4 — Redeploying after changes

Render auto-deploys on every push to the branch you connected (`main` by
default):

```bash
git add -A
git commit -m "your change"
git push
```

Watch the Render dashboard's deploy log the same way as the first deploy.

---

## Part 5 (optional/advanced) — Splitting frontend and backend across two hosts

If you'd rather put the React build on Vercel/Netlify (better CDN, instant
global caching) and keep only the API on Render, you can — but it puts you
back into the cross-site cookie problem from Part 2. That would need
`sameSite: 'none'` on the cookie (which in turn requires `Secure`, i.e. HTTPS
everywhere — true on both platforms) plus tighter, exact-match `CORS_ORIGIN`
handling, none of which is wired up right now. I'd rather flag that clearly
than hand you a two-host setup that silently breaks login, so treat this as a
"come back and ask me to wire up cross-site cookies properly" option rather
than a drop-in alternative to Part 3.

---

## Appendix — Full environment variable reference

See `server/.env.example` in the repo for the complete list with inline
explanations of every variable, including the optional Telegram and Brevo
alert channels this guide didn't need.
