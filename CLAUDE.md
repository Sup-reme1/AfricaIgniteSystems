# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

**Africa Ignite Systems** is a web portal where individuals and teams work together, using structured systems (OKRs, check-ins, initiatives) to achieve their goals and objectives.

The frontend is static HTML/CSS/JS with no build step. Current pages are slices of the original "AlignWork" designs, rebranded to Africa Ignite Systems. Their content is still hard-coded sample data; the next phase adds a data layer and real features (see Roadmap).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | Tailwind CSS via Play CDN (`cdn.tailwindcss.com`), plus plain CSS in `assets/css/` |
| Scripting | Vanilla JS (no framework, no bundler) |
| Icons | Material Symbols Outlined (Google Fonts) |
| Fonts | Inter (body/UI), Plus Jakarta Sans (headlines/metrics) |
| Dev Server | `dev-server.js`, a zero-dependency Node static server on `http://127.0.0.1:4173` |
| Screenshots | `dev-server.js screenshot`, which drives the installed Edge/Chrome via `puppeteer-core` |

Stay on the Tailwind CDN. Do not add a Tailwind build step, PostCSS, or a bundler unless asked.

---

## Structure

```
index.html            Dashboard                     data-page="dashboard"
objectives.html       Objective Hierarchy           data-page="objectives"
check-ins.html        Weekly Check-ins              data-page="check-ins"
initiatives.html      Initiatives & Milestones      data-page="initiatives"
analytics.html        Team & Analytics (stub)       data-page="analytics"
settings.html         Settings (stub)               data-page="settings"
login.html            Sign in / Create account      public page (<html data-auth="public">), no portal shell
partials/
  sidebar.html        logo, workspace switcher, main nav, OKR progress, mobile backdrop
  header.html         menu button (mobile), search, cycle badge, notifications, CTA, profile
  footer.html         copyright, footer links, version
assets/
  css/base.css        global resets
  css/layout.css      app shell: sidebar/header/content/footer positioning + responsive behaviour
  css/pages/*.css     page-specific CSS Tailwind can't express (linked in that page's <head>)
  js/tailwind-theme.js  Tailwind theme tokens (colors, spacing, type scale), shared by all pages
  js/config.js        AIS.config: API base URL and request timings (loaded in <head>)
  js/auth.js          AIS.auth: sign up / sign in / sign out, session storage, page guard (loaded in <head>)
  js/layout.js        injects partials, marks active nav link, exposes AIS.layoutReady / AIS.setActiveNav
  js/app.js           shared behaviour + helpers (mobile sidebar, footer year, AIS.escape, AIS.toast,
                      opens the New Objective form for any [data-add-objective])
  js/data.js          AIS.data.load/save/reset/isModified: data/<name>.json + edits saved in localStorage
  js/okrs.js          AIS.okrs: shared OKR model (tree helpers, progress roll-up, add/update/remove, validation)
  js/drawer.js        AIS.drawer: right-hand slide-over modal (focus trap, Esc, backdrop, beforeClose)
  js/objective-form.js  AIS.objectiveForm: "New objective" form in the slide-over
  js/router.js        client-side navigation (swaps <main> only) + page lifecycle (AIS.definePage)
  js/pages/*.js       one script per page, named after its data-page
  img/                logo.svg, avatar.jpg
data/
  okrs.json           the one OKR dataset: flat node list linked by parentId (dashboard + hierarchy)
```

### Page skeleton

Every page has the same shell; only `<title>`, `data-page`, the `<main>` content and the page script differ:

```html
<body data-page="dashboard" class="bg-surface font-body-md text-on-surface antialiased">
  <div data-include="sidebar"></div>
  <div class="app-content">
    <div data-include="header"></div>
    <main class="w-full pt-16 bg-surface"> ...page content... </main>
    <div data-include="footer"></div>
  </div>
  <script src="assets/js/layout.js"></script>
  <script src="assets/js/app.js"></script>
  <script src="assets/js/data.js"></script>
  <script src="assets/js/okrs.js"></script>
  <script src="assets/js/drawer.js"></script>
  <script src="assets/js/objective-form.js"></script>
  <script src="assets/js/router.js"></script>
  <script src="assets/js/pages/dashboard.js"></script>
</body>
```

The `<head>` loads `assets/js/config.js` and `assets/js/auth.js` first (the sign-in guard), then fonts, the Tailwind CDN, `assets/js/tailwind-theme.js`, and `base.css` and `layout.css`. Copy it from an existing page. Keep the shared script order: page scripts come last.

