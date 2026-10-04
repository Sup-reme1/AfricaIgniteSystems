// Objective hierarchy: renders the alignment tree from data/hierarchy.json and a
// node inspector to view, edit, add and delete tiles. Edits are saved in this
// browser through AIS.data.save(); "Reset data" restores the original file.
//
// The tree shows the selected path: the North Star, its pillars, then the
// children of whichever tile is selected on each level below.
(function () {
  const esc = AIS.escape;
  const DATASET = "hierarchy";
  const SCHEMA_VERSION = 1;
  const DEFAULT_SELECTION = "pillar-02";

  // Tile type by depth. Initiatives are the lowest level (no "+").
  const TYPES = [
    { label: "Company North Star", child: "Pillar Objective", children: "Pillar Streams" },
    { label: "Pillar Objective", child: "Key Result", children: "Key Results" },
    { label: "Key Result", child: "Initiative", children: "Initiatives" },
    { label: "Initiative", child: null, children: null },
  ];
  const TILE_WIDTHS = ["w-[540px]", "w-[320px]", "w-[260px]", "w-[240px]"];

  const STATUS = {
    "on-track": {
      label: "On Track",
      icon: "trending_up",
      badge: "bg-tertiary-fixed text-on-tertiary-fixed",
      dot: "bg-tertiary",
      bar: "bg-tertiary",
      text: "text-tertiary",
    },
    "needs-attention": {
      label: "Needs Attention",
      icon: "schedule",
      badge: "bg-secondary-container text-on-secondary-container",
      dot: "bg-secondary",
      bar: "bg-secondary",
      text: "text-secondary",
    },
    "at-risk": {
      label: "At Risk",
      icon: "warning",
      badge: "bg-error-container text-on-error-container",
      dot: "bg-error",
      bar: "bg-error",
      text: "text-error",
    },
    complete: {
      label: "Complete",
      icon: "verified",
      badge: "bg-tertiary-fixed text-on-tertiary-fixed",
      dot: "bg-tertiary",
      bar: "bg-tertiary",
      text: "text-tertiary",
    },
  };
  const statusOf = (node) => STATUS[node.status] || STATUS["on-track"];

  const FIELD_LABELS = {
    code: "Label",
    title: "Title",
    description: "Description",
    status: "Status",
    owner: "Owner",
    team: "Team",
    progress: "Progress",
    expectedPacing: "Expected pacing",
  };

  const LINE_COLOR = "#CBD5E1";
  const ACCENT_COLOR = "#4F46E5";

  const INPUT =
    "w-full px-3 py-2 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container/40";
  const LABEL = "block mb-1 font-label-md text-label-md text-on-surface-variant";
  const PRIMARY_BUTTON =
    "flex-1 h-9 bg-primary-container hover:bg-primary text-on-primary font-title-sm text-title-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5";
  const SECONDARY_BUTTON =
    "flex-1 h-9 bg-surface-container-lowest hover:bg-surface-container text-on-surface font-title-sm text-title-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5";

  // ---- Small helpers --------------------------------------------------------

  const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
  const pad2 = (n) => String(n).padStart(2, "0");
  const newId = () => `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function initials(name) {
    const words = String(name || "").split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
    return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";
  }

  function avatar(name, colors, size) {
    return `<span class="${size} shrink-0 rounded-full ${colors} flex items-center justify-center text-[10px] font-bold shadow-sm" title="${esc(name)}">${esc(initials(name))}</span>`;
  }

  function bar(progress, color, classes) {
    return `<div class="w-full bg-surface-container-highest rounded-full overflow-hidden ${classes}"><div class="h-full ${color} rounded-full" style="width: ${clampPercent(progress)}%"></div></div>`;
  }

  function statusBadge(node, text) {
    const meta = statusOf(node);
    return `<span class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${meta.badge} font-label-sm text-label-sm font-semibold"><span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>${esc(text)}</span>`;
  }

  function statusLabel(node) {
    const meta = statusOf(node);
    return `<span class="shrink-0 flex items-center gap-1"><span class="material-symbols-outlined text-sm ${meta.text}">${meta.icon}</span><span class="font-semibold ${meta.text}">${meta.label}</span></span>`;
  }

  function paceLabel(delta) {
    return delta >= 0
      ? `<span class="text-tertiary font-semibold">+${delta}% Ahead</span>`
      : `<span class="text-error font-semibold">${delta}% Behind</span>`;
  }

  function displayValue(key, value) {
    if (value === undefined || value === null || value === "") return "—";
    if (key === "status") return (STATUS[value] || {}).label || value;
    if (key === "progress" || key === "expectedPacing") return `${value}%`;
    return String(value);
  }

  async function loadHierarchy() {
    let data = await AIS.data.load(DATASET);
    if (data.version !== SCHEMA_VERSION) {
      // Saved copy from an older format: start again from the file.
      AIS.data.reset(DATASET);
      data = await AIS.data.load(DATASET);
    }
    data.nodes = data.nodes.filter((node) => !node.isDraft);
    return data;
  }

  // ---- Page -----------------------------------------------------------------

  AIS.definePage("objectives", async (main) => {
    const canvas = main.querySelector("#canvas-container");
    const tree = main.querySelector("#tree-root-canvas");
    const inspector = main.querySelector("#inspector-panel");
    const backdrop = main.querySelector(".hierarchy-backdrop");
    const searchInput = main.querySelector("#node-search-input");
    const resetButton = main.querySelector("[data-reset-data]");
    const wideScreen = window.matchMedia("(min-width: 1280px)");

    let data;
    try {
      data = await loadHierarchy();
    } catch (error) {
      console.error(error);
      tree.innerHTML = `<p class="pt-space-xl text-center font-body-md text-body-md text-error">The hierarchy could not be loaded. Refresh the page to try again.</p>`;
      return;
    }
    if (!main.isConnected) return; // navigated away while loading

    const state = {
      selectedId: null,
      mode: "view", // view | edit | audit | confirm-delete
      editDraft: null,
      errors: {},
      dirty: false,
      pendingAction: null, // runs after "Discard changes"
      saveFailed: false,
      query: "",
      zoom: 100,
      inspectorOpen: wideScreen.matches,
      resetArmed: false,
    };
    let resetTimer = null;

    // ---- Model --------------------------------------------------------------

    const nodeById = (id) => data.nodes.find((node) => node.id === id);
    const rootNode = () => data.nodes.find((node) => node.parentId === null);
    const childrenOf = (id) => data.nodes.filter((node) => node.parentId === id);
    const savedChildrenOf = (id) => childrenOf(id).filter((node) => !node.isDraft);

    function pathTo(id) {
      const path = [];
      let node = nodeById(id);
      while (node) {
        path.unshift(node);
        node = nodeById(node.parentId);
      }
      return path;
    }

    const depthOf = (node) => pathTo(node.id).length - 1;
    const typeOf = (node) => TYPES[Math.min(depthOf(node), TYPES.length - 1)];
    const descendantsOf = (id) => childrenOf(id).flatMap((child) => [child, ...descendantsOf(child.id)]);

    // Tiles with sub-tiles report the average of their sub-tiles (each capped at 100%).
    function progressOf(node) {
      const kids = savedChildrenOf(node.id);
      if (!kids.length) return Math.round(Number(node.progress) || 0);
      const total = kids.reduce((sum, kid) => sum + Math.min(progressOf(kid), 100), 0);
      return Math.round(total / kids.length);
    }

    function matchesQuery(node) {
      if (!state.query) return true;
      return [node.code, node.title, node.team, node.owner].join(" ").toLowerCase().includes(state.query);
    }

    function persist() {
      state.saveFailed = !AIS.data.save(DATASET, data);
    }

    state.selectedId = nodeById(DEFAULT_SELECTION) ? DEFAULT_SELECTION : rootNode().id;

    // ---- Tree ---------------------------------------------------------------

    function render() {
      renderTree();
      renderInspector();
      updateToolbar();
    }

    function renderTree() {
      const path = pathTo(state.selectedId);
      const pathIds = new Set(path.map((node) => node.id));
      const rows = [{ parent: null, nodes: [rootNode()] }];

      for (const node of path) {
        const kids = childrenOf(node.id);
        if (kids.length) rows.push({ parent: node, nodes: kids });
        else if (node.id === state.selectedId && typeOf(node).child && !node.isDraft) {
          rows.push({ parent: node, nodes: [], ghost: true });
        }
      }

      tree.innerHTML = `
        <svg class="absolute left-0 top-0 pointer-events-none overflow-visible" data-connectors aria-hidden="true"></svg>
        <div class="relative z-10 flex flex-col items-center gap-16 px-2" data-rows>
          ${rows.map((row) => rowHtml(row, pathIds)).join("")}
        </div>`;
      drawConnectors();
    }

    function rowHtml(row, pathIds) {
      if (!row.parent) {
        return `
          <div class="relative flex flex-col items-center" data-row>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold uppercase tracking-wider mb-2 shadow-sm">
              <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              Tier 01 • Enterprise North Star
            </div>
            ${tileHtml(row.nodes[0], pathIds)}
          </div>`;
      }
      return `
        <div class="relative flex items-stretch justify-center gap-6" data-row data-parent-id="${esc(row.parent.id)}">
          ${row.nodes.map((node) => tileHtml(node, pathIds)).join("")}
          ${row.ghost ? ghostHtml(row.parent) : ""}
        </div>`;
    }

    function tileHtml(node, pathIds) {
      const depth = Math.min(depthOf(node), TYPES.length - 1);
      const type = TYPES[depth];
      const isSelected = node.id === state.selectedId;
      const inPath = pathIds.has(node.id);
      const frame = isSelected
        ? "ring-2 ring-primary-container shadow-lg shadow-primary-container/10"
        : inPath
          ? "ring-1 ring-primary-container/40 shadow-sm"
          : "shadow-sm hover:shadow-md";
      const body = depth === 0 ? northStarBody(node) : depth === 1 ? objectiveBody(node, isSelected) : keyResultBody(node);

      return `
        <div
          class="group relative ${TILE_WIDTHS[depth]} shrink-0 bg-surface-container-lowest ${depth === 0 ? "rounded-2xl p-space-lg" : "rounded-xl p-space-md"} ${frame} ${node.isDraft ? "outline-dashed outline-2 outline-primary-container" : ""} ${matchesQuery(node) ? "" : "opacity-35"} transition-all cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
          aria-label="${esc(type.label)}: ${esc(node.title)}"
          data-node-id="${esc(node.id)}"
        >
          ${body}
          ${type.child && !node.isDraft ? addButtonHtml(node, type, isSelected) : ""}
        </div>`;
    }

    function addButtonHtml(node, type, isSelected) {
      const visibility = isSelected
        ? "opacity-100"
        : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100";
      const label = `Add ${type.child.toLowerCase()}`;
      return `
        <button type="button"
          class="absolute -bottom-3.5 left-1/2 -translate-x-1/2 z-20 w-7 h-7 rounded-full bg-primary-container hover:bg-primary text-on-primary shadow-md flex items-center justify-center transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary ${visibility}"
          data-add-child="${esc(node.id)}"
          aria-label="${label} under ${esc(node.title)}"
          title="${label}"
        ><span class="material-symbols-outlined text-lg">add</span></button>`;
    }

    function ghostHtml(parent) {
      const label = typeOf(parent).child;
      return `
        <button type="button"
          class="w-[260px] min-h-[140px] rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant hover:border-primary-container hover:text-primary hover:bg-surface-container-lowest transition-colors flex flex-col items-center justify-center gap-1 font-title-sm text-title-sm"
          data-add-child="${esc(parent.id)}"
          data-ghost
        >
          <span class="material-symbols-outlined">add_circle</span>
          Add ${label.toLowerCase()}
        </button>`;
    }

    function northStarBody(node) {
      const progress = progressOf(node);
      const pacing = Number(node.expectedPacing) || 0;
      const kids = savedChildrenOf(node.id);
      const owners = [...new Set(kids.map((kid) => kid.owner).filter(Boolean))].slice(0, 3);
      const avatarColors = ["bg-primary-container text-on-primary", "bg-secondary text-on-secondary", "bg-tertiary text-on-tertiary"];
      return `
        <div>
          <div class="flex items-start justify-between gap-space-sm mb-space-sm">
            <div class="flex items-center gap-2 min-w-0">
              <span class="p-2 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
                <span class="material-symbols-outlined text-xl">stars</span>
              </span>
              <div class="min-w-0">
                <span class="font-label-sm text-label-sm text-on-surface-variant font-medium uppercase">${esc(node.code)}</span>
                <div class="font-label-sm text-label-sm text-primary font-semibold truncate">${esc(node.team)}</div>
              </div>
            </div>
            ${statusBadge(node, statusOf(node).label.toUpperCase())}
          </div>
          <h2 class="font-headline-sm text-headline-sm text-on-surface font-bold leading-snug mb-space-sm group-hover:text-primary transition-colors">${esc(node.title)}</h2>
          <div class="bg-surface-container-low rounded-xl p-space-sm mb-space-md">
            <div class="flex justify-between items-center mb-1">
              <span class="font-label-md text-label-md text-on-surface-variant font-medium">Aggregate Execution Index</span>
              <span class="font-metric-stat text-metric-stat text-primary font-bold">${progress}%</span>
            </div>
            <div class="relative w-full h-2.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div class="h-full bg-primary-container rounded-full" style="width: ${clampPercent(progress)}%"></div>
              <div class="absolute top-0 bottom-0 w-0.5 bg-on-surface opacity-30" style="left: ${clampPercent(pacing)}%" title="Expected pacing: ${pacing}%"></div>
            </div>
            <div class="flex justify-between items-center mt-1 text-[11px] text-on-surface-variant">
              <span>Expected pacing: ${pacing}%</span>
              ${paceLabel(progress - pacing)}
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between pt-space-xs">
          <div class="flex items-center gap-space-sm min-w-0">
            <div class="flex -space-x-2">${owners.map((owner, i) => avatar(owner, avatarColors[i], "w-7 h-7")).join("")}</div>
            <span class="font-label-sm text-label-sm text-on-surface-variant font-medium truncate">${esc(node.owner)}</span>
          </div>
          <div class="shrink-0 flex items-center gap-1 font-label-sm text-label-sm text-primary font-semibold">
            <span>${kids.length} ${TYPES[0].children}</span>
            <span class="material-symbols-outlined text-base">arrow_downward</span>
          </div>
        </div>`;
    }

    function objectiveBody(node, isSelected) {
      const progress = progressOf(node);
      const kids = savedChildrenOf(node.id);
      return `
        <div>
          <div class="flex items-center justify-between gap-1 mb-space-xs">
            <span class="inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold uppercase truncate ${isSelected ? "text-primary" : "text-on-surface-variant"}">
              ${isSelected ? '<span class="material-symbols-outlined text-sm">hub</span>' : ""}${esc(node.code)}
            </span>
            ${statusBadge(node, `${progress}%`)}
          </div>
          <h3 class="font-title-md text-title-md leading-snug mb-space-xs transition-colors ${isSelected ? "text-primary font-bold" : "text-on-surface group-hover:text-primary"}">${esc(node.title)}</h3>
          ${node.description ? `<p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-space-sm">${esc(node.description)}</p>` : ""}
          ${bar(progress, statusOf(node).bar, "h-1.5 mb-space-sm")}
        </div>
        <div class="flex items-center justify-between gap-2 pt-space-xs text-on-surface-variant font-label-sm text-label-sm">
          <div class="flex items-center gap-1.5 min-w-0">
            ${avatar(node.owner, "bg-secondary-fixed text-on-secondary-fixed", "w-6 h-6")}
            <span class="truncate">${esc(node.owner || "Unassigned")}</span>
          </div>
          <span class="shrink-0 px-2 py-0.5 rounded ${isSelected ? "bg-primary-fixed text-on-primary-fixed font-semibold" : "bg-surface-container text-on-surface font-medium"}">
            ${kids.length} ${kids.length === 1 ? TYPES[1].child : TYPES[1].children}
          </span>
        </div>`;
    }

    // Key results and initiatives share one layout.
    function keyResultBody(node) {
      const progress = progressOf(node);
      const metric = node.metric || {};
      const hasMetric = Boolean(metric.current || metric.target);
      return `
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="font-label-sm text-label-sm font-semibold truncate ${node.status === "at-risk" ? "text-error" : "text-primary"}">${esc(node.code)}</span>
            ${statusBadge(node, `${progress}%`)}
          </div>
          <h4 class="font-title-sm text-title-sm text-on-surface font-semibold mb-space-sm leading-snug line-clamp-2">${esc(node.title)}</h4>
          ${
            hasMetric
              ? `<div class="font-metric-stat text-[22px] font-bold mb-1 ${node.status === "complete" ? "text-tertiary" : "text-on-surface"}">${esc(metric.current || "—")} <span class="font-body-md text-body-md text-on-surface-variant font-normal">/ ${esc(metric.target || "—")}</span></div>`
              : ""
          }
          ${bar(progress, statusOf(node).bar, "h-1.5 mb-space-sm")}
        </div>
        <div class="flex items-center justify-between gap-2 pt-space-xs text-on-surface-variant font-label-sm text-label-sm">
          <span class="px-2 py-0.5 rounded bg-surface-container font-medium text-on-surface truncate">${esc(node.team || node.owner || "Unassigned")}</span>
          ${statusLabel(node)}
        </div>`;
    }

    // Connector lines are measured from the rendered tiles, so they fit any
    // number of tiles. Offsets ignore the zoom transform, so zoom needs no redraw.
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
      const line = (x1, y1, x2, y2, color, extra = "") =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" ${extra}></line>`;
      const dot = (cx, cy, r, color) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"></circle>`;

      let markup = "";
      tree.querySelectorAll("[data-row][data-parent-id]").forEach((row) => {
        const parentEl = tree.querySelector(`[data-node-id="${CSS.escape(row.dataset.parentId)}"]`);
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
          const color = pathIds.has(el.dataset.nodeId) ? ACCENT_COLOR : LINE_COLOR;
          markup += line(xs[i], midY, xs[i], rowTop, color) + dot(xs[i], midY, 3, color);
        });
        markup += dot(px, midY, 4, ACCENT_COLOR);
      });
      svg.innerHTML = markup;
    }

    // Scrolls the canvas so the selected tile is horizontally centred (the tree
    // is usually wider than the space left beside the inspector).
    function centerSelected(behavior = "smooth") {
      const tile = tree.querySelector(`[data-node-id="${CSS.escape(state.selectedId)}"]`);
      if (!tile) return;
      const tileBox = tile.getBoundingClientRect();
      const canvasBox = canvas.getBoundingClientRect();
      const offset = tileBox.left + tileBox.width / 2 - (canvasBox.left + canvasBox.width / 2);
      canvas.scrollBy({ left: offset, behavior });
    }

    function applySearch() {
      tree.querySelectorAll("[data-node-id]").forEach((tile) => {
        tile.classList.toggle("opacity-35", !matchesQuery(nodeById(tile.dataset.nodeId)));
      });
    }

    // ---- Inspector ----------------------------------------------------------

    function renderInspector() {
      inspector.classList.toggle("is-open", state.inspectorOpen);
      backdrop.classList.toggle("is-open", state.inspectorOpen);

      const node = nodeById(state.selectedId);
      const type = typeOf(node);
      const heading =
        state.mode === "edit"
          ? `${node.isDraft ? "New" : "Edit"} ${type.label}`
          : state.mode === "audit"
            ? "Audit Log"
            : "Node Inspector";

      inspector.innerHTML = `
        <div class="p-space-lg bg-surface-container-low flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-primary-container"></span>
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">${esc(heading)}</span>
          </div>
          <button type="button" class="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" data-inspector-close aria-label="Close inspector">
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        ${state.pendingAction ? unsavedBannerHtml() : ""}
        ${state.saveFailed ? saveFailedHtml() : ""}
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

    function saveFailedHtml() {
      return `
        <p class="m-space-md mb-0 p-space-sm rounded-lg bg-error-container text-on-error-container font-body-sm text-body-sm" role="alert">
          This browser blocked saving, so your changes will be lost when the page reloads.
        </p>`;
    }

    function viewHtml(node) {
      const depth = depthOf(node);
      const type = typeOf(node);
      const progress = progressOf(node);
      const pacing = Number(node.expectedPacing) || 0;
      const kids = savedChildrenOf(node.id);
      const metric = node.metric || {};
      const dependencies = node.dependencies || [];
      const blocking = dependencies.filter((dependency) => dependency.blocking).length;
      const path = pathTo(node.id);
      const subtileCount = descendantsOf(node.id).length;

      const breadcrumb = path
        .map((item, i) =>
          i < path.length - 1
            ? `<button type="button" class="truncate max-w-[9rem] hover:text-primary hover:underline" data-select="${esc(item.id)}">${esc(item.code)}</button><span class="material-symbols-outlined text-sm">chevron_right</span>`
            : `<span class="truncate max-w-[9rem] text-on-surface font-semibold" aria-current="true">${esc(item.code)}</span>`
        )
        .join("");

      const footer =
        state.mode === "confirm-delete"
          ? `
            <div class="p-space-md bg-error-container text-on-error-container space-y-2" role="alert">
              <p class="font-body-sm text-body-sm"><strong>Delete “${esc(node.title)}”</strong>${subtileCount ? ` and its ${subtileCount} sub-tile${subtileCount === 1 ? "" : "s"}` : ""}? You can only get it back with Reset data.</p>
              <div class="flex gap-2">
                <button type="button" class="flex-1 h-9 rounded-lg bg-error text-on-error font-title-sm text-title-sm" data-confirm-delete>Delete</button>
                <button type="button" class="${SECONDARY_BUTTON}" data-cancel>Cancel</button>
              </div>
            </div>`
          : `
            <div class="p-space-md bg-surface-container-low flex flex-col gap-2">
              <div class="flex gap-2">
                <button type="button" class="${PRIMARY_BUTTON}" data-edit>
                  <span class="material-symbols-outlined text-base">edit</span><span>Edit</span>
                </button>
                <button type="button" class="${SECONDARY_BUTTON}" data-audit>
                  <span class="material-symbols-outlined text-base">history</span><span>Audit Log</span>
                </button>
              </div>
              ${
                type.child
                  ? `<button type="button" class="w-full h-8 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md rounded-lg transition-colors flex items-center justify-center gap-1" data-add-child="${esc(node.id)}">
                      <span class="material-symbols-outlined text-sm">add</span><span>Add ${type.child.toLowerCase()}</span>
                    </button>`
                  : ""
              }
              ${
                depth > 0
                  ? `<button type="button" class="w-full h-8 text-error hover:bg-error-container font-label-md text-label-md rounded-lg transition-colors flex items-center justify-center gap-1" data-delete>
                      <span class="material-symbols-outlined text-sm">delete</span><span>Delete ${type.label.toLowerCase()}</span>
                    </button>`
                  : ""
              }
            </div>`;

      return `
        <div class="flex-1 min-h-0 overflow-y-auto p-space-lg space-y-space-lg">
          <nav class="flex flex-wrap items-center gap-1 font-label-sm text-label-sm text-on-surface-variant" aria-label="Hierarchy path">${breadcrumb}</nav>
          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-label-sm text-label-sm text-primary font-semibold uppercase tracking-wider">Tier ${pad2(depth + 1)} • ${type.label}</span>
              <span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold uppercase">${progress}% complete</span>
            </div>
            <h3 class="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight">${esc(node.title)}</h3>
            <p class="mt-2 font-body-sm text-body-sm leading-relaxed ${node.description ? "text-on-surface-variant" : "text-outline italic"}">${esc(node.description || "No description yet.")}</p>
          </div>
          <div class="grid grid-cols-2 gap-space-sm">
            <div class="p-space-sm bg-surface-container-low rounded-xl">
              <div class="font-label-sm text-label-sm text-on-surface-variant">Progress</div>
              <div class="font-metric-stat text-metric-stat text-primary font-bold mt-1">${progress}%</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant mt-0.5">${kids.length ? `Average of ${kids.length} ${kids.length === 1 ? type.child.toLowerCase() : type.children.toLowerCase()}` : "Set on this tile"}</div>
            </div>
            <div class="p-space-sm bg-surface-container-low rounded-xl">
              <div class="font-label-sm text-label-sm text-on-surface-variant">Pacing</div>
              <div class="font-metric-stat text-metric-stat font-bold mt-1 ${progress - pacing >= 0 ? "text-tertiary" : "text-error"}">${progress - pacing >= 0 ? "+" : ""}${progress - pacing}%</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant mt-0.5">vs ${pacing}% expected</div>
            </div>
            ${
              metric.current || metric.target
                ? `<div class="col-span-2 p-space-sm bg-surface-container-low rounded-xl flex items-end justify-between gap-2">
                    <div><div class="font-label-sm text-label-sm text-on-surface-variant">Current</div><div class="font-title-md text-title-md text-on-surface font-bold">${esc(metric.current || "—")}</div></div>
                    <div class="text-right"><div class="font-label-sm text-label-sm text-on-surface-variant">Target</div><div class="font-title-md text-title-md text-on-surface">${esc(metric.target || "—")}</div></div>
                  </div>`
                : ""
            }
          </div>
          <div class="grid grid-cols-2 gap-space-sm">
            <div class="min-w-0">
              <div class="font-label-sm text-label-sm text-on-surface-variant">Owner</div>
              <div class="mt-1 flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface font-medium">
                ${avatar(node.owner, "bg-secondary-fixed text-on-secondary-fixed", "w-6 h-6")}<span class="truncate">${esc(node.owner || "Unassigned")}</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="font-label-sm text-label-sm text-on-surface-variant">Status</div>
              <div class="mt-1 font-body-sm text-body-sm">${statusLabel(node)}</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant truncate mt-0.5">${esc(node.team || "No team")}</div>
            </div>
          </div>
          ${confidenceHtml(node.confidenceTrend || [])}
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-title-sm text-title-sm text-on-surface font-semibold">Dependencies</span>
              ${blocking ? `<span class="font-label-sm text-label-sm text-error font-medium">${blocking} Blocking</span>` : ""}
            </div>
            ${
              dependencies.length
                ? `<div class="space-y-2">${dependencies.map(dependencyHtml).join("")}</div>`
                : `<p class="font-body-sm text-body-sm text-outline italic">No dependencies.</p>`
            }
          </div>
          ${type.child ? childrenHtml(node, type, kids) : ""}
        </div>
        ${footer}`;
    }

    function dependencyHtml(dependency) {
      return dependency.blocking
        ? `<div class="p-2.5 rounded-lg bg-error-container text-on-error-container flex items-start gap-2">
            <span class="material-symbols-outlined text-base mt-0.5 text-error">block</span>
            <div class="text-xs"><div class="font-semibold">${esc(dependency.title)}</div>${dependency.detail ? `<div class="opacity-90">${esc(dependency.detail)}</div>` : ""}</div>
          </div>`
        : `<div class="p-2.5 rounded-lg bg-surface-container text-on-surface flex items-start gap-2">
            <span class="material-symbols-outlined text-base mt-0.5 text-primary">link</span>
            <div class="text-xs"><div class="font-semibold">${esc(dependency.title)}</div>${dependency.detail ? `<div class="text-on-surface-variant">${esc(dependency.detail)}</div>` : ""}</div>
          </div>`;
    }

    function confidenceHtml(trend) {
      if (!trend.length) return "";
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
            ${trend
              .map(
                (point, i) =>
                  `<span class="${i === trend.length - 1 ? "text-primary font-bold" : ""}">${esc(point.label)}: ${(Number(point.value) || 0).toFixed(2)}</span>`
              )
              .join("")}
          </div>
        </div>`;
    }

    function childrenHtml(node, type, kids) {
      const items = kids
        .map((kid) => {
          const progress = progressOf(kid);
          const metric = kid.metric || {};
          const detail = metric.current || metric.target ? ` (${metric.current || "—"} / ${metric.target || "—"})` : "";
          return `
            <button type="button" class="w-full text-left p-space-sm bg-surface-container-low rounded-lg hover:bg-surface-container transition-colors" data-select="${esc(kid.id)}">
              <div class="flex justify-between items-center gap-2 text-xs mb-1">
                <span class="font-semibold text-on-surface truncate">${esc(kid.title)}</span>
                <span class="shrink-0 font-bold ${statusOf(kid).text}">${progress}%</span>
              </div>
              ${bar(progress, statusOf(kid).bar, "h-1.5 mb-1")}
              <div class="flex justify-between gap-2 text-[11px] text-on-surface-variant">
                <span class="truncate">${esc((kid.team || "No team") + detail)}</span>
                <span class="truncate">Owner: ${esc(kid.owner || "Unassigned")}</span>
              </div>
            </button>`;
        })
        .join("");
      return `
        <div>
          <div class="flex items-center justify-between mb-space-sm">
            <span class="font-title-sm text-title-sm text-on-surface font-semibold">${type.children} (${kids.length})</span>
            <button type="button" class="font-label-sm text-label-sm text-primary hover:underline font-semibold" data-add-child="${esc(node.id)}">+ Add</button>
          </div>
          ${kids.length ? `<div class="space-y-space-xs">${items}</div>` : `<p class="font-body-sm text-body-sm text-outline italic">No ${type.children.toLowerCase()} yet.</p>`}
        </div>`;
    }

    function auditHtml(node) {
      const entries = [...(node.history || [])].reverse();
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
              ${changes ? `<ul class="space-y-1">${changes}</ul>` : ""}
            </li>`;
        })
        .join("");
      return `
        <div class="flex-1 min-h-0 overflow-y-auto p-space-lg space-y-space-md">
          <div>
            <div class="font-label-sm text-label-sm text-primary font-semibold uppercase tracking-wider">${esc(node.code)}</div>
            <h3 class="font-title-md text-title-md text-on-surface font-bold">${esc(node.title)}</h3>
          </div>
          ${entries.length ? `<ol class="space-y-space-sm">${list}</ol>` : `<p class="font-body-sm text-body-sm text-outline italic">No changes recorded yet. Edits made here will appear in this log.</p>`}
        </div>
        <div class="p-space-md bg-surface-container-low">
          <button type="button" class="${SECONDARY_BUTTON} w-full" data-back>
            <span class="material-symbols-outlined text-base">arrow_back</span><span>Back to details</span>
          </button>
        </div>`;
    }

    // ---- Edit form ----------------------------------------------------------

    function field(name, label, control) {
      const error = state.errors[name];
      return `
        <div>
          <label class="${LABEL}" for="edit-${name.replace(/\./g, "-")}">${label}</label>
          ${control}
          ${error ? `<p class="mt-1 font-label-sm text-label-sm text-error" id="edit-${name.replace(/\./g, "-")}-error">${esc(error)}</p>` : ""}
        </div>`;
    }

    function controlAttrs(name) {
      const id = `edit-${name.replace(/\./g, "-")}`;
      const invalid = state.errors[name] ? ` aria-invalid="true" aria-describedby="${id}-error"` : "";
      return `id="${id}" name="${name}" data-field="${name}"${invalid}`;
    }

    function editHtml(node) {
      const draft = state.editDraft;
      const depth = depthOf(node);
      const type = typeOf(node);
      const kids = savedChildrenOf(node.id);
      const statusOptions = Object.entries(STATUS)
        .map(([value, meta]) => `<option value="${value}" ${draft.status === value ? "selected" : ""}>${meta.label}</option>`)
        .join("");

      const dependencies = draft.dependencies
        .map(
          (dependency, i) => `
            <div class="p-space-sm bg-surface-container-low rounded-lg space-y-2">
              <div class="flex items-start gap-2">
                <div class="flex-1 space-y-2">
                  <input class="${INPUT} bg-surface-container-lowest" type="text" maxlength="80" placeholder="Dependency name" aria-label="Dependency name" value="${esc(dependency.title)}" ${controlAttrs(`dependencies.${i}.title`)} />
                  ${state.errors[`dependencies.${i}.title`] ? `<p class="font-label-sm text-label-sm text-error" id="edit-dependencies-${i}-title-error">${esc(state.errors[`dependencies.${i}.title`])}</p>` : ""}
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
        <form class="flex-1 min-h-0 flex flex-col" data-edit-form novalidate>
          <div class="flex-1 min-h-0 overflow-y-auto p-space-lg space-y-space-md">
            ${field("title", "Title", `<textarea class="${INPUT}" rows="3" maxlength="160" required ${controlAttrs("title")}>${esc(draft.title)}</textarea>`)}
            ${field("code", "Label", `<input class="${INPUT}" type="text" maxlength="60" ${controlAttrs("code")} value="${esc(draft.code)}" />`)}
            ${field("description", "Description", `<textarea class="${INPUT}" rows="3" maxlength="500" ${controlAttrs("description")}>${esc(draft.description)}</textarea>`)}
            <div class="grid grid-cols-2 gap-space-sm">
              ${field("status", "Status", `<select class="${INPUT}" ${controlAttrs("status")}>${statusOptions}</select>`)}
              ${field("expectedPacing", "Expected pacing (%)", `<input class="${INPUT}" type="number" min="0" max="100" step="1" inputmode="numeric" ${controlAttrs("expectedPacing")} value="${esc(draft.expectedPacing)}" />`)}
            </div>
            <div class="grid grid-cols-2 gap-space-sm">
              ${field("owner", "Owner", `<input class="${INPUT}" type="text" maxlength="60" ${controlAttrs("owner")} value="${esc(draft.owner)}" />`)}
              ${field("team", "Team", `<input class="${INPUT}" type="text" maxlength="60" ${controlAttrs("team")} value="${esc(draft.team)}" />`)}
            </div>
            ${
              kids.length
                ? `<div><span class="${LABEL}">Progress</span><p class="px-3 py-2 bg-surface-container rounded-lg font-body-sm text-body-sm text-on-surface-variant">${progressOf(node)}% — calculated from ${kids.length} ${kids.length === 1 ? type.child.toLowerCase() : type.children.toLowerCase()}</p></div>`
                : field("progress", "Progress (%)", `<input class="${INPUT}" type="number" min="0" max="200" step="1" inputmode="numeric" ${controlAttrs("progress")} value="${esc(draft.progress)}" />`)
            }
            ${
              depth >= 2
                ? `<div class="grid grid-cols-2 gap-space-sm">
                    ${field("metric.current", "Current value", `<input class="${INPUT}" type="text" maxlength="30" placeholder="e.g. 118" ${controlAttrs("metric.current")} value="${esc(draft.metric.current)}" />`)}
                    ${field("metric.target", "Target", `<input class="${INPUT}" type="text" maxlength="30" placeholder="e.g. 150" ${controlAttrs("metric.target")} value="${esc(draft.metric.target)}" />`)}
                  </div>`
                : ""
            }
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="font-title-sm text-title-sm text-on-surface font-semibold">Dependencies</span>
                <button type="button" class="font-label-sm text-label-sm text-primary hover:underline font-semibold" data-add-dependency>+ Add dependency</button>
              </div>
              ${dependencies ? `<div class="space-y-2">${dependencies}</div>` : `<p class="font-body-sm text-body-sm text-outline italic">No dependencies.</p>`}
            </div>
          </div>
          <div class="p-space-md bg-surface-container-low flex gap-2">
            <button type="submit" class="${PRIMARY_BUTTON}">
              <span class="material-symbols-outlined text-base">check</span><span>${node.isDraft ? `Add ${type.label.toLowerCase()}` : "Save changes"}</span>
            </button>
            <button type="button" class="${SECONDARY_BUTTON}" data-cancel>${node.isDraft ? "Discard" : "Cancel"}</button>
          </div>
        </form>`;
    }

    function startEdit(node) {
      state.mode = "edit";
      state.errors = {};
      state.dirty = false;
      state.editDraft = {
        code: node.code || "",
        title: node.title || "",
        description: node.description || "",
        status: node.status || "on-track",
        owner: node.owner || "",
        team: node.team || "",
        progress: String(node.progress ?? 0),
        expectedPacing: String(node.expectedPacing ?? 0),
        metric: { current: (node.metric || {}).current || "", target: (node.metric || {}).target || "" },
        dependencies: (node.dependencies || []).map((dependency) => ({ ...dependency })),
      };
    }

    function setDraftValue(path, value) {
      const keys = path.split(".");
      let target = state.editDraft;
      keys.slice(0, -1).forEach((key) => (target = target[key]));
      target[keys[keys.length - 1]] = value;
    }

    function validate(draft, isLeaf) {
      const errors = {};
      const inRange = (value, max) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max;
      if (!draft.title.trim()) errors.title = "Enter a title.";
      if (!draft.code.trim()) errors.code = "Enter a label, e.g. KR 2.5.";
      if (isLeaf && !inRange(draft.progress, 200)) errors.progress = "Enter a number from 0 to 200.";
      if (!inRange(draft.expectedPacing, 100)) errors.expectedPacing = "Enter a number from 0 to 100.";
      draft.dependencies.forEach((dependency, i) => {
        if (!dependency.title.trim()) errors[`dependencies.${i}.title`] = "Name the dependency or remove it.";
      });
      return errors;
    }

    function diffNode(node, next) {
      const changes = [];
      Object.keys(FIELD_LABELS).forEach((key) => {
        if (key in next && String(node[key] ?? "") !== String(next[key] ?? "")) {
          changes.push({ field: FIELD_LABELS[key], from: displayValue(key, node[key]), to: displayValue(key, next[key]) });
        }
      });
      if (next.metric) {
        const before = node.metric || {};
        if ((before.current || "") !== next.metric.current) {
          changes.push({ field: "Current value", from: displayValue("", before.current), to: displayValue("", next.metric.current) });
        }
        if ((before.target || "") !== next.metric.target) {
          changes.push({ field: "Target", from: displayValue("", before.target), to: displayValue("", next.metric.target) });
        }
      }
      if (JSON.stringify(node.dependencies || []) !== JSON.stringify(next.dependencies)) {
        changes.push({
          field: "Dependencies",
          from: (node.dependencies || []).map((dependency) => dependency.title).join(", ") || "None",
          to: next.dependencies.map((dependency) => dependency.title).join(", ") || "None",
        });
      }
      return changes;
    }

    function saveEdit() {
      const node = nodeById(state.selectedId);
      const draft = state.editDraft;
      const isLeaf = !savedChildrenOf(node.id).length;

      state.errors = validate(draft, isLeaf);
      if (Object.keys(state.errors).length) {
        renderInspector();
        const firstInvalid = inspector.querySelector('[aria-invalid="true"]');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const next = {
        code: draft.code.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        status: draft.status,
        owner: draft.owner.trim(),
        team: draft.team.trim(),
        expectedPacing: Math.round(Number(draft.expectedPacing)),
        dependencies: draft.dependencies.map((dependency) => ({
          title: dependency.title.trim(),
          detail: (dependency.detail || "").trim(),
          blocking: Boolean(dependency.blocking),
        })),
      };
      if (isLeaf) next.progress = Math.round(Number(draft.progress));
      if (depthOf(node) >= 2) next.metric = { current: draft.metric.current.trim(), target: draft.metric.target.trim() };

      const now = new Date().toISOString();
      if (node.isDraft) {
        Object.assign(node, next);
        delete node.isDraft;
        node.history = [{ at: now, action: "created", changes: [] }];
        const parent = nodeById(node.parentId);
        parent.history = parent.history || [];
        parent.history.push({ at: now, action: "updated", changes: [{ field: typeOf(node).label, note: `Added “${node.title}”` }] });
      } else {
        const changes = diffNode(node, next);
        if (changes.length) {
          Object.assign(node, next);
          node.history = node.history || [];
          node.history.push({ at: now, action: "updated", changes });
        }
      }

      persist();
      state.mode = "view";
      state.editDraft = null;
      state.dirty = false;
      render();
      focusTile(node.id);
    }

    // Leaves edit mode without saving; an unsaved new tile is removed.
    function discardEdit() {
      const node = nodeById(state.selectedId);
      if (node && node.isDraft) {
        data.nodes = data.nodes.filter((item) => item.id !== node.id);
        state.selectedId = node.parentId;
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
      const parent = nodeById(parentId);
      const depth = depthOf(parent);
      const type = TYPES[depth];
      if (!type.child) return;

      const position = childrenOf(parentId).length + 1;
      const parentOrdinal = parent.parentId ? childrenOf(parent.parentId).indexOf(parent) + 1 : 1;
      const code =
        depth === 0
          ? `Pillar ${pad2(position)} • New`
          : depth === 1
            ? `KR ${parentOrdinal}.${position}`
            : `${String(parent.code).replace(/^KR\s*/i, "INI ")}.${position}`;

      const node = {
        id: newId(),
        parentId,
        code,
        title: `New ${type.child.toLowerCase()}`,
        description: "",
        owner: parent.owner || "",
        team: parent.team || "",
        status: "on-track",
        progress: 0,
        expectedPacing: Number(parent.expectedPacing) || 0,
        confidenceTrend: [],
        dependencies: [],
        history: [],
        isDraft: true,
      };
      if (depth + 1 >= 2) node.metric = { current: "", target: "" };

      data.nodes.push(node);
      state.selectedId = node.id;
      state.inspectorOpen = true;
      startEdit(node);
      render();

      centerSelected();
      const titleInput = inspector.querySelector("#edit-title");
      if (titleInput) {
        titleInput.focus({ preventScroll: true });
        titleInput.select();
      }
    }

    function deleteSelected() {
      const node = nodeById(state.selectedId);
      if (!node || !node.parentId) return;
      const typeLabel = typeOf(node).label; // before the node leaves the tree
      const removed = new Set([node.id, ...descendantsOf(node.id).map((item) => item.id)]);
      data.nodes = data.nodes.filter((item) => !removed.has(item.id));

      const parent = nodeById(node.parentId);
      parent.history = parent.history || [];
      parent.history.push({
        at: new Date().toISOString(),
        action: "updated",
        changes: [{ field: typeLabel, note: `Deleted “${node.title}”` }],
      });

      state.selectedId = parent.id;
      state.mode = "view";
      persist();
      render();
      focusTile(parent.id);
    }

    async function resetData() {
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
      AIS.data.reset(DATASET);
      data = await loadHierarchy();
      if (!main.isConnected) return;
      Object.assign(state, { mode: "view", editDraft: null, errors: {}, dirty: false, pendingAction: null, saveFailed: false });
      state.selectedId = nodeById(DEFAULT_SELECTION) ? DEFAULT_SELECTION : rootNode().id;
      render();
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
      label.textContent = state.resetArmed ? "Click again to reset" : "Reset data";
      resetButton.classList.toggle("bg-error-container", state.resetArmed);
      resetButton.classList.toggle("text-on-error-container", state.resetArmed);
      resetButton.disabled = !state.resetArmed && !AIS.data.isModified(DATASET);
    }

    // ---- Events -------------------------------------------------------------

    main.addEventListener("click", (event) => {
      const target = event.target;
      const hit = (selector) => target.closest(selector);
      let el;

      if ((el = hit("[data-add-child]"))) {
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
        state.mode = "audit";
        renderInspector();
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
        if (wasEditing) focusTile(state.selectedId);
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
        select(rootNode().id);
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

    // Selects and checkboxes report through "change" in some browsers.
    main.addEventListener("change", (event) => {
      const control = event.target.closest("select[data-field], input[type=checkbox][data-field]");
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
        } else if (state.inspectorOpen && !wideScreen.matches) {
          closeInspector();
        }
      }
    });

    // Redraw connectors whenever tiles change size (fonts, Tailwind styles, resize).
    let frame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(drawConnectors);
    });
    resizeObserver.observe(tree);

    const onScreenChange = () => {
      state.inspectorOpen = wideScreen.matches;
      inspector.classList.toggle("is-open", state.inspectorOpen);
      backdrop.classList.toggle("is-open", state.inspectorOpen);
    };
    wideScreen.addEventListener("change", onScreenChange);

    render();
    document.fonts.ready.then(() => {
      if (!main.isConnected) return;
      drawConnectors();
      centerSelected("instant");
    });

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      wideScreen.removeEventListener("change", onScreenChange);
      clearTimeout(resetTimer);
      // Don't leave an unsaved new tile in the session cache.
      data.nodes = data.nodes.filter((node) => !node.isDraft);
    };
  });
})();
