# UPTIME_MONITOR — Design System

> Single source of truth for the visual language of the Uptime Monitor UI.
> The implementation lives in [`client/src/index.css`](client/src/index.css).
> **Keep this file in sync whenever a token, component, icon, or animation changes.**

The aesthetic: a **warm brutalist-poster** look — cream paper, one signal-yellow
accent, hard black ink borders, a condensed display face. Confident, high-contrast,
zero gradients-for-decoration. Every color is drawn from the token set below so the
whole surface blends into one system.

---

## 1. Color palette

All colors are CSS custom properties on `:root`. Never hardcode a hex in a component —
reference the token.

### Brand / surface
| Token | Hex | Use |
|---|---|---|
| `--yellow` | `#f5c842` | Primary accent — navbar, hero, primary buttons, focus energy |
| `--yellow-deep` | `#e6b52e` | Accent hover / gradient end / chart fill |
| `--yellow-soft` | `#fbe7a6` | Soft accent fills (docs step icons) |
| `--ink` | `#141210` | Near-black — text, borders, dark surfaces, primary button bg |
| `--ink-soft` | `#221f1a` | Hover state for ink surfaces |
| `--canvas` | `#f4efe1` | Page background (warm cream) |
| `--surface` | `#fffdf7` | Card / panel surface |
| `--surface-2` | `#faf5e8` | Inset surface (inputs, filter track) |
| `--surface-3` | `#f1e9d6` | Scrollbar thumb, subtle wells |
| `--border` | `#e7dfc9` | Default hairline border |
| `--border-soft` | `#efe8d7` | Lightest divider |

### Text
| Token | Hex | Use |
|---|---|---|
| `--text` | `#141310` | Body + headings |
| `--muted` | `#6f6a5c` | Secondary text, labels, meta |
| `--muted-2` | `#8a8474` | Tertiary / placeholder-adjacent |

### Status (semantic — always paired with an icon or text, never color-only)
| Token | Hex | Meaning |
|---|---|---|
| `--up` | `#1f9d55` | UP / healthy / success |
| `--up-soft` | `rgba(31,157,85,.12)` | UP pill fill |
| `--down` | `#e23b3b` | DOWN / error / destructive |
| `--down-soft` | `rgba(226,59,59,.12)` | DOWN pill fill |
| `--pending` | `#d98a12` | PENDING (awaiting first result) |
| paused | uses `--muted` | Checks suspended |

Dark-surface status brights (inside the stats bar / detail bar): UP `#4bd287`,
DOWN `#ff6a6a`, accent `--yellow`.

---

## 2. Typography

Loaded in [`client/index.html`](client/index.html) from Google Fonts.

| Role | Family | Notes |
|---|---|---|
| **Display** | `Anton` | UPPERCASE, `letter-spacing: -0.01em`, `line-height: .92–1.05`. Headings, stat values, card titles, brand. |
| **UI / body** | `Space Grotesk` | Weights 400 / 500 / 600 / 700. All prose, labels, buttons. |

**Type scale (rem):** `0.6 · 0.66 · 0.72 · 0.76 · 0.8 · 0.84 · 0.9 · 1 · 1.05 · 1.25 · 1.55` and display clamps.
**Numeric data** uses `.tnum` (`font-variant-numeric: tabular-nums`) so figures don't jitter.
**Eyebrows / labels:** uppercase, `letter-spacing: 0.06–0.18em`, `--muted`.

---

## 3. Shape, elevation, spacing

| Token | Value | Use |
|---|---|---|
| `--r-pill` | `999px` | Buttons, badges, chips, pills, inputs-in-toolbar |
| `--r-card` | `14px` | Cards, sections, steps |
| `--r-input` | `10px` | Form inputs |
| `--shadow-card` | `0 1px 0 …, 0 8px 22px -16px …` | Resting card |
| `--shadow-pop` | `0 24px 60px -24px …` | Modals, toasts, notification prompt |
| `--nav-h` | `56px` | Navbar height (layout math) |

**Borders are structural, not subtle:** primary elements use a `2px solid var(--ink)`
outline (navbar, hero, buttons, modals, toasts, prompt). Interior hairlines use
`1.5px var(--border)`. **Spacing rhythm:** 4 / 6 / 8 / 12 / 14 / 16 / 20 / 24 px.

---

## 4. Layout model — fixed app-shell

The app never lets the **page** scroll; only the content region does.

```
.app-shell  height:100dvh; flex column; overflow:hidden
├── .navbar        (sticky, 56px, yellow, ink border-bottom)
├── .app-main      flex:1; min-height:0; overflow-y:auto   ← the only scroll area
│     └── .container / .dash   (page content)
└── .footer        (slim, always visible at the bottom)
```