### Authentication (`login.html` + `assets/js/auth.js` + `assets/js/pages/login.js`)

- **API:** `AIS.config.apiBase` (`https://brevomailapi.onrender.com/api`), an Express + Supabase backend.
  - `POST /auth/signup` and `POST /auth/login` take `{ email, password }` and return Supabase's `{ user, session }`. Signup answers `201`, login `200`.
  - CORS allows any origin.
  - It's hosted on Render and can be asleep: the first request may take up to a minute, and the sign-in page shows a "waking up" message after 5 seconds.
- **Session:** `{ access_token, refresh_token, expires_at, user: { id, email } }`, stored under `ais:auth:session`.
  - With "Keep me signed in" it goes in `localStorage`, otherwise in `sessionStorage`.
  - Expired sessions count as signed out. There's no refresh or logout endpoint yet.
- **Guard:** `auth.js` redirects any page not marked `<html data-auth="public">` to `login.html?next=<page>` before it renders. It checks again on each `page:change`. `AIS.auth.safeNext()` only allows portal pages as `next`.
- **Sign-up with email confirmation on:** Supabase returns no session, and the page shows "Check your inbox". An existing email comes back as a user with empty `identities`, which is treated as "already registered".
- **Error messages:** `friendlyMessage()` in `auth.js` turns API and network errors into plain language. The server's text is read from `error`, `message` or `msg`.
- **Header:** `app.js` shows the user's name (from the email), email and initials, plus a Sign out menu.
- **Limits:** this guards the screens only. Data access must be enforced by the API (check the `access_token`) once data moves to Supabase.
- **Local demo session:** on `localhost` / `127.0.0.1`, any page opened with `?demo=1` gets a temporary demo session (`demo@localhost`, 12 hours, `sessionStorage`). It's ignored on other hosts.

### Page navigation and page scripts

`router.js` intercepts clicks on links to other portal pages (`*.html`), fetches the target, and swaps in only its `<main>`, title and `data-page`, using a short View Transition where supported. The sidebar, header and footer stay mounted, so they don't flash or re-render. It also prefetches on hover, handles back/forward with scroll restore, closes the mobile drawer, and fires a `page:change` event. If anything fails it falls back to a normal page load. Add `data-no-router` to a link to force a full load.

Because a page can be entered without a full load, **page scripts must not run at top level**. Register an init instead:

```js
AIS.definePage("dashboard", async (main) => {
  // set up listeners / render inside `main`; may be async
  return () => { /* optional cleanup: remove document/window listeners, timers */ };
});
```

