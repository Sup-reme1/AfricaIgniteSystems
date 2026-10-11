// Objective hierarchy: renders the OKR tree (data/okrs.json via AIS.okrs) and a
// right-hand panel to view, edit, add, tick off and delete items. Edits are
// saved in this browser; "Reset data" restores the original file. The
// dashboard reads the same data.
//
// Levels: Objective → Milestone → Checklist item → Sub-step (any depth).
// Layout follows the selected path:
//   - a row of objectives;
//   - a row with the selected objective's milestones;
//   - checklist columns: the selected milestone's checklist, then the sub-steps
//     of the selected item, and so on to the right.
// The panel is closed on load and opens when an item is clicked. Checkboxes
// tick items off without opening it. `?focus=<id>` selects an item on arrival
// (the dashboard's "Set up hierarchy" link).
(function () {
  const esc = AIS.escape;
  const { TYPES, DEPARTMENTS, STATUS_LABELS, formatDate, dueLabel } = AIS.okrs;

  const STATUS = {
    "on-track": { icon: "trending_up", badge: "bg-tertiary-fixed text-on-tertiary-fixed", dot: "bg-tertiary", bar: "bg-tertiary", text: "text-tertiary" },
    "needs-attention": { icon: "schedule", badge: "bg-secondary-container text-on-secondary-container", dot: "bg-secondary", bar: "bg-secondary", text: "text-secondary" },
    "at-risk": { icon: "warning", badge: "bg-error-container text-on-error-container", dot: "bg-error", bar: "bg-error", text: "text-error" },
    complete: { icon: "verified", badge: "bg-tertiary-fixed text-on-tertiary-fixed", dot: "bg-tertiary", bar: "bg-tertiary", text: "text-tertiary" },
  };
  const statusMeta = (status) => ({ label: STATUS_LABELS[status] || STATUS_LABELS["on-track"], ...(STATUS[status] || STATUS["on-track"]) });

  const LINE_COLOR = "#CBD5E1";
  const ACCENT_COLOR = "#4F46E5";

  const INPUT =
    "w-full px-3 py-2 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container/40";
  const LABEL = "block mb-1 font-label-md text-label-md text-on-surface-variant";
  const PRIMARY_BUTTON =
    "flex-1 h-9 bg-primary-container hover:bg-primary text-on-primary font-title-sm text-title-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5";
  const SECONDARY_BUTTON =
    "flex-1 h-9 bg-surface-container-lowest hover:bg-surface-container text-on-surface font-title-sm text-title-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5";
  const ADD_ON_HOVER = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100";

  // ---- Small helpers --------------------------------------------------------

  const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
  const truncate = (text, length) => (String(text).length > length ? `${String(text).slice(0, length - 1)}…` : String(text));

  function initials(name) {
    const words = String(name || "").split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
    return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";
  }

  function avatar(name, size = "w-6 h-6", colors = "bg-secondary-fixed text-on-secondary-fixed") {
    return `<span class="${size} shrink-0 rounded-full ${colors} flex items-center justify-center text-[10px] font-bold" title="${esc(name)}">${esc(initials(name))}</span>`;
  }

  function bar(progress, color, classes) {
    return `<div class="w-full bg-surface-container-highest rounded-full overflow-hidden ${classes}"><div class="h-full ${color} rounded-full" style="width: ${clampPercent(progress)}%"></div></div>`;
  }

  function statusBadge(status, text) {
    const meta = statusMeta(status);
    return `<span class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${meta.badge} font-label-sm text-label-sm font-semibold"><span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>${esc(text)}</span>`;
  }

  function statusLabel(status) {
    const meta = statusMeta(status);
    return `<span class="shrink-0 inline-flex items-center gap-1"><span class="material-symbols-outlined text-sm ${meta.text}">${meta.icon}</span><span class="font-semibold ${meta.text}">${meta.label}</span></span>`;
  }

  const DUE_TONES = { overdue: "text-error font-semibold", soon: "text-primary font-medium", normal: "text-on-surface-variant", done: "text-tertiary" };

  function dueChip(iso, isDone) {
    const due = dueLabel(iso, isDone);
    if (!due) return "";
    return `<span class="inline-flex items-center gap-1 ${DUE_TONES[due.tone]}"><span class="material-symbols-outlined text-sm">${due.tone === "overdue" ? "event_busy" : "event"}</span>${esc(due.text)}</span>`;
  }

  function paceLabel(delta) {
    return delta >= 0
      ? `<span class="text-tertiary font-semibold">+${delta}% ahead</span>`
      : `<span class="text-error font-semibold">${delta}% behind</span>`;
  }

  async function loadOkrs() {
    const okrs = await AIS.okrs.load();
    // An unsaved new item can survive in the session cache; drop it.
    okrs.data.nodes = okrs.data.nodes.filter((node) => !node.isDraft);
    return okrs;
  }

  // ---- Page -----------------------------------------------------------------

  AIS.definePage("objectives", async (main) => {
    const canvas = main.querySelector("#canvas-container");
    const tree = main.querySelector("#tree-root-canvas");
    const inspector = main.querySelector("#inspector-panel");
    const backdrop = main.querySelector(".hierarchy-backdrop");
    const searchInput = main.querySelector("#node-search-input");
    const resetButton = main.querySelector("[data-reset-data]");

    let okrs;
    try {
      okrs = await loadOkrs();
    } catch (error) {
      console.error(error);
      tree.innerHTML = `
        <div class="pt-space-xl text-center space-y-space-sm" role="alert">
          <p class="font-body-md text-body-md text-error">The hierarchy could not be loaded. ${esc(error.message || "")}</p>
          <button type="button" class="h-9 px-space-md rounded-lg bg-primary-container text-on-primary font-title-sm text-title-sm" data-retry>Try again</button>
        </div>`;
      tree.querySelector("[data-retry]").addEventListener("click", () => location.reload());
      return;
    }
    if (!main.isConnected) return; // navigated away while loading

    const state = {
      selectedId: null, // null: only the objectives row is shown
      mode: "view", // view | edit | audit | confirm-delete
      editDraft: null,
      errors: {},
      dirty: false,
      pendingAction: null, // runs after "Discard changes"
      saving: false, // a save or delete is in flight
      formError: "", // server error not tied to a field
      audit: null, // { loading } | { entries } | { error } while the Audit Log is open
      query: "",
      zoom: 100,
      inspectorOpen: false, // opens when an item is clicked
      resetArmed: false,
    };
    let resetTimer = null;

    // ---- Model (shared AIS.okrs; `okrs` is replaced on Reset data) ----------

    const nodeById = (id) => (id ? okrs.byId(id) : null);
    const childrenOf = (id) => okrs.childrenOf(id);
    const savedChildrenOf = (id) => okrs.savedChildrenOf(id);
    const pathTo = (id) => (id ? okrs.pathTo(id) : []);
    const depthOf = (node) => okrs.depthOf(node);
    const typeOf = (node) => okrs.typeOf(node);
    const progressOf = (node) => okrs.progressOf(node);
    const firstObjectiveId = () => (okrs.objectives()[0] || {}).id || null;
    const labelOf = (node) => node.code || truncate(node.title, 26);

    function matchesQuery(node) {
      if (!state.query) return true;
      return [node.code, node.title, node.team, node.owner, node.assignee, node.department]
        .join(" ")
        .toLowerCase()
        .includes(state.query);
    }

    // Arriving with ?focus=<id> selects that item; otherwise the first objective.
    const focusId = new URLSearchParams(location.search).get("focus");
    state.selectedId = focusId && nodeById(focusId) ? focusId : firstObjectiveId();

    // ---- Tree ---------------------------------------------------------------

    function render() {
      renderTree();
      renderInspector();
      updateToolbar();
    }

    function frameClasses(node, pathIds) {
      if (node.id === state.selectedId) return "ring-2 ring-primary-container shadow-lg shadow-primary-container/10";
      if (pathIds.has(node.id)) return "ring-1 ring-primary-container/40 shadow-sm";
      return "shadow-sm hover:shadow-md";
    }

    function tileAttrs(node) {
      return `role="button" tabindex="0" aria-pressed="${node.id === state.selectedId}" aria-label="${esc(typeOf(node).label)}: ${esc(node.title)}" data-node-id="${esc(node.id)}"`;
    }

    function renderTree() {
      const path = pathTo(state.selectedId);
      const pathIds = new Set(path.map((node) => node.id));
      const objective = path[0];

      let rows = `
        <div class="relative flex flex-col items-center gap-2" data-row>
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold uppercase tracking-wider shadow-sm">
            <span class="w-2 h-2 rounded-full bg-primary"></span>Level 1 • Objectives
          </div>
          <div class="flex items-stretch justify-center gap-6">
            ${okrs.objectives().concat(childrenOf(null).filter((node) => node.isDraft)).map((node) => objectiveTileHtml(node, pathIds)).join("")}
            <button type="button" class="w-[240px] min-h-[150px] rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant hover:border-primary-container hover:text-primary hover:bg-surface-container-lowest transition-colors flex flex-col items-center justify-center gap-1 font-title-sm text-title-sm" data-add-objective>
              <span class="material-symbols-outlined">add_circle</span>Add objective
            </button>
          </div>
        </div>`;

      if (objective) {
        const milestones = childrenOf(objective.id);
        rows += `
          <div class="relative flex items-stretch justify-center gap-6" data-row data-parent-id="${esc(objective.id)}">
            ${milestones.map((node) => milestoneTileHtml(node, pathIds)).join("")}
            ${
              milestones.length || objective.isDraft
                ? ""
                : `<button type="button" class="w-[280px] min-h-[140px] rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant hover:border-primary-container hover:text-primary hover:bg-surface-container-lowest transition-colors flex flex-col items-center justify-center gap-1 font-title-sm text-title-sm" data-add-child="${esc(objective.id)}" data-ghost>
                    <span class="material-symbols-outlined">add_circle</span>Add milestone
                  </button>`
            }
          </div>`;
      }

      // Checklist columns: one per milestone / item on the selected path.
      const columns = path
        .filter((node) => depthOf(node) >= 1 && !node.isDraft && (childrenOf(node.id).length || depthOf(node) === 1))
        .map((node) => columnHtml(node, pathIds))
        .join("");
      if (columns) rows += `<div class="relative flex items-start justify-center gap-16" data-columns>${columns}</div>`;

      tree.innerHTML = `
        <svg class="absolute left-0 top-0 pointer-events-none overflow-visible" data-connectors aria-hidden="true"></svg>
        <div class="relative z-10 flex flex-col items-center gap-16 px-2" data-rows>${rows}</div>`;
      drawConnectors();
    }

    function objectiveTileHtml(node, pathIds) {
      const isSelected = node.id === state.selectedId;
      const progress = progressOf(node);
      const milestones = savedChildrenOf(node.id);
      return `
        <div class="group relative w-[320px] shrink-0 bg-surface-container-lowest rounded-xl p-space-md ${frameClasses(node, pathIds)} ${node.isDraft ? "outline-dashed outline-2 outline-primary-container" : ""} ${matchesQuery(node) ? "" : "opacity-35"} transition-all cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" ${tileAttrs(node)}>
          <div>
            <div class="flex items-center justify-between gap-1 mb-space-xs">
              <span class="inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold uppercase truncate ${isSelected ? "text-primary" : "text-on-surface-variant"}">
                ${isSelected ? '<span class="material-symbols-outlined text-sm">flag</span>' : ""}${esc(node.code)}${node.department ? ` • ${esc(node.department)}` : ""}
              </span>
              ${statusBadge(okrs.statusOf(node), `${progress}%`)}
            </div>
            <h3 class="font-title-md text-title-md leading-snug mb-space-xs transition-colors ${isSelected ? "text-primary font-bold" : "text-on-surface group-hover:text-primary"}">${esc(node.title)}</h3>
            ${node.targetDate ? `<div class="mb-space-sm font-label-sm text-label-sm text-on-surface-variant inline-flex items-center gap-1"><span class="material-symbols-outlined text-sm">flag</span>Target ${esc(formatDate(node.targetDate))}</div>` : ""}
            ${bar(progress, statusMeta(okrs.statusOf(node)).bar, "h-1.5 mb-space-sm")}
          </div>
          <div class="flex items-center justify-between gap-2 pt-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <div class="flex items-center gap-1.5 min-w-0">${avatar(node.owner)}<span class="truncate">${esc(node.owner || "Unassigned")}</span></div>
            <span class="shrink-0 px-2 py-0.5 rounded ${isSelected ? "bg-primary-fixed text-on-primary-fixed font-semibold" : "bg-surface-container text-on-surface font-medium"}">${milestones.length} ${milestones.length === 1 ? "Milestone" : "Milestones"}</span>
          </div>
          ${node.isDraft ? "" : bottomAddButton(node, isSelected)}
        </div>`;
    }

    function milestoneTileHtml(node, pathIds) {
      const isSelected = node.id === state.selectedId;
      const progress = progressOf(node);
      const status = okrs.statusOf(node);
      const { done, total } = okrs.stepCounts(node);
      return `
        <div class="group relative w-[280px] shrink-0 bg-surface-container-lowest rounded-xl p-space-md ${frameClasses(node, pathIds)} ${node.isDraft ? "outline-dashed outline-2 outline-primary-container" : ""} ${matchesQuery(node) ? "" : "opacity-35"} transition-all cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" ${tileAttrs(node)}>
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="font-label-sm text-label-sm font-semibold ${status === "at-risk" ? "text-error" : "text-primary"}">${esc(node.code)}</span>
              ${statusBadge(status, `${progress}%`)}
            </div>
            <h4 class="font-title-sm text-title-sm text-on-surface font-semibold mb-2 leading-snug line-clamp-2">${esc(node.title)}</h4>
            <div class="mb-space-sm font-label-sm text-label-sm">${dueChip(node.dueDate, status === "complete") || '<span class="text-outline">No due date</span>'}</div>
            ${bar(progress, statusMeta(status).bar, "h-1.5 mb-space-sm")}
          </div>
          <div class="flex items-center justify-between gap-2 pt-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <span class="inline-flex items-center gap-1 font-medium text-on-surface"><span class="material-symbols-outlined text-sm">checklist</span>${total ? `${done} / ${total} steps` : "No checklist yet"}</span>
            <span class="flex items-center gap-1 min-w-0">${avatar(node.owner, "w-5 h-5")}<span class="truncate max-w-[6rem]">${esc(node.owner || "Unassigned")}</span></span>
          </div>
          ${node.isDraft ? "" : bottomAddButton(node, isSelected)}
        </div>`;
    }

    function bottomAddButton(node, isSelected) {
      const label = `Add ${typeOf(node).child.toLowerCase()}`;
      return `
        <button type="button"
          class="absolute -bottom-3.5 left-1/2 -translate-x-1/2 z-20 w-7 h-7 rounded-full bg-primary-container hover:bg-primary text-on-primary shadow-md flex items-center justify-center transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary ${isSelected ? "opacity-100" : ADD_ON_HOVER}"
          data-add-child="${esc(node.id)}" aria-label="${label} to ${esc(node.title)}" title="${label}"
        ><span class="material-symbols-outlined text-lg">add</span></button>`;
    }

    // Checkbox for a checklist item. Items with sub-steps fill in on their own.
    function checkboxHtml(node, size = "w-5 h-5") {
      const hasKids = savedChildrenOf(node.id).length > 0;
      const { done, total } = okrs.stepCounts(node);
      const checked = total > 0 && done === total ? "true" : hasKids && done > 0 ? "mixed" : "false";
      const look =
        checked === "true"
          ? "bg-tertiary border-tertiary text-on-tertiary"
          : checked === "mixed"
            ? "bg-tertiary-fixed border-tertiary text-on-tertiary-fixed"
            : "bg-surface-container-lowest border-outline text-transparent hover:border-primary";
      const interactive = !hasKids && !node.isDraft;
      return `
        <button type="button" role="checkbox" aria-checked="${checked}"
          ${interactive ? `data-toggle-done="${esc(node.id)}"` : `aria-disabled="true" title="Done when all sub-steps are done"`}
          aria-label="${esc(node.title)}"
          class="shrink-0 ${size} rounded-md border-2 ${look} flex items-center justify-center transition-colors ${interactive ? "" : "cursor-default"} focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary"
        ><span class="material-symbols-outlined text-base leading-none">${checked === "mixed" ? "remove" : "check"}</span></button>`;
    }

    function stepTileHtml(node, pathIds) {
      const isSelected = node.id === state.selectedId;
      const kids = savedChildrenOf(node.id);
      const isDone = okrs.isDone(node);
      const { done, total } = okrs.stepCounts(node);
      return `
        <div class="group relative w-[300px] bg-surface-container-lowest rounded-lg px-3 py-2.5 flex items-start gap-2.5 ${frameClasses(node, pathIds)} ${node.isDraft ? "outline-dashed outline-2 outline-primary-container" : ""} ${matchesQuery(node) ? "" : "opacity-35"} transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" ${tileAttrs(node)}>
          ${checkboxHtml(node)}
          <div class="min-w-0 flex-1 pr-6">
            <div class="font-title-sm text-title-sm leading-snug ${isDone ? "line-through text-on-surface-variant" : "text-on-surface"}">${esc(node.title)}</div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-label-sm text-label-sm text-on-surface-variant">
              ${node.assignee ? `<span class="inline-flex items-center gap-1 min-w-0">${avatar(node.assignee, "w-5 h-5")}<span class="truncate max-w-[7rem]">${esc(node.assignee)}</span></span>` : ""}
              ${dueChip(node.dueDate, isDone)}
              ${kids.length ? `<span class="inline-flex items-center gap-0.5 font-semibold ${isDone ? "text-tertiary" : "text-primary"}"><span class="material-symbols-outlined text-sm">subdirectory_arrow_right</span>${done}/${total}</span>` : ""}
            </div>
          </div>
          ${
            node.isDraft
              ? ""
              : `<button type="button" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-md text-primary hover:bg-primary-fixed flex items-center justify-center transition-opacity ${isSelected ? "opacity-100" : ADD_ON_HOVER}"
                  data-add-child="${esc(node.id)}" aria-label="Break “${esc(node.title)}” down further" title="Break down further"><span class="material-symbols-outlined text-base">add</span></button>`
          }
        </div>`;
    }

    function columnHtml(parent, pathIds) {
      const kids = childrenOf(parent.id);
      const { done, total } = okrs.stepCounts(parent);
      const heading = depthOf(parent) === 1 ? `Checklist · ${parent.code}` : `Sub-steps · ${truncate(parent.title, 26)}`;
      return `
        <div class="relative flex flex-col gap-2 w-[300px]" data-column data-parent-id="${esc(parent.id)}">
          <div class="flex items-center justify-between gap-2 px-1 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
            <span class="truncate">${esc(heading)}</span>${total ? `<span class="shrink-0">${done}/${total} done</span>` : ""}
          </div>
          ${kids.map((kid) => stepTileHtml(kid, pathIds)).join("")}
          <button type="button" class="w-full py-2 rounded-lg border-2 border-dashed border-outline-variant text-on-surface-variant hover:border-primary-container hover:text-primary hover:bg-surface-container-lowest transition-colors flex items-center justify-center gap-1 font-label-md text-label-md" data-add-child="${esc(parent.id)}">
            <span class="material-symbols-outlined text-base">add</span>Add ${typeOf(parent).child.toLowerCase()}
          </button>
        </div>`;
    }

    // Connector lines are measured from the rendered items, so they fit any
    // number of items. Offsets ignore the zoom transform, so zoom needs no redraw.
    function boxOf(el) {
      let x = 0;
      let y = 0;
      for (let current = el; current && current !== tree; current = current.offsetParent) {
        x += current.offsetLeft;
        y += current.offsetTop;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    }

    function drawConnectors() {
      const svg = tree.querySelector("[data-connectors]");
      if (!svg) return;
      const width = tree.scrollWidth;
      const height = tree.scrollHeight;
      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      const pathIds = new Set(pathTo(state.selectedId).map((node) => node.id));
      const colorFor = (el) => (pathIds.has(el.dataset.nodeId) ? ACCENT_COLOR : LINE_COLOR);
      const line = (x1, y1, x2, y2, color, extra = "") =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" ${extra}></line>`;
      const dot = (cx, cy, r, color) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"></circle>`;
      const tileOf = (id) => tree.querySelector(`[data-node-id="${CSS.escape(id)}"]`);

      let markup = "";

      // Objective → milestones: a bus line above the row.
      tree.querySelectorAll("[data-row][data-parent-id]").forEach((row) => {
        const parentEl = tileOf(row.dataset.parentId);
        const items = [...row.querySelectorAll(":scope > [data-node-id], :scope > [data-ghost]")];
        if (!parentEl || !items.length) return;
        const parent = boxOf(parentEl);
        const px = parent.x + parent.w / 2;
        const py = parent.y + parent.h;
        const rowTop = boxOf(row).y;
        const midY = (py + rowTop) / 2;
        const xs = items.map((el) => {
          const box = boxOf(el);
          return box.x + box.w / 2;
        });
        markup += line(px, py, px, midY, ACCENT_COLOR);
        markup += line(Math.min(px, ...xs), midY, Math.max(px, ...xs), midY, ACCENT_COLOR, 'stroke-dasharray="3 3" stroke-width="1.5"');
        items.forEach((el, i) => {
          markup += line(xs[i], midY, xs[i], rowTop, colorFor(el)) + dot(xs[i], midY, 3, colorFor(el));
        });
        markup += dot(px, midY, 4, ACCENT_COLOR);
      });

      // Milestone / item → its checklist column: a spine down the column's left side.
      tree.querySelectorAll("[data-column]").forEach((column) => {
        const parentEl = tileOf(column.dataset.parentId);
        const items = [...column.querySelectorAll(":scope > [data-node-id], :scope > [data-add-child]")];
        if (!parentEl || !items.length) return;
        const parent = boxOf(parentEl);
        const col = boxOf(column);
        const spineX = col.x - 16;
        const ys = items.map((el) => {
          const box = boxOf(el);
          return box.y + box.h / 2;
        });

        let spineTop;
        if (depthOf(nodeById(column.dataset.parentId)) === 1) {
          // Milestone above: drop down, then across to the spine.
          const px = parent.x + parent.w / 2;
          const elbowY = col.y - 16;
          markup += line(px, parent.y + parent.h, px, elbowY, ACCENT_COLOR) + line(px, elbowY, spineX, elbowY, ACCENT_COLOR);
          spineTop = elbowY;
        } else {
          // Item in the previous column: straight across from its right edge.
          const py = parent.y + parent.h / 2;
          markup += line(parent.x + parent.w, py, spineX, py, ACCENT_COLOR) + dot(parent.x + parent.w, py, 3, ACCENT_COLOR);
          spineTop = Math.min(py, ys[0]);
        }
        markup += line(spineX, spineTop, spineX, ys[ys.length - 1], LINE_COLOR);
        items.forEach((el, i) => {
          const box = boxOf(el);
          markup += line(spineX, ys[i], box.x, ys[i], colorFor(el)) + dot(spineX, ys[i], 2.5, colorFor(el));
        });
      });

      svg.innerHTML = markup;
    }

    // Scrolls the canvas so the selected item is horizontally centred.
    function centerSelected(behavior = "smooth") {
      const tile = state.selectedId && tree.querySelector(`[data-node-id="${CSS.escape(state.selectedId)}"]`);
      if (!tile) return;
      const tileBox = tile.getBoundingClientRect();
      const canvasBox = canvas.getBoundingClientRect();
      canvas.scrollBy({ left: tileBox.left + tileBox.width / 2 - (canvasBox.left + canvasBox.width / 2), behavior });
    }

    // Brings the work area under the header and scrolls the canvas so the
    // selected item sits near its top, with what's below it in view.
    function revealSelected(behavior = "smooth") {
      const tile = state.selectedId && tree.querySelector(`[data-node-id="${CSS.escape(state.selectedId)}"]`);
      if (!tile) return;
      const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) * 16 || 64;
      window.scrollTo({ top: window.scrollY + canvas.parentElement.getBoundingClientRect().top - headerHeight, behavior });
      canvas.scrollBy({ top: tile.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 24, behavior });
      centerSelected(behavior);
    }

    function applySearch() {
      tree.querySelectorAll("[data-node-id]").forEach((tile) => {
        tile.classList.toggle("opacity-35", !matchesQuery(nodeById(tile.dataset.nodeId)));
      });
    }

    // ---- Panel --------------------------------------------------------------

    function renderInspector() {
      const node = nodeById(state.selectedId);
      if (!node) state.inspectorOpen = false;
      inspector.classList.toggle("is-open", state.inspectorOpen);
      backdrop.classList.toggle("is-open", state.inspectorOpen);
      if (!node) {
        inspector.innerHTML = "";
        return;
      }

      const type = typeOf(node);
      const heading =
        state.mode === "edit" ? `${node.isDraft ? "New" : "Edit"} ${type.label.toLowerCase()}` : state.mode === "audit" ? "Audit Log" : type.label;

      inspector.innerHTML = `
        <div class="p-space-lg bg-surface-container-low flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-primary-container"></span>
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">${esc(heading)}</span>
          </div>
          <button type="button" class="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" data-inspector-close aria-label="Close panel">
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        ${state.pendingAction ? unsavedBannerHtml() : ""}
        ${state.formError ? `<p class="m-space-md mb-0 p-space-sm rounded-lg bg-error-container text-on-error-container font-body-sm text-body-sm" role="alert">${esc(state.formError)}</p>` : ""}
        ${state.mode === "edit" ? editHtml(node) : state.mode === "audit" ? auditHtml(node) : viewHtml(node)}`;
    }

    function unsavedBannerHtml() {
      return `
        <div class="m-space-md mb-0 p-space-sm rounded-lg bg-secondary-container text-on-secondary-container font-body-sm text-body-sm" role="alert">
          <p class="font-semibold">You have unsaved changes.</p>
          <div class="mt-2 flex gap-2">
            <button type="button" class="px-3 h-8 rounded-lg bg-error text-on-error font-label-md text-label-md" data-discard>Discard changes</button>
            <button type="button" class="px-3 h-8 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md" data-keep-editing>Keep editing</button>
          </div>
        </div>`;
    }

    function breadcrumbHtml(node) {
      const path = pathTo(node.id);
      return `<nav class="flex flex-wrap items-center gap-1 font-label-sm text-label-sm text-on-surface-variant" aria-label="Hierarchy path">${path
        .map((item, i) =>
          i < path.length - 1
            ? `<button type="button" class="truncate max-w-[9rem] hover:text-primary hover:underline" data-select="${esc(item.id)}">${esc(labelOf(item))}</button><span class="material-symbols-outlined text-sm">chevron_right</span>`
            : `<span class="truncate max-w-[9rem] text-on-surface font-semibold" aria-current="true">${esc(labelOf(item))}</span>`
        )
        .join("")}</nav>`;
    }

    function headerHtml(node, badge) {
      const depth = depthOf(node);
      return `
        ${breadcrumbHtml(node)}
        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="font-label-sm text-label-sm text-primary font-semibold uppercase tracking-wider">Level ${depth + 1} • ${typeOf(node).label}</span>
            ${badge}
          </div>
          <h3 class="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight">${esc(node.title)}</h3>
        </div>`;
    }

    function textBlock(text, empty) {
      return `<p class="font-body-sm text-body-sm leading-relaxed ${text ? "text-on-surface-variant" : "text-outline italic"}">${esc(text || empty)}</p>`;
    }

    function card(label, value, sub, valueClass = "text-on-surface") {
      return `
        <div class="p-space-sm bg-surface-container-low rounded-xl min-w-0">
          <div class="font-label-sm text-label-sm text-on-surface-variant">${label}</div>
          <div class="font-title-md text-title-md font-bold mt-1 ${valueClass}">${value}</div>
          ${sub ? `<div class="font-label-sm text-label-sm text-on-surface-variant mt-0.5">${sub}</div>` : ""}
        </div>`;
    }

    function personBlock(label, name, extra = "") {
      return `
        <div class="min-w-0">
          <div class="font-label-sm text-label-sm text-on-surface-variant">${label}</div>
          <div class="mt-1 flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface font-medium">${avatar(name)}<span class="truncate">${esc(name || "Unassigned")}</span></div>
          ${extra}
        </div>`;
    }

    function dependenciesHtml(node) {
      const dependencies = node.dependencies || [];
      const blocking = dependencies.filter((dependency) => dependency.blocking).length;
      return `
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">Dependencies</span>
            ${blocking ? `<span class="font-label-sm text-label-sm text-error font-medium">${blocking} Blocking</span>` : ""}
          </div>
          ${
            dependencies.length
              ? `<div class="space-y-2">${dependencies
                  .map(
                    (dependency) => `
                    <div class="p-2.5 rounded-lg flex items-start gap-2 ${dependency.blocking ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface"}">
                      <span class="material-symbols-outlined text-base mt-0.5 ${dependency.blocking ? "text-error" : "text-primary"}">${dependency.blocking ? "block" : "link"}</span>
                      <div class="text-xs"><div class="font-semibold">${esc(dependency.title)}</div>${dependency.detail ? `<div class="opacity-90">${esc(dependency.detail)}</div>` : ""}</div>
                    </div>`
                  )
                  .join("")}</div>`
              : `<p class="font-body-sm text-body-sm text-outline italic">No dependencies.</p>`
          }
        </div>`;
    }

    function confidenceHtml(trend) {
      if (!trend || !trend.length) return "";
      const width = 280;
      const points = trend.map((point, i) => ({
        x: trend.length === 1 ? width / 2 : 10 + (i * (width - 20)) / (trend.length - 1),
        y: 72 - Math.max(0, Math.min(1, Number(point.value) || 0)) * 60,
      }));
      const linePath = points.map((point, i) => `${i ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
      const areaPath = `${linePath} L ${points[points.length - 1].x} 80 L ${points[0].x} 80 Z`;
      return `
        <div class="p-space-md bg-surface-container rounded-xl">
          <div class="flex items-center justify-between mb-3">
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">Confidence Trend</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${trend.map((point) => esc(point.label)).join(" → ")}</span>
          </div>
          <svg class="w-full h-20" fill="none" viewBox="0 0 ${width} 80" aria-hidden="true">
            <line stroke="${LINE_COLOR}" stroke-dasharray="2 2" x1="0" x2="${width}" y1="20" y2="20"></line>
            <line stroke="${LINE_COLOR}" stroke-dasharray="2 2" x1="0" x2="${width}" y1="50" y2="50"></line>
            <path d="${areaPath}" fill="${ACCENT_COLOR}" fill-opacity="0.12"></path>
            <path d="${linePath}" stroke="${ACCENT_COLOR}" stroke-width="2.5"></path>
            ${points.map((point, i) => `<circle cx="${point.x}" cy="${point.y}" r="${i === points.length - 1 ? 4.5 : 3.5}" fill="${ACCENT_COLOR}"></circle>`).join("")}
          </svg>
          <div class="flex justify-between gap-2 text-[11px] font-medium text-on-surface-variant mt-2 pt-1 border-t border-surface-container-highest">
            ${trend.map((point, i) => `<span class="${i === trend.length - 1 ? "text-primary font-bold" : ""}">${esc(point.label)}: ${(Number(point.value) || 0).toFixed(2)}</span>`).join("")}
          </div>
        </div>`;
    }

    // A checklist (milestone's items or an item's sub-steps) with working checkboxes.
    function checklistHtml(node) {
      const type = typeOf(node);
      const kids = savedChildrenOf(node.id);
      const { done, total } = okrs.stepCounts(node);
      const items = kids
        .map((kid) => {
          const kidDone = okrs.isDone(kid);
          const counts = okrs.stepCounts(kid);
          const subSteps = savedChildrenOf(kid.id).length;
          return `
            <div class="flex items-start gap-2 p-space-sm bg-surface-container-low rounded-lg hover:bg-surface-container transition-colors">
              ${checkboxHtml(kid)}
              <button type="button" class="min-w-0 flex-1 text-left" data-select="${esc(kid.id)}">
                <div class="font-body-sm text-body-sm font-medium ${kidDone ? "line-through text-on-surface-variant" : "text-on-surface"}">${esc(kid.title)}</div>
                <div class="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-on-surface-variant">
                  ${kid.assignee ? `<span>${esc(kid.assignee)}</span>` : ""}
                  ${dueChip(kid.dueDate, kidDone)}
                  ${subSteps ? `<span class="font-semibold text-primary">${counts.done}/${counts.total} sub-steps</span>` : ""}
                </div>
              </button>
            </div>`;
        })
        .join("");
      return `
        <div>
          <div class="flex items-center justify-between mb-space-sm">
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">${depthOf(node) === 1 ? "Checklist" : "Sub-steps"}${total ? ` (${done}/${total} done)` : ""}</span>
            <button type="button" class="font-label-sm text-label-sm text-primary hover:underline font-semibold" data-add-child="${esc(node.id)}">+ Add</button>
          </div>
          ${kids.length ? `<div class="space-y-space-xs">${items}</div>` : `<p class="font-body-sm text-body-sm text-outline italic">No ${type.children.toLowerCase()} yet.</p>`}
        </div>`;
    }

    function milestonesListHtml(node) {
      const milestones = savedChildrenOf(node.id);
      const items = milestones
        .map((milestone) => {
          const progress = progressOf(milestone);
          const status = okrs.statusOf(milestone);
          const { done, total } = okrs.stepCounts(milestone);
          return `
            <button type="button" class="w-full text-left p-space-sm bg-surface-container-low rounded-lg hover:bg-surface-container transition-colors" data-select="${esc(milestone.id)}">
              <div class="flex justify-between items-center gap-2 text-xs mb-1">
                <span class="font-semibold text-on-surface truncate">${esc(milestone.code)} · ${esc(milestone.title)}</span>
                <span class="shrink-0 font-bold ${statusMeta(status).text}">${progress}%</span>
              </div>
              ${bar(progress, statusMeta(status).bar, "h-1.5 mb-1")}
              <div class="flex justify-between gap-2 text-[11px] text-on-surface-variant">
                <span>${total ? `${done} / ${total} steps` : "No checklist yet"}</span>
                ${dueChip(milestone.dueDate, status === "complete")}
              </div>
            </button>`;
        })
        .join("");
      return `
        <div>
          <div class="flex items-center justify-between mb-space-sm">
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">Milestones (${milestones.length})</span>
            <button type="button" class="font-label-sm text-label-sm text-primary hover:underline font-semibold" data-add-child="${esc(node.id)}">+ Add</button>
          </div>
          ${milestones.length ? `<div class="space-y-space-xs">${items}</div>` : `<p class="font-body-sm text-body-sm text-outline italic">No milestones yet. Add the first dated deliverable for this objective.</p>`}
        </div>`;
    }

    function viewFooterHtml(node) {
      const depth = depthOf(node);
      const type = typeOf(node);
      if (state.mode === "confirm-delete") {
        const count = okrs.descendantsOf(node.id).length;
        return `
          <div class="p-space-md bg-error-container text-on-error-container space-y-2" role="alert">
            <p class="font-body-sm text-body-sm"><strong>Delete “${esc(node.title)}”</strong>${count ? ` and the ${count} item${count === 1 ? "" : "s"} under it` : ""}? You can only get it back with Reset data.</p>
            <div class="flex gap-2">
              <button type="button" class="flex-1 h-9 rounded-lg bg-error text-on-error font-title-sm text-title-sm disabled:opacity-70 disabled:cursor-wait" data-confirm-delete ${state.saving ? "disabled" : ""}>${state.saving ? "Deleting…" : "Delete"}</button>
              <button type="button" class="${SECONDARY_BUTTON}" data-cancel>Cancel</button>
            </div>
          </div>`;
      }
      const addLabel = depth >= 2 ? "Break down further" : `Add ${type.child.toLowerCase()}`;
      return `
        <div class="p-space-md bg-surface-container-low flex flex-col gap-2">
          <div class="flex gap-2">
            <button type="button" class="${PRIMARY_BUTTON}" data-edit><span class="material-symbols-outlined text-base">edit</span><span>Edit</span></button>
            <button type="button" class="${SECONDARY_BUTTON}" data-audit><span class="material-symbols-outlined text-base">history</span><span>Audit Log</span></button>
          </div>
          <button type="button" class="w-full h-8 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md rounded-lg transition-colors flex items-center justify-center gap-1" data-add-child="${esc(node.id)}">
            <span class="material-symbols-outlined text-sm">add</span><span>${addLabel}</span>
          </button>
          <button type="button" class="w-full h-8 text-error hover:bg-error-container font-label-md text-label-md rounded-lg transition-colors flex items-center justify-center gap-1" data-delete>
            <span class="material-symbols-outlined text-sm">delete</span><span>Delete ${type.label.toLowerCase()}</span>
          </button>
        </div>`;
    }

    function viewHtml(node) {
      const depth = depthOf(node);
      const progress = progressOf(node);
      let body;

      if (depth === 0) {
        const pacing = Number(node.expectedPacing) || 0;
        const milestones = savedChildrenOf(node.id).length;
        const status = okrs.statusOf(node);
        body = `
          ${headerHtml(node, `<span class="shrink-0 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold uppercase">${progress}% complete</span>`)}
          ${textBlock(node.description, "No description yet.")}
          <div class="grid grid-cols-2 gap-space-sm">
            ${card("Progress", `${progress}%`, milestones ? `Average of ${milestones} milestone${milestones === 1 ? "" : "s"}` : "No milestones yet", "text-primary")}
            ${card("Pacing", paceLabel(progress - pacing), `vs ${pacing}% expected by now`)}
            ${node.targetDate ? `<div class="col-span-2">${card("Target date", esc(formatDate(node.targetDate)), dueChip(node.targetDate, progress === 100))}</div>` : ""}
          </div>
          <div class="grid grid-cols-2 gap-space-sm">
            ${personBlock("Owner", node.owner)}
            <div class="min-w-0">
              <div class="font-label-sm text-label-sm text-on-surface-variant">Status</div>
              <div class="mt-1 font-body-sm text-body-sm">${statusLabel(status)}</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant truncate mt-0.5">${esc([node.department, node.team].filter(Boolean).join(" · ") || "No team")}</div>
            </div>
          </div>
          ${confidenceHtml(node.confidenceTrend)}
          ${dependenciesHtml(node)}
          ${milestonesListHtml(node)}`;
      } else if (depth === 1) {
        const status = okrs.statusOf(node);
        const { done, total } = okrs.stepCounts(node);
        const due = dueLabel(node.dueDate, status === "complete");
        body = `
          ${headerHtml(node, statusBadge(status, `${progress}%`))}
          ${textBlock(node.description, "No description yet.")}
          <div class="grid grid-cols-2 gap-space-sm">
            ${card("Progress", `${progress}%`, total ? `${done} of ${total} steps done` : "Add a checklist to track progress", "text-primary")}
            ${card("Due", node.dueDate ? esc(formatDate(node.dueDate)) : "—", due ? `<span class="${DUE_TONES[due.tone]}">${esc(due.text)}</span>` : "No due date")}
          </div>
          <div class="grid grid-cols-2 gap-space-sm">
            ${personBlock("Owner", node.owner)}
            <div class="min-w-0">
              <div class="font-label-sm text-label-sm text-on-surface-variant">Status</div>
              <div class="mt-1 font-body-sm text-body-sm">${statusLabel(status)}</div>
            </div>
          </div>
          ${checklistHtml(node)}
          ${dependenciesHtml(node)}`;
      } else {
        const hasKids = savedChildrenOf(node.id).length > 0;
        const isDone = okrs.isDone(node);
        const { done, total } = okrs.stepCounts(node);
        const toggle = hasKids
          ? `<div class="p-space-sm rounded-xl bg-surface-container-low flex items-center gap-3 font-body-sm text-body-sm text-on-surface">
              ${checkboxHtml(node, "w-6 h-6")}
              <span>${isDone ? "Done — all sub-steps are complete." : `Done when all ${total} sub-steps are done (${done}/${total}).`}</span>
            </div>`
          : `<button type="button" class="w-full p-space-sm rounded-xl flex items-center gap-3 font-title-sm text-title-sm transition-colors ${node.done ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-surface-container-low hover:bg-surface-container text-on-surface"}" data-toggle-done="${esc(node.id)}" role="checkbox" aria-checked="${Boolean(node.done)}">
              <span class="w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center ${node.done ? "bg-tertiary border-tertiary text-on-tertiary" : "border-outline text-transparent"}"><span class="material-symbols-outlined text-base">check</span></span>
              <span>${node.done ? "Done · click to mark not done" : "Mark as done"}</span>
            </button>`;
        body = `
          ${headerHtml(node, isDone ? statusBadge("complete", "Done") : hasKids ? statusBadge("on-track", `${progress}%`) : "")}
          ${toggle}
          ${textBlock(node.notes, "No notes yet.")}
          <div class="grid grid-cols-2 gap-space-sm">
            ${personBlock("Assignee", node.assignee)}
            <div class="min-w-0">
              <div class="font-label-sm text-label-sm text-on-surface-variant">Due</div>
              <div class="mt-1 font-body-sm text-body-sm">${dueChip(node.dueDate, isDone) || '<span class="text-outline">No due date</span>'}</div>
            </div>
          </div>
          ${checklistHtml(node)}`;
      }

      return `
        <div class="flex-1 min-h-0 overflow-y-auto p-space-lg space-y-space-lg">${body}</div>
        ${viewFooterHtml(node)}`;
    }

    // Fetches the Audit Log (API activity, or local history in demo) and shows it.
    async function openAudit(node) {
      state.mode = "audit";
      state.audit = { loading: true };
      renderInspector();
      try {
        const entries = await okrs.historyOf(node);
        if (state.mode === "audit" && state.selectedId === node.id) state.audit = { entries };
      } catch (error) {
        if (state.mode === "audit" && state.selectedId === node.id) state.audit = { error: error.message };
      }
      if (state.mode === "audit" && state.selectedId === node.id) renderInspector();
    }

    function auditHtml(node) {
      const audit = state.audit || { loading: true };
      const entries = [...(audit.entries || [])].reverse(); // newest first
      const list = entries
        .map((entry) => {
          const when = new Date(entry.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
          const changes = (entry.changes || [])
            .map(
              (change) =>
                `<li class="font-body-sm text-body-sm text-on-surface-variant"><span class="text-on-surface font-medium">${esc(change.field)}:</span> <span class="line-clamp-2">${
                  change.note ? esc(change.note) : `${esc(change.from)} → ${esc(change.to)}`
                }</span></li>`
            )
            .join("");
          return `
            <li class="p-space-sm bg-surface-container-low rounded-lg">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-title-sm text-title-sm text-on-surface">${entry.action === "created" ? "Created" : "Updated"}</span>
                <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(when)}</span>
              </div>
              ${entry.actor ? `<div class="mb-1 font-label-sm text-label-sm text-on-surface-variant">by ${esc(entry.actor)}</div>` : ""}
              ${changes ? `<ul class="space-y-1">${changes}</ul>` : ""}
            </li>`;
        })
        .join("");
      return `
        <div class="flex-1 min-h-0 overflow-y-auto p-space-lg space-y-space-md">
          <div>
            <div class="font-label-sm text-label-sm text-primary font-semibold uppercase tracking-wider">${esc(typeOf(node).label)}${node.code ? ` · ${esc(node.code)}` : ""}</div>
            <h3 class="font-title-md text-title-md text-on-surface font-bold">${esc(node.title)}</h3>
          </div>
          ${
            audit.loading
              ? `<p class="font-body-sm text-body-sm text-on-surface-variant">Loading history…</p>`
              : audit.error
                ? `<p class="p-space-sm rounded-lg bg-error-container text-on-error-container font-body-sm text-body-sm" role="alert">The history could not be loaded. ${esc(audit.error)}</p>`
                : entries.length
                  ? `<ol class="space-y-space-sm">${list}</ol>`
                  : `<p class="font-body-sm text-body-sm text-outline italic">No changes recorded yet. Edits and ticks made here will appear in this log.</p>`
          }
        </div>
        <div class="p-space-md bg-surface-container-low">
          <button type="button" class="${SECONDARY_BUTTON} w-full" data-back><span class="material-symbols-outlined text-base">arrow_back</span><span>Back to details</span></button>
        </div>`;
    }

    // ---- Edit form ----------------------------------------------------------

    const fieldId = (name) => `edit-${name.replace(/\./g, "-")}`;

    function field(name, label, control) {
      const error = state.errors[name];
      return `
        <div>
          <label class="${LABEL}" for="${fieldId(name)}">${label}</label>
          ${control}
          ${error ? `<p class="mt-1 font-label-sm text-label-sm text-error" id="${fieldId(name)}-error">${esc(error)}</p>` : ""}
        </div>`;
    }

    function controlAttrs(name) {
      const invalid = state.errors[name] ? ` aria-invalid="true" aria-describedby="${fieldId(name)}-error"` : "";
      return `id="${fieldId(name)}" name="${name}" data-field="${name}"${invalid}`;
    }

    const textInput = (name, maxlength, placeholder = "") =>
      `<input class="${INPUT}" type="text" maxlength="${maxlength}" placeholder="${esc(placeholder)}" ${controlAttrs(name)} value="${esc(state.editDraft[name])}" />`;
    const dateInput = (name) => `<input class="${INPUT}" type="date" ${controlAttrs(name)} value="${esc(state.editDraft[name])}" />`;
    const textArea = (name, maxlength, placeholder = "") =>
      `<textarea class="${INPUT}" rows="3" maxlength="${maxlength}" placeholder="${esc(placeholder)}" ${controlAttrs(name)}>${esc(state.editDraft[name])}</textarea>`;

    function statusSelect() {
      return `<select class="${INPUT}" ${controlAttrs("status")}>${Object.entries(STATUS_LABELS)
        .map(([value, label]) => `<option value="${value}" ${state.editDraft.status === value ? "selected" : ""}>${label}</option>`)
        .join("")}</select>`;
    }

    function dependenciesFieldHtml() {
      const rows = state.editDraft.dependencies
        .map(
          (dependency, i) => `
            <div class="p-space-sm bg-surface-container-low rounded-lg space-y-2">
              <div class="flex items-start gap-2">
                <div class="flex-1 space-y-2">
                  <input class="${INPUT} bg-surface-container-lowest" type="text" maxlength="80" placeholder="Dependency name" aria-label="Dependency name" value="${esc(dependency.title)}" ${controlAttrs(`dependencies.${i}.title`)} />
                  ${state.errors[`dependencies.${i}.title`] ? `<p class="font-label-sm text-label-sm text-error" id="${fieldId(`dependencies.${i}.title`)}-error">${esc(state.errors[`dependencies.${i}.title`])}</p>` : ""}
                  <input class="${INPUT} bg-surface-container-lowest" type="text" maxlength="160" placeholder="Details (optional)" aria-label="Dependency details" value="${esc(dependency.detail || "")}" ${controlAttrs(`dependencies.${i}.detail`)} />
                </div>
                <button type="button" class="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container" data-remove-dependency="${i}" aria-label="Remove dependency">
                  <span class="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
              <label class="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
                <input type="checkbox" class="rounded accent-[#ba1a1a]" ${dependency.blocking ? "checked" : ""} ${controlAttrs(`dependencies.${i}.blocking`)} />
                Blocking
              </label>
            </div>`
        )
        .join("");
      return `
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">Dependencies</span>
            <button type="button" class="font-label-sm text-label-sm text-primary hover:underline font-semibold" data-add-dependency>+ Add dependency</button>
          </div>
          ${rows ? `<div class="space-y-2">${rows}</div>` : `<p class="font-body-sm text-body-sm text-outline italic">No dependencies.</p>`}
        </div>`;
    }

    function editHtml(node) {
      const depth = depthOf(node);
      const type = typeOf(node);
      let fields;

      if (depth === 0) {
        fields = `
          ${field("title", "Title", textArea("title", 160))}
          ${field("description", "Description", textArea("description", 500, "Why this matters and what success looks like"))}
          <div class="grid grid-cols-2 gap-space-sm">
            ${field("code", "Label", textInput("code", 20))}
            ${field("department", "Department", `<select class="${INPUT}" ${controlAttrs("department")}>${DEPARTMENTS.map((name) => `<option ${state.editDraft.department === name ? "selected" : ""}>${name}</option>`).join("")}</select>`)}
          </div>
          <div class="grid grid-cols-2 gap-space-sm">
            ${field("owner", "Owner", textInput("owner", 60))}
            ${field("team", "Team", textInput("team", 60))}
          </div>
          <div class="grid grid-cols-2 gap-space-sm">
            ${field("status", "Status", statusSelect())}
            ${field("targetDate", "Target date", dateInput("targetDate"))}
          </div>
          ${field("expectedPacing", "Expected progress by now (%)", `<input class="${INPUT}" type="number" min="0" max="100" step="1" inputmode="numeric" ${controlAttrs("expectedPacing")} value="${esc(state.editDraft.expectedPacing)}" />`)}
          ${dependenciesFieldHtml()}`;
      } else if (depth === 1) {
        fields = `
          ${field("title", "Title", textArea("title", 160, "A dated deliverable, e.g. Payments live in Ghana"))}
          ${field("description", "Description", textArea("description", 500, "What “done” looks like"))}
          <div class="grid grid-cols-2 gap-space-sm">
            ${field("code", "Label", textInput("code", 20))}
            ${field("dueDate", "Due date", dateInput("dueDate"))}
          </div>
          <div class="grid grid-cols-2 gap-space-sm">
            ${field("owner", "Owner", textInput("owner", 60))}
            ${field("status", "Status", statusSelect())}
          </div>
          <p class="font-label-sm text-label-sm text-on-surface-variant">Progress comes from the checklist. The milestone shows Complete once every step is done.</p>
          ${dependenciesFieldHtml()}`;
      } else {
        fields = `
          ${field("title", "What needs doing", textArea("title", 160, "A small, concrete step"))}
          ${field("notes", "Notes", textArea("notes", 500, "Links, context or acceptance criteria"))}
          <div class="grid grid-cols-2 gap-space-sm">
            ${field("assignee", "Assignee", textInput("assignee", 60))}
            ${field("dueDate", "Due date (optional)", dateInput("dueDate"))}
          </div>`;
      }

      return `
        <form class="flex-1 min-h-0 flex flex-col" data-edit-form novalidate>
          <div class="flex-1 min-h-0 overflow-y-auto p-space-lg space-y-space-md">${fields}</div>
          <div class="p-space-md bg-surface-container-low flex gap-2">
            <button type="submit" class="${PRIMARY_BUTTON} disabled:opacity-70 disabled:cursor-wait" ${state.saving ? "disabled" : ""}>
              ${
                state.saving
                  ? '<span class="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></span><span>Saving…</span>'
                  : `<span class="material-symbols-outlined text-base">check</span><span>${node.isDraft ? `Add ${type.label.toLowerCase()}` : "Save changes"}</span>`
              }
            </button>
            <button type="button" class="${SECONDARY_BUTTON}" data-cancel ${state.saving ? "disabled" : ""}>${node.isDraft ? "Discard" : "Cancel"}</button>
          </div>
        </form>`;
    }

    function startEdit(node) {
      state.mode = "edit";
      state.errors = {};
      state.formError = "";
      state.dirty = false;
      state.editDraft = {
        code: node.code || "",
        title: node.title || "",
        description: node.description || "",
        notes: node.notes || "",
        department: node.department || DEPARTMENTS[0],
        status: node.status || "on-track",
        owner: node.owner || "",
        assignee: node.assignee || "",
        team: node.team || "",
        targetDate: node.targetDate || "",
        dueDate: node.dueDate || "",
        expectedPacing: String(node.expectedPacing ?? 50),
        dependencies: (node.dependencies || []).map((dependency) => ({ ...dependency })),
      };
    }

    function setDraftValue(path, value) {
      const keys = path.split(".");
      let target = state.editDraft;
      keys.slice(0, -1).forEach((key) => (target = target[key]));
      target[keys[keys.length - 1]] = value;
    }

    function showFormErrors() {
      renderInspector();
      const firstInvalid = inspector.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
    }

    async function saveEdit() {
      if (state.saving) return;
      const node = nodeById(state.selectedId);
      const draft = state.editDraft;
      const depth = depthOf(node);

      state.formError = "";
      state.errors = okrs.validate(draft, depth);
      if (Object.keys(state.errors).length) return showFormErrors();

      // Keep ids so existing dependencies are updated rather than recreated.
      const dependencies = () =>
        draft.dependencies.map((dependency) => ({
          id: dependency.id || null,
          title: dependency.title.trim(),
          detail: (dependency.detail || "").trim(),
          blocking: Boolean(dependency.blocking),
        }));
      let next;
      if (depth === 0) {
        next = {
          code: draft.code.trim(),
          title: draft.title.trim(),
          description: draft.description.trim(),
          department: draft.department,
          owner: draft.owner.trim(),
          team: draft.team.trim(),
          status: draft.status,
          targetDate: draft.targetDate,
          expectedPacing: Math.round(Number(draft.expectedPacing)),
          dependencies: dependencies(),
        };
      } else if (depth === 1) {
        next = {
          code: draft.code.trim(),
          title: draft.title.trim(),
          description: draft.description.trim(),
          owner: draft.owner.trim(),
          status: draft.status,
          dueDate: draft.dueDate,
          dependencies: dependencies(),
        };
      } else {
        next = { title: draft.title.trim(), notes: draft.notes.trim(), assignee: draft.assignee.trim(), dueDate: draft.dueDate };
      }

      state.saving = true;
      renderInspector();
      try {
        if (node.isDraft) {
          Object.assign(node, next);
          await okrs.createNode(node); // node.id becomes the server's id
        } else {
          await okrs.updateNode(node, next);
        }
      } catch (error) {
        state.saving = false;
        if (!main.isConnected) return;
        state.errors = AIS.okrs.fieldErrors(error);
        if (!Object.keys(state.errors).length) state.formError = error.message;
        return showFormErrors();
      }
      state.saving = false;
      if (!main.isConnected) return;

      state.selectedId = node.id;
      state.mode = "view";
      state.editDraft = null;
      state.dirty = false;
      render();
      focusTile(node.id);
    }

    // Leaves edit mode without saving; an unsaved new item is removed.
    function discardEdit() {
      const node = nodeById(state.selectedId);
      if (node && node.isDraft) {
        okrs.data.nodes = okrs.data.nodes.filter((item) => item.id !== node.id);
        state.selectedId = node.parentId || firstObjectiveId();
      }
      state.mode = "view";
      state.editDraft = null;
      state.errors = {};
      state.dirty = false;
    }

    function hasUnsavedWork() {
      const node = nodeById(state.selectedId);
      return state.mode === "edit" && (state.dirty || Boolean(node && node.isDraft));
    }

    // Runs `action` now, or after the user confirms discarding unsaved edits.
    function guard(action) {
      if (!hasUnsavedWork()) {
        if (state.mode === "edit") discardEdit();
        action();
        return;
      }
      state.pendingAction = action;
      state.inspectorOpen = true;
      renderInspector();
      const discardButton = inspector.querySelector("[data-discard]");
      if (discardButton) discardButton.focus();
    }

    // ---- Actions ------------------------------------------------------------

    function select(id) {
      guard(() => {
        state.selectedId = id;
        state.mode = "view";
        state.inspectorOpen = true;
        render();
        centerSelected();
      });
    }

    function addChild(parentId) {
      const type = typeOf(nodeById(parentId));
      const node = okrs.newNode(parentId, { title: `New ${type.child.toLowerCase()}`, isDraft: true });
      okrs.data.nodes.push(node);
      state.selectedId = node.id;
      state.inspectorOpen = true;
      startEdit(node);
      render();

      revealSelected();
      const titleInput = inspector.querySelector("#edit-title");
      if (titleInput) {
        titleInput.focus({ preventScroll: true });
        titleInput.select();
      }
    }

    // Ticks at once; if the server refuses, the model flips back and we re-render.
    function toggleDone(id, fromPanel) {
      const refresh = () => {
        if (!main.isConnected) return;
        renderTree();
        if (state.mode !== "edit") renderInspector();
        updateToolbar();
      };
      const request = okrs.toggleDone(id);
      refresh();
      const scope = fromPanel ? inspector : tree;
      const box = scope.querySelector(`[data-toggle-done="${CSS.escape(id)}"]`);
      if (box) box.focus({ preventScroll: true });
      request.catch((error) => {
        refresh();
        AIS.toast(`Couldn't save the tick. ${error.message}`, { tone: "error" });
      });
    }

    async function deleteSelected() {
      const node = nodeById(state.selectedId);
      if (!node || state.saving) return;
      state.saving = true;
      renderInspector();
      let parent;
      try {
        parent = await okrs.deleteNode(node.id);
      } catch (error) {
        state.saving = false;
        state.mode = "view";
        if (main.isConnected) renderInspector();
        AIS.toast(`Couldn't delete “${node.title}”. ${error.message}`, { tone: "error" });
        return;
      }
      state.saving = false;
      if (!main.isConnected) return;
      state.selectedId = parent ? parent.id : firstObjectiveId();
      state.mode = "view";
      if (!parent) state.inspectorOpen = false;
      render();
      if (state.selectedId) focusTile(state.selectedId);
      AIS.toast(`“${node.title}” deleted.`);
    }

    // API: reload from the server ("Refresh"). Demo: restore the sample data
    // (asks for a second click first, since it discards local edits).
    async function resetData() {
      if (okrs.source === "api") {
        AIS.okrs.reload();
        resetButton.disabled = true;
        try {
          okrs = await loadOkrs();
        } catch (error) {
          AIS.toast(`Couldn't refresh. ${error.message}`, { tone: "error" });
          resetButton.disabled = false;
          return;
        }
        if (!main.isConnected) return;
        Object.assign(state, { mode: "view", editDraft: null, errors: {}, dirty: false, pendingAction: null, formError: "" });
        if (!nodeById(state.selectedId)) state.selectedId = firstObjectiveId();
        render();
        AIS.toast("Up to date.");
        return;
      }
      if (!state.resetArmed) {
        state.resetArmed = true;
        updateToolbar();
        resetTimer = setTimeout(() => {
          state.resetArmed = false;
          updateToolbar();
        }, 4000);
        return;
      }
      clearTimeout(resetTimer);
      state.resetArmed = false;
      AIS.okrs.reload();
      okrs = await loadOkrs();
      if (!main.isConnected) return;
      Object.assign(state, { mode: "view", editDraft: null, errors: {}, dirty: false, pendingAction: null, formError: "" });
      state.selectedId = firstObjectiveId();
      state.inspectorOpen = false;
      render();
      centerSelected();
    }

    function closeInspector() {
      guard(() => {
        state.mode = "view";
        state.inspectorOpen = false;
        renderInspector();
      });
    }

    function focusTile(id) {
      const tile = tree.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
      if (tile) tile.focus({ preventScroll: true });
    }

    function applyZoom(value) {
      state.zoom = Math.min(Math.max(value, 50), 150);
      tree.style.transform = `scale(${state.zoom / 100})`;
      updateToolbar();
    }

    function updateToolbar() {
      main.querySelector("#zoom-indicator").textContent = `${state.zoom}%`;
      const label = resetButton.querySelector("[data-reset-label]");
      if (okrs.source === "api") {
        // Data lives on the server: the button reloads it.
        label.textContent = "Refresh";
        resetButton.title = "Load the latest from the server";
        resetButton.disabled = false;
        return;
      }
      label.textContent = state.resetArmed ? "Click again to reset" : "Reset data";
      resetButton.classList.toggle("bg-error-container", state.resetArmed);
      resetButton.classList.toggle("text-on-error-container", state.resetArmed);
      resetButton.disabled = !state.resetArmed && !AIS.okrs.isModified();
    }

    // ---- Events -------------------------------------------------------------

    main.addEventListener("click", (event) => {
      const target = event.target;
      const hit = (selector) => target.closest(selector);
      let el;

      if (hit("[data-add-objective]")) {
        return; // opens the New Objective form (app.js)
      } else if ((el = hit("[data-toggle-done]"))) {
        toggleDone(el.dataset.toggleDone, inspector.contains(el));
      } else if ((el = hit("[data-add-child]"))) {
        const parentId = el.dataset.addChild;
        guard(() => addChild(parentId));
      } else if ((el = hit("[data-select]"))) {
        select(el.dataset.select);
      } else if ((el = hit("[data-node-id]"))) {
        select(el.dataset.nodeId);
      } else if (hit("[data-inspector-close]")) {
        closeInspector();
      } else if (hit("[data-edit]")) {
        startEdit(nodeById(state.selectedId));
        renderInspector();
        inspector.querySelector("#edit-title").focus();
      } else if (hit("[data-audit]")) {
        openAudit(nodeById(state.selectedId));
      } else if (hit("[data-back]")) {
        state.mode = "view";
        renderInspector();
      } else if (hit("[data-delete]")) {
        state.mode = "confirm-delete";
        renderInspector();
        inspector.querySelector("[data-confirm-delete]").focus();
      } else if (hit("[data-confirm-delete]")) {
        deleteSelected();
      } else if (hit("[data-cancel]")) {
        const wasEditing = state.mode === "edit";
        if (wasEditing) discardEdit();
        else state.mode = "view";
        render();
        if (wasEditing && state.selectedId) focusTile(state.selectedId);
      } else if (hit("[data-add-dependency]")) {
        state.editDraft.dependencies.push({ title: "", detail: "", blocking: false });
        state.dirty = true;
        renderInspector();
        inspector.querySelector(`#edit-dependencies-${state.editDraft.dependencies.length - 1}-title`).focus();
      } else if ((el = hit("[data-remove-dependency]"))) {
        state.editDraft.dependencies.splice(Number(el.dataset.removeDependency), 1);
        state.dirty = true;
        state.errors = {};
        renderInspector();
      } else if (hit("[data-discard]")) {
        const action = state.pendingAction;
        state.pendingAction = null;
        discardEdit();
        if (action) action();
        else render();
      } else if (hit("[data-keep-editing]")) {
        state.pendingAction = null;
        renderInspector();
      } else if (hit("[data-reset-data]")) {
        resetData();
      } else if (hit("#zoom-in-btn")) {
        applyZoom(state.zoom + 10);
      } else if (hit("#zoom-out-btn")) {
        applyZoom(state.zoom - 10);
      } else if (hit("#zoom-reset-btn")) {
        applyZoom(100);
      } else if (hit("#toggle-collapse-all")) {
        // Back to the objectives row only.
        guard(() => {
          state.selectedId = null;
          state.mode = "view";
          render();
        });
      }
    });

    main.addEventListener("input", (event) => {
      if (event.target === searchInput) {
        state.query = searchInput.value.trim().toLowerCase();
        applySearch();
        return;
      }
      const control = event.target.closest("[data-field]");
      if (control && state.mode === "edit") {
        setDraftValue(control.dataset.field, control.type === "checkbox" ? control.checked : control.value);
        state.dirty = true;
      }
    });

    // Selects, dates and checkboxes report through "change" in some browsers.
    main.addEventListener("change", (event) => {
      const control = event.target.closest("select[data-field], input[type=checkbox][data-field], input[type=date][data-field]");
      if (control && state.mode === "edit") {
        setDraftValue(control.dataset.field, control.type === "checkbox" ? control.checked : control.value);
        state.dirty = true;
      }
    });

    main.addEventListener("submit", (event) => {
      if (event.target.matches("[data-edit-form]")) {
        event.preventDefault();
        saveEdit();
      }
    });

    main.addEventListener("keydown", (event) => {
      const tile = event.target.matches("[data-node-id]") ? event.target : null;
      if (tile && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        select(tile.dataset.nodeId);
      } else if (event.key === "Escape") {
        if (state.mode === "edit") {
          guard(() => {
            state.mode = "view";
            render();
          });
        } else if (state.mode !== "view") {
          state.mode = "view";
          renderInspector();
        } else if (state.inspectorOpen) {
          closeInspector();
        }
      }
    });

    // Redraw connectors whenever items change size (fonts, Tailwind styles, resize).
    let frame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(drawConnectors);
    });
    resizeObserver.observe(tree);

    // An objective added from the "New objective" form: select and show it.
    const onOkrsChange = (event) => {
      if (state.mode === "edit") {
        renderTree(); // keep the open form untouched
        return;
      }
      if (event.detail && event.detail.id && nodeById(event.detail.id)) state.selectedId = event.detail.id;
      render();
      revealSelected();
    };
    document.addEventListener("okrs:change", onOkrsChange);

    render();
    // First scroll waits for fonts and two frames: after a client-side page change
    // Tailwind's CDN styles the new tiles asynchronously, and measuring earlier
    // would scroll to the wrong place.
    document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!main.isConnected) return;
          drawConnectors();
          if (focusId && state.selectedId === focusId) revealSelected("instant");
          else centerSelected("instant");
        })
      )
    );

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("okrs:change", onOkrsChange);
      clearTimeout(resetTimer);
      // Don't leave an unsaved new item in the session cache.
      okrs.data.nodes = okrs.data.nodes.filter((node) => !node.isDraft);
    };
  });
})();