- **Dashboard** (`.dash`) is a flex column: hero → toolbar → list-meta are
  `flex-shrink:0`; the card grid takes the rest. Few monitors = nothing scrolls.
- Compact by design so the common case fits one viewport (cards ~150px tall,
  `minmax(258px,1fr)` grid, 12px gaps).

---

## 5. Components

| Component | File | Notes |
|---|---|---|
| Navbar | `components/Navbar.jsx` | Brand · nav links (active pill) · API-status pill · notification bell · GitHub · account chip + sign out |
| Auth splash | `components/AuthSplash.jsx` | Full-viewport hold while `/auth/me` resolves; reuses `ring-out` |
| Buttons | `.btn` variants | `primary` (yellow), `ghost`, `danger`, `on-dark`, `sm`; `.icon-btn`/`.icon-btn.xs` |
| Status pill | `components/StatusPill.jsx` | `.pill.{up,down,pending,paused}` — dot + label |
| Monitor card | `components/MonitorCard.jsx` | title · url · uptime strip · 3 metrics · method badge · check/pause/open |
| Fleet stats | `components/FleetStats.jsx` | dark 5-up bar at hero base |
| Live indicator | `components/LiveIndicator.jsx` | pulsing dot + "updated Ns ago" + refresh |
| Toolbar | Dashboard | filter chips (with counts) · search · sort select |
| Modal / form | `components/MonitorForm.jsx` | ink-bordered pop-in, required `*`, hints |
| Toasts | `context/ToastContext.jsx` | ink cards, bottom-right, `aria-live`, auto-dismiss 4s |
| Notification prompt | `components/NotificationPrompt.jsx` | animated bell, slide-up, permission request |
| Detail | `pages/MonitorDetail.jsx` | title row · dark stat bar · latency chart · incidents table |
| Docs | `pages/Docs.jsx` | hero · numbered steps · status legend · FAQ · CTA |
| Footer | `components/Footer.jsx` | slim, always-visible; includes BuiltBy credit |
| BuiltBy | `components/BuiltBy.jsx` | "Built by CH VISHWAS RAO" — Anton name, yellow underline, links to GitHub |
| Auth shell | `components/AuthLayout.jsx` | split: form on canvas ∥ art plate on accent. Renders **outside** the app-shell — no navbar, no footer; includes BuiltBy credit under the form |
| Password field | `components/PasswordField.jsx` | show/hide affix + 3-band strength meter (signup only) |
| Auth extras | `components/AuthExtras.jsx` | submit button w/ busy state · form-level error · Google button (disabled) |
| Slideshow | `components/Slideshow.jsx` | 3-up carousel, 2s hold, crossfade, loops forever. Pauses only on a hidden tab — **never on hover**, since the panel sits under the resting cursor and a hover-pause reads as a broken loop |
| Login / Signup | `pages/Login.jsx`, `pages/Signup.jsx` | validate on blur, focus first invalid on submit |

### Auth specifics

- **Inputs stay `--r-input` (10px)**, not pills. The reference design used pill
  inputs; the token table reserves pills for buttons/badges and `--r-input` for
  form fields, and the system wins over the reference.
- **Labels are visible**, never placeholder-only — placeholders vanish the
  moment someone types, taking the field's name with them.
- **`/` is gated by a real session.** `RequireAuth` in `App.jsx` reads
  `AuthContext`, whose answer comes from the server's `/auth/me` — not a
  client-side flag. The dashboard keeps its path at `/`, so every existing link
  still resolves. The client *cannot* fake its way past this: the token is an
  httpOnly cookie it can neither read nor forge, and every `/api` route
  re-checks server-side regardless. This guard picks the right screen; it is
  not the security.
- **`AuthSplash` covers the session probe.** The app boots in a `loading`
  state for one round-trip. Rendering before the answer arrives would flash
  the dashboard at a signed-out visitor, or the login page at a signed-in one.
- **Google is the only SSO provider**, so it is a full-width labelled button,
  not a circle. A lone circle reads as "one of several, the rest missing".
- **The accent is an inset box, not a full-bleed column.** `.auth-art` supplies
  only the margin; the yellow, the `2px` ink border and the `26px` radius live
  on `.art-box`, so the canvas frames it on all four sides. Its footprint is
  one knob — `--art-scale` on `.art-box`, currently `0.8` — sized as a
  percentage of the column rather than a `transform`, so the border weight and
  corner radius stay true instead of being scaled with it.
- **Carousel artwork keeps its own colours.** An earlier version duotoned all
  three slides into the yellow family for cohesion; that was reversed on
  request. The inset accent box now does the reconciling instead of a filter,
  framing three unrelated palettes rather than flattening them.
