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
partials/
  sidebar.html        logo, workspace switcher, main nav, OKR progress, mobile backdrop
  header.html         menu button (mobile), search, cycle badge, notifications, CTA, profile
  footer.html         copyright, footer links, version
assets/
  css/base.css        global resets
  css/layout.css      app shell: sidebar/header/content/footer positioning + responsive behaviour
  css/pages/*.css     page-specific CSS Tailwind can't express (linked in that page's <head>)
  js/tailwind-theme.js  Tailwind theme tokens (colors, spacing, type scale), shared by all pages
  js/layout.js        injects partials, marks active nav link, exposes AIS.layoutReady / AIS.setActiveNav
  js/app.js           shared behaviour + helpers (mobile sidebar, footer year, AIS.escape)
  js/data.js          AIS.data.load/save/reset/isModified: data/<name>.json + edits saved in localStorage
  js/router.js        client-side navigation (swaps <main> only) + page lifecycle (AIS.definePage)
  js/pages/*.js       one script per page, named after its data-page
  img/                logo.svg, avatar.jpg
data/
  objectives.json     objectives + key results (rendered by the dashboard)
  hierarchy.json      alignment tree for objectives.html (flat node list linked by parentId)
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
  <script src="assets/js/router.js"></script>
  <script src="assets/js/pages/dashboard.js"></script>
</body>
```

The `<head>` loads fonts, then the Tailwind CDN, then `assets/js/tailwind-theme.js`, then `base.css` and `layout.css`. Copy it from an existing page. Keep the shared script order: page scripts come last.

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

When you change a JSON file's shape, bump its `version` and have the page reset older saved copies, as `objectives.js` does with `SCHEMA_VERSION`. Otherwise browsers holding the old shape keep using it.

### Objective Hierarchy (`objectives.html` + `assets/js/pages/objectives.js`)

- **Data:** `data/hierarchy.json` is a flat list of nodes linked by `parentId`. The tile type comes from depth: North Star → Pillar Objective → Key Result → Initiative. Initiatives can't have children.
- **Progress:** a tile with children shows the average of its children, each capped at 100%. Only leaf tiles store `progress`.
- **Tree:** the North Star, its pillars, then the children of the selected tile on each level. Connector lines are an SVG drawn from measured tile positions. A `ResizeObserver` redraws them.
- **Inspector:** has view, edit, audit and confirm-delete modes.
  - `+` (or `+ Add`) creates an unsaved draft tile (`isDraft`) and opens the form. Discarding removes it.
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

Examples:

```bash
node dev-server.js screenshot index.html
node dev-server.js screenshot check-ins.html screenshots/menu-390.png --width=390 --height=844 --viewport --click=[data-sidebar-open]
```

---

## Rules

- Do NOT modify `dev-server.js` unless explicitly instructed.
- Do NOT consider a UI task done until you've taken screenshots of the affected pages (1440px, plus 390px for layout changes), looked at them, and seen no reported problems.
- Do NOT use any server, browser or tool other than `node dev-server.js screenshot` for screenshots.
- Keep JS and CSS out of the HTML. Use `assets/js/pages/*.js` and `assets/css/`.

---

## Known issues (inherited from the original designs)

- Objective Hierarchy: the Indented List and Matrix views, the Team and Status filters, and Export SVG aren't built yet (the views are disabled as "coming soon"). `data/hierarchy.json` and `data/objectives.json` describe overlapping objectives and should be merged into one dataset.
- Pages are not yet tuned for narrow screens beyond the shell (some content grids are desktop-first).
- Header actions (search, notifications, New Objective, workspace switcher) are visual only.
- Dashboard KPI cards and right-hand panels (blockers, confidence, activity) are still hard-coded; their numbers don't match `data/objectives.json`.
- Some content images (team avatars) still load from remote Google URLs.

## Roadmap

1. Mock data layer: `data.js`, the dashboard's objectives and the objective hierarchy are done. Next: check-ins and initiatives from data, the dashboard KPI cards and side panels, and one shared objectives dataset.
2. Persistence: localStorage saving exists (`AIS.data.save`), and the hierarchy uses it. Next: dashboard edits and check-in submissions.
3. Shared UI components: modal, toast, dropdown, tabs (New Objective, notifications, workspace switcher).
4. Auth and roles (individual, team lead, admin), then a backend API.