The init runs on a full page load and on every client-side visit. Page scripts are loaded once per session, so keep their top level to constants and function definitions. Attach listeners to elements inside `main` (they're discarded with it). Anything attached to `document` or `window` needs a cleanup.

### Data

Pages get data through `AIS.data.load("<name>")`, which reads `data/<name>.json`, caches it for the session, and is the single place to switch to a real API later. Build HTML from data with template strings, and pass every data value through `AIS.escape()`. Render loading, empty and error states.

Edits persist in this browser only:
- `AIS.data.save(name, value)` writes the whole dataset to localStorage under `ais:data:<name>`. A saved copy takes precedence over the JSON file.
- `AIS.data.reset(name)` drops it, so the next load reads the file again.
- `AIS.data.isModified(name)` tells whether there's a saved copy.

When you change a JSON file's shape, bump its `version` and reset older saved copies, as `okrs.js` does with `SCHEMA_VERSION`. Otherwise browsers holding the old shape keep using it.

### OKR data (`data/okrs.json` + `assets/js/okrs.js`)

- **Levels** (from depth, see `AIS.okrs.TYPES`):

  | Level | Type | Fields | Progress |
  |---|---|---|---|
  | 1 | Objective / Goal (`parentId: null`) | code `OBJ-01`, title, description, department, owner, team, status, `targetDate`, `expectedPacing`, `confidenceTrend`, dependencies | average of its milestones |
  | 2 | Milestone | code `M1.2`, title, description, owner, `dueDate`, status, dependencies | share of its smallest steps done; with no steps, 100% only if status is Complete |
  | 3 | Checklist item | title, notes, assignee, optional `dueDate`, `done` | 0/100 when ticked, or share of sub-steps done |
  | 4+ | Sub-step (no depth limit) | same as a checklist item | same |

- **Progress is never stored:** use `progressOf`, `stepCounts` and `isDone`. Only items with no sub-steps can be ticked (`toggleDone`). A parent item is done when all of its sub-steps are. `statusOf` shows a milestone as Complete once every step is done.
- **Dates:** stored as `YYYY-MM-DD`. Use `AIS.okrs.formatDate` and `AIS.okrs.dueLabel` ("Due in 4 days", "Overdue 2 days").
- **One source of truth:** the dashboard and the Objective Hierarchy both read and edit it through `await AIS.okrs.load()`. Don't fetch `okrs.json` directly, and don't copy its tree logic into page scripts.
- **Shared object:** every load returns a model over the same cached object, so a change made on one page is visible on the others without reloading.
- **Event:** code that changes the data from outside the current page (the New Objective form) dispatches `okrs:change` on `document` with `{ action, id }`. Pages listen for it and re-render, and remove the listener in their cleanup.
- **Slide-over and messages:** `AIS.drawer` is the shared slide-over; build new right-hand forms on it. `AIS.toast(message, { actionLabel, href, tone })` shows a confirmation message.

### Dashboard (`index.html` + `assets/js/pages/dashboard.js`)

Everything on the dashboard comes from `AIS.okrs`. The stat cards and the Blockers & Milestones panel follow the department tab (`"all"` or a department name).

- **Stat cards** (`okrs.summary(department)`):
  - **Overall progress:** average of the objectives, against average expected pacing.
  - **Objectives:** count by status.
  - **Milestones:** done of total, how many are due within 7 days, how many are overdue.
  - **Checklist steps:** done of total, how many are overdue.
- **Blockers** (`okrs.blockers(department)`): blocking dependencies on objectives and milestones come first, then overdue milestones and overdue unfinished steps, latest first. The panel shows up to 6.
  - **Mark resolved:** `okrs.resolveDependency` clears `blocking` and logs it.
  - **Mark done:** `okrs.toggleDone`, for steps that have no sub-steps.
  - Both save, re-render and show a toast.
- **Upcoming milestones** (`okrs.upcomingMilestones(department, 4)`): open milestones due today or later, soonest first. Overdue ones appear under Blockers instead.
- **Links:** objective cards, milestone rows, blockers and upcoming milestones all link to `objectives.html?focus=<id>`.
- **Layout:** the panel stays in view while you scroll on `lg` and up, and sits above the objectives list on narrow screens.

### Objective Hierarchy (`objectives.html` + `assets/js/pages/objectives.js`)

- **Panel:** closed on load; it opens when an item is clicked. `objectives.html?focus=<id>` selects an item on arrival (the dashboard's "Set up hierarchy" link, and each milestone row on the dashboard).
- **Tree (follows the selected path):**
  - a row of objectives (plus an "Add objective" tile that opens the New Objective form);
  - a row with the selected objective's milestones;
  - then vertical **checklist columns**: the selected milestone's checklist, then the sub-steps of the selected item, and so on to the right.
  - Connector lines are an SVG drawn from measured tile positions: a bus line above the milestone row, and a spine down the left of each column. A `ResizeObserver` redraws them. "Collapse All" clears the selection, so only the objectives row shows.
- **Checkboxes:** items are ticked on the tile or in the panel without entering edit mode. Each tick is saved and logged ("Marked done").
- **Panel content depends on the level:**
  - objective: milestones list;
  - milestone: checklist with checkboxes;
  - item: Done toggle and sub-steps.

  The edit form shows only that level's fields (see the table above).
- **Panel modes:** view, edit, audit and confirm-delete.
  - `+` (on tiles, column footers, or `+ Add` in the panel) creates an unsaved draft (`isDraft`) and opens the form. Discarding removes it.
  - Unsaved edits are guarded by an inline "Discard changes / Keep editing" prompt. Don't use `confirm()`/`alert()`: they block the screenshot tool.
- **History:** every save and delete appends to the node's `history`, and the Audit Log shows it. Entries with `note` are structural changes (a child added or deleted).
- **Layout:** the work area is fixed to the viewport height, so the tree and inspector scroll independently. The inspector is a side column from 1280px and a slide-over drawer below (`assets/css/pages/objectives.css`).

### Adding a page

1. Copy an existing page and set `<title>` and `data-page`.
2. Add a nav link in `partials/sidebar.html` with a matching `data-page`.
3. Put page-specific JS in `assets/js/pages/<data-page>.js`, registered with `AIS.definePage`. Don't use inline `<script>` or `onclick=`.

---

## Conventions

- **Shared layout lives only in `partials/`.** Never paste sidebar/header/footer markup into a page.
- **Active nav state is automatic.** `layout.js` matches `<body data-page>` to the nav link's `data-page` and applies the nav's `data-active-classes`. Don't hard-code `aria-current` or active classes.
- **Code that touches partial markup must wait for the layout:** `AIS.layoutReady.then(() => { ... })`. Code that only touches `<main>` can run immediately.
- **Use theme tokens, not raw values:** `bg-primary-container`, `text-on-surface-variant`, `p-space-lg`, `font-title-sm text-title-sm`, etc. are defined in `tailwind-theme.js`. Add new tokens there, not inline.
- Classes added from JS must be full literal class names (the Tailwind CDN only generates classes it sees in the DOM).
- **Paths are relative to the project root** (`assets/...`, `partials/...`, `objectives.html`). All pages live at the root, so relative paths work.
- Layout breakpoint: below `lg` (1024px) the sidebar is off-canvas, opened by the header menu button. From `lg` up it's fixed open.
- Brand name is **Africa Ignite Systems**. Don't reintroduce "AlignWork".

---

## Running the project

`fetch()` loads the partials, so pages **must be served over http**. Opening the files from disk (`file://`) leaves the layout empty.

```bash
npm install          # once, installs puppeteer-core for screenshots
npm run dev          # http://127.0.0.1:4173  (PORT env var overrides)
```

The dev server sends `Cache-Control: no-store`, so no cache-busting query strings are needed.

### Taking a screenshot

Use the project screenshot tool. Do NOT start another server (`npx serve`, Live Server, `python -m http.server`) or drive a browser by hand:

```bash
node dev-server.js screenshot <page.html> [out.png] [--width=1440] [--height=900] [--viewport] [--click=<selector>]
```

- Default output: `screenshots/<page>-<width>.png` (git-ignored), full page at **1440px wide** (the design target).
- `--viewport` captures only the window (use for mobile, e.g. `--width=390 --height=844 --viewport`).
- `--click=<selector>` clicks before capturing (repeatable) to show interactive states.
- It starts its own server on a free port, so `npm run dev` doesn't need to be running.
- It exits non-zero and lists problems if the page has JS errors, failed requests, or HTTP 4xx/5xx responses.
- **Portal pages need `?demo=1`.** The screenshot browser is never signed in, so without it every portal page redirects to the sign-in page. Use a quoted page argument, e.g. `"index.html?demo=1"` or `"objectives.html?demo=1&focus=obj-02"`.
- The tool can't type. Forms that need input (sign in, create account, New Objective) can only be checked for their empty-form errors and screen states. Real sign-in and sign-up need a manual test. Don't create accounts against the real API without asking.

Examples:

```bash
node dev-server.js screenshot "index.html?demo=1"
node dev-server.js screenshot "check-ins.html?demo=1" screenshots/menu-390.png --width=390 --height=844 --viewport --click=[data-sidebar-open]
node dev-server.js screenshot login.html
```

---

## Rules

- Do NOT modify `dev-server.js` unless explicitly instructed.
- Do NOT consider a UI task done until you've taken screenshots of the affected pages (1440px, plus 390px for layout changes), looked at them, and seen no reported problems.
- Do NOT use any server, browser or tool other than `node dev-server.js screenshot` for screenshots.
- Keep JS and CSS out of the HTML. Use `assets/js/pages/*.js` and `assets/css/`.

---

## Known issues (inherited from the original designs)

- Objective Hierarchy: the Indented List and Matrix views, the Team and Status filters, and Export SVG aren't built yet (the views are disabled as "coming soon").
- Pages are not yet tuned for narrow screens beyond the shell (some content grids are desktop-first).
- Header actions other than New Objective (search, notifications, workspace switcher) are visual only.
- The sidebar's "Quarter OKR Target / KRs Met" box is still hard-coded. It could use `okrs.summary()`.
- Some content images (team avatars) still load from remote Google URLs.
- Weekly Check-ins and the header search placeholder still talk about "key results". The OKR model is now Objective → Milestone → Checklist.

## Roadmap

1. Mock data layer: `data.js`, the shared OKR dataset, the dashboard (objectives, stat cards, Blockers & Milestones) and the objective hierarchy are done. Next: check-ins and initiatives from data, and the sidebar progress box.
2. Persistence: localStorage saving exists (`AIS.data.save`), and the hierarchy uses it. Next: dashboard edits and check-in submissions.
3. Shared UI components: modal, toast, dropdown, tabs (New Objective, notifications, workspace switcher).
4. Auth: sign-up and sign-in against the Supabase auth API are done. Next: move the OKR data from localStorage to Supabase (per user), add refresh and logout endpoints, then roles (individual, team lead, admin).