- **Slides use `object-fit: cover`** and fill the plate edge to edge — no
  letterboxing. Source ratios run 1.10 / 1.20 / 1.57, so the widest slide is
  cropped top and bottom. That is the deliberate trade for a flush fit.
- **The auth screen never scrolls the page.** `.auth` is `height: 100dvh;
  overflow: hidden`. On a viewport too short for the form, `.auth-panel`
  scrolls internally so the art box stays put and nothing is unreachable.
- **Carousel dots are back, and now earn it.** They were dropped in v3 as
  decoration encoding nothing. There is a real three-slide carousel now, so
  they report position. They are plain `<span>`s, not buttons: the whole art
  panel is `aria-hidden`, and a focusable control inside `aria-hidden` is a
  keyboard trap.

---

## 6. Icons

**Set:** [`@phosphor-icons/react`](https://phosphoricons.com) — one family, consistent
`weight="bold"` (or `fill` for emphasis), sizes **14–20px** in UI, ~40px in feature spots.
Never emoji as a structural icon (emoji only appear inside notification *titles* as content).

In use: `PulseIcon` `MagnifyingGlass` `Plus` `X` `ArrowsClockwise` `FunnelSimple`
`ArrowClockwise` `Pause` `Play` `CaretRight` `ArrowLeft` `ArrowRight` `Pencil` `Trash`
`Copy` `Check` `CheckCircle` `WarningCircle` `WarningOctagon` `Info` `Bell` `BellRinging`
`BellSlash` `ShieldWarning` `ShieldCheck` `BookOpen` `GithubLogo` `GhostIcon` `Timer`
`Path` `Pulse` `ChartLine` `Warning`.

**Custom asset:** `public/notify-icon.svg` — the ink+yellow bell used as the OS
notification icon/badge.

---

## 7. Animation

Durations **80–400ms**, `ease-out` for enter. All motion is gated by
`prefers-reduced-motion: reduce` (globally neutralized).

| Keyframe | Where | Purpose |
|---|---|---|
| `spin` | refresh / check icons (`.spin`, `.spinning`) | in-progress feedback |
| `pulse-dot` | API-status, live dot | "live" heartbeat |
| `fade` | modal backdrop | soft entry |
| `pop-in` | modal | spatial scale-in from trigger |
| `toast-in` | toasts | slide-up + scale |
| `slide-up` | notification prompt | attention without a hard modal |
| `bell-swing` | prompt bell | rings to signal "turn me on" |
| `ring-out` | prompt bell rings | radiating alert pulse (2 staggered) |
| `shimmer` | skeletons | loading placeholder |
| button `:active` | all `.btn` | `translateY(1px) scale(.99)` press |
| card `:hover` | `.card` | `translateY(-2px)` + deeper shadow |
| `auth-rise` | any auth element with inline `--i` | staggered entrance, 52ms/beat |
| `cta-sweep` | `.auth-cta:hover` | light sweep across the primary button |
| `field-shake` | `.field-error` | 3px nudge when a validation message appears |
| slide crossfade | `.slide` / `.slide.on` | 600ms opacity + 1.04→1 scale, 2s hold, loops forever |
| dot stretch | `.slide-dot.on` | active dot widens 7px→26px |
| `shimmer` | `.slide-skeleton` | holds the plate until the first image decodes |

---

## 8. Notifications (behavior)

- **Permission:** requested via an on-theme animated prompt (`NotificationPrompt`),
  not a raw browser bark. Dismissal is remembered (`localStorage`).
- **Delivery:** `public/sw.js` service worker → `registration.showNotification`,
  so alerts arrive while the browser is open but backgrounded.
- **Triggers** (`components/AlertsWatcher.jsx`, polls every `ALERT_POLL_MS`):
  monitor → DOWN, monitor → recovered, and API unreachable / recovered.
- **Mute toggle:** the navbar bell turns delivery on/off (`--up` dot when armed).
- Notification visuals reuse the palette (ink card, yellow bell, semantic colors).

---

## 9. Accessibility guardrails

- `:focus-visible` ring (`2.5px var(--ink)`) is **never** removed.
- Icon-only controls carry `aria-label` + `title`.
- Status is conveyed by **dot + text**, never color alone.
- Toasts use `aria-live="polite"` and don't steal focus.
- Touch targets ≥ 36px (icon buttons) / ≥ 44px (primary actions on mobile).
- Respects `prefers-reduced-motion` and `prefers-color-scheme` groundwork.

---

_Last updated: 2026-07-30 — v5 (real JWT sessions, account chip, auth splash)._
_Previously: v4 (gated `/`, 3-up carousel, Google-only SSO)._
_Previously: v3 (auth split-shell, duotone art plate) · v2 (compact app-shell,
notifications, Docs page)._
