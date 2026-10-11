// Dashboard: renders company objectives from the shared OKR data (AIS.okrs,
// data/okrs.json), with department / status filters, expandable milestones
// (each links to its place in the hierarchy), and a "Set up hierarchy" link per
// objective. Objectives added with the "New objective" form appear immediately
// (okrs:change) and are highlighted.
(function () {
  const esc = AIS.escape;

  const STATUS = {
    "on-track": {
      label: "On Track",
      badge: "bg-tertiary-container/10 text-tertiary",
      dot: "bg-tertiary",
      bar: "bg-tertiary-container",
      value: "text-on-surface",
    },
    "needs-attention": {
      label: "Needs Attention",
      badge: "bg-secondary-container text-on-secondary-container",
      dot: "bg-secondary",
      bar: "bg-secondary",
      value: "text-on-surface",
    },
    "at-risk": {
      label: "At Risk",
      badge: "bg-error-container text-on-error-container",
      dot: "bg-error",
      bar: "bg-error",
      value: "text-error",
    },
    complete: {
      label: "Complete",
      badge: "bg-tertiary-container text-on-tertiary",
      icon: "check",
      bar: "bg-tertiary-container",
      value: "text-tertiary",
    },
  };
  const statusMeta = (status) => STATUS[status] || STATUS["on-track"];

  const DEPARTMENT_ACTIVE = ["bg-surface-container-lowest", "text-on-surface", "shadow-sm"];
  const DEPARTMENT_INACTIVE = ["text-on-surface-variant", "hover:text-on-surface"];
  const STATUS_ACTIVE = ["ring-2", "ring-primary-container/40"];
  const HIGHLIGHT = ["ring-2", "ring-primary-container", "shadow-lg"];

  // Completed objectives count as on track for filtering.
  const statusGroup = (status) => (status === "complete" ? "on-track" : status);
  const hierarchyUrl = (id) => `objectives.html?focus=${encodeURIComponent(id)}`;

  function statusBadge(status, weight) {
    const meta = statusMeta(status);
    const marker = meta.icon
      ? `<span class="material-symbols-outlined text-xs">${meta.icon}</span>`
      : `<span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>`;
    return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${meta.badge} font-label-sm text-label-sm ${weight}">${marker}${meta.label}</span>`;
  }

  const DUE_TONES = { overdue: "text-error font-semibold", soon: "text-primary", normal: "text-on-surface-variant", done: "text-tertiary" };

  function milestoneCard(milestone) {
    const meta = statusMeta(milestone.status);
    const due = AIS.okrs.dueLabel(milestone.dueDate, milestone.status === "complete");
    return `
      <a href="${hierarchyUrl(milestone.id)}" class="block p-space-md bg-surface-container-low rounded-xl hover:bg-surface-container transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-label-sm text-label-sm text-primary font-semibold">${esc(milestone.code)}</span>
              ${statusBadge(milestone.status, "font-medium")}
            </div>
            <div class="font-title-sm text-title-sm text-on-surface">${esc(milestone.title)}</div>
            <div class="font-body-sm text-body-sm text-on-surface-variant flex flex-wrap items-center gap-x-3">
              <span>Owner: <strong class="text-on-surface font-medium">${esc(milestone.owner || "Unassigned")}</strong></span>
              ${due ? `<span>•</span><span class="${DUE_TONES[due.tone]}">${esc(due.text)}</span>` : ""}
            </div>
          </div>
          <div class="flex items-center gap-space-md shrink-0 sm:w-48 justify-between sm:justify-end">
            <div class="text-left sm:text-right">
              <div class="font-title-sm text-title-sm ${meta.value} font-bold">${milestone.progress}%</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant font-medium">${milestone.total ? `${milestone.done} / ${milestone.total} steps` : "No checklist yet"}</div>
            </div>
            <div class="w-16 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div class="h-full ${meta.bar} rounded-full" style="width: ${Math.min(100, milestone.progress)}%"></div>
            </div>
          </div>
        </div>
      </a>`;
  }

  const EMPTY_MILESTONES = (objective) => `
    <div class="p-space-md rounded-xl border-2 border-dashed border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
      <div>
        <div class="font-title-sm text-title-sm text-on-surface">No milestones yet</div>
        <div class="font-body-sm text-body-sm text-on-surface-variant">Break this objective into dated milestones, then checklists.</div>
      </div>
      <a href="${hierarchyUrl(objective.id)}" class="shrink-0 inline-flex items-center gap-1.5 h-9 px-space-md rounded-lg bg-primary-container hover:bg-primary text-on-primary font-title-sm text-title-sm shadow-sm transition-colors">
        <span class="material-symbols-outlined text-lg">account_tree</span>Set up hierarchy
      </a>
    </div>`;

  function objectiveCard(objective, isCollapsed) {
    const meta = statusMeta(objective.status);
    const krsId = `${objective.id}-krs`;
    return `
      <div class="bg-surface-container-lowest rounded-xl shadow-sm transition-all overflow-hidden" data-objective-card="${esc(objective.id)}">
        <div
          class="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md cursor-pointer hover:bg-surface-container-low/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-container"
          role="button"
          tabindex="0"
          aria-expanded="${!isCollapsed}"
          aria-controls="${krsId}"
          data-toggle-objective="${esc(objective.id)}"
        >
          <div class="space-y-2 min-w-0">
            <div class="flex flex-wrap items-center gap-space-xs">
              <span class="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold tracking-wider uppercase">${esc(objective.code)}</span>
              ${statusBadge(objective.status, "font-semibold")}
              <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(objective.team || objective.department || "")}</span>
            </div>
            <h3 class="font-headline-sm text-headline-sm text-on-surface tracking-tight">${esc(objective.title)}</h3>
          </div>
          <div class="flex items-center gap-space-md shrink-0">
            <div class="text-right">
              <div class="font-title-md text-title-md text-on-surface font-bold">${objective.progress}%</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant">Avg Progress</div>
            </div>
            <div class="w-24 h-2 bg-surface-container rounded-full overflow-hidden hidden sm:block">
              <div class="h-full ${meta.bar} rounded-full" style="width: ${Math.min(100, objective.progress)}%"></div>
            </div>
            <a href="${hierarchyUrl(objective.id)}"
              class="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
              title="Set up hierarchy" aria-label="Set up hierarchy for ${esc(objective.code)}">
              <span class="material-symbols-outlined">account_tree</span>
            </a>
            <span class="material-symbols-outlined text-on-surface-variant transition-transform ${isCollapsed ? "-rotate-90" : ""}">expand_more</span>
          </div>
        </div>
        <div class="px-space-lg pb-space-lg pt-space-xs space-y-space-sm ${isCollapsed ? "hidden" : ""}" id="${krsId}">
          ${objective.milestones.length ? objective.milestones.map(milestoneCard).join("") : EMPTY_MILESTONES(objective)}
        </div>
      </div>`;
  }

  const EMPTY_STATE = `
    <div class="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm text-center space-y-space-sm">
      <span class="material-symbols-outlined text-4xl text-outline">filter_alt_off</span>
      <p class="font-title-md text-title-md text-on-surface">No objectives match these filters</p>
      <button type="button" class="font-title-sm text-title-sm text-primary hover:underline" data-clear-filters>Clear filters</button>
    </div>`;

  const NO_OBJECTIVES = `
    <div class="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm text-center space-y-space-sm">
      <span class="material-symbols-outlined text-4xl text-outline">flag</span>
      <p class="font-title-md text-title-md text-on-surface">No objectives yet</p>
      <button type="button" class="font-title-sm text-title-sm text-primary hover:underline" data-add-objective>Add your first objective</button>
    </div>`;

  const ERROR_STATE = (message) => `
    <div class="bg-error-container rounded-xl p-space-lg text-on-error-container font-body-md text-body-md flex flex-wrap items-center justify-between gap-space-sm" role="alert">
      <span>Objectives could not be loaded. ${esc(message || "")}</span>
      <button type="button" class="h-9 px-space-md rounded-lg bg-error text-on-error font-title-sm text-title-sm" data-retry>Try again</button>
    </div>`;

  // ---- Stat cards -----------------------------------------------------------

  const CARD = "bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between hover:shadow-md transition-all";
  const CARD_LABEL = "font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider";
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  function cardIcon(icon, colors) {
    return `<div class="w-10 h-10 shrink-0 rounded-lg ${colors} flex items-center justify-center"><span class="material-symbols-outlined text-xl">${icon}</span></div>`;
  }

  function cardBar(done, total, color) {
    const width = total ? Math.round((done / total) * 100) : 0;
    return `<div class="w-full h-1.5 bg-surface-container rounded-full overflow-hidden"><div class="h-full ${color} rounded-full" style="width: ${width}%"></div></div>`;
  }

  function statCardsHtml(summary) {
    const delta = summary.progress - summary.expected;
    const ahead = delta >= 0;
    const { statusCounts, milestones, steps } = summary;

    const statusParts = [
      ["on-track", "on track", "bg-tertiary-container"],
      ["complete", "complete", "bg-tertiary"],
      ["needs-attention", "need attention", "bg-secondary"],
      ["at-risk", "at risk", "bg-error"],
    ].filter(([key]) => statusCounts[key]);

    const progressCard = `
      <div class="${CARD}">
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-0.5">
            <span class="${CARD_LABEL}">Overall progress</span>
            <div class="font-metric-stat text-metric-stat text-on-surface pt-1">${summary.progress}%</div>
          </div>
          <div class="relative w-12 h-12 shrink-0">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
              <path class="text-surface-container" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3.5"></path>
              <path class="${ahead ? "text-tertiary-container" : "text-error"}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-dasharray="${summary.progress}, 100" stroke-linecap="round" stroke-width="3.5"></path>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center font-label-sm text-label-sm font-bold ${ahead ? "text-tertiary" : "text-error"}">${ahead ? "+" : ""}${delta}%</div>
          </div>
        </div>
        <div class="pt-space-md space-y-1">
          <div class="flex items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
            <span>Average of ${plural(summary.objectives, "objective")}</span>
            <span class="font-semibold ${ahead ? "text-tertiary" : "text-error"}">${ahead ? `+${delta}% ahead` : `${delta}% behind`}</span>
          </div>
          ${cardBar(summary.progress, 100, ahead ? "bg-tertiary-container" : "bg-error")}
        </div>
      </div>`;

    const objectivesCard = `
      <div class="${CARD}">
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-0.5">
            <span class="${CARD_LABEL}">Objectives</span>
            <div class="font-metric-stat text-metric-stat text-on-surface pt-1">${summary.objectives}</div>
          </div>
          ${cardIcon("flag", "bg-surface-container-low text-primary")}
        </div>
        <div class="pt-space-md space-y-1">
          <div class="font-label-sm text-label-sm text-on-surface-variant truncate">
            ${statusParts.length ? statusParts.map(([key, label]) => `${statusCounts[key]} ${label}`).join(" · ") : "No objectives yet"}
          </div>
          <div class="flex gap-1 h-1.5 w-full">
            ${statusParts.map(([key, , color]) => `<div class="${color} rounded-full" style="flex: ${statusCounts[key]}"></div>`).join("") || '<div class="flex-1 bg-surface-container rounded-full"></div>'}
          </div>
        </div>
      </div>`;

    const milestonesCard = `
      <div class="${CARD}">
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-0.5">
            <span class="${CARD_LABEL}">Milestones</span>
            <div class="font-metric-stat text-metric-stat text-on-surface pt-1">${milestones.done}<span class="font-body-lg text-body-lg text-on-surface-variant"> / ${milestones.total} done</span></div>
          </div>
          ${cardIcon("event", "bg-tertiary-fixed/30 text-tertiary")}
        </div>
        <div class="pt-space-md space-y-1">
          <div class="flex items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
            <span>${milestones.dueThisWeek} due this week</span>
            <span class="font-semibold ${milestones.overdue ? "text-error" : "text-tertiary"}">${milestones.overdue ? `${milestones.overdue} overdue` : "None overdue"}</span>
          </div>
          ${cardBar(milestones.done, milestones.total, "bg-primary-container")}
        </div>
      </div>`;

    const stepsPercent = steps.total ? Math.round((steps.done / steps.total) * 100) : 0;
    const stepsCard = `
      <div class="${CARD}">
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-0.5">
            <span class="${CARD_LABEL}">Checklist steps</span>
            <div class="font-metric-stat text-metric-stat text-on-surface pt-1">${steps.done}<span class="font-body-lg text-body-lg text-on-surface-variant"> / ${steps.total} done</span></div>
          </div>
          ${cardIcon("checklist", "bg-surface-container-low text-on-surface-variant")}
        </div>
        <div class="pt-space-md space-y-1">
          <div class="flex items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
            <span>${stepsPercent}% complete</span>
            <span class="font-semibold ${steps.overdue ? "text-error" : "text-tertiary"}">${steps.overdue ? `${plural(steps.overdue, "overdue step")}` : "None overdue"}</span>
          </div>
          ${cardBar(steps.done, steps.total, "bg-tertiary-container")}
        </div>
      </div>`;

    return progressCard + objectivesCard + milestonesCard + stepsCard;
  }

  // ---- Blockers & Milestones panel -----------------------------------------

  const MAX_BLOCKERS = 6;
  const SECTION_LABEL = "font-label-sm text-label-sm uppercase tracking-wider font-semibold text-on-surface-variant";

  function scopeLabel(item) {
    if (item.milestone) return `${item.objective.code} · ${item.milestone.code}`;
    return item.node.code && item.node.code !== item.objective.code ? `${item.objective.code} · ${item.node.code}` : item.objective.code;
  }

  function blockerHtml(item, okrs) {
    const { node } = item;
    if (item.kind === "dependency") {
      const { dependency } = item;
      return `
        <div class="p-space-sm rounded-xl bg-error-container/40 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold uppercase">
              <span class="material-symbols-outlined text-xs">block</span>Blocking
            </span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(scopeLabel(item))}</span>
          </div>
          <a href="${hierarchyUrl(node.id)}" class="block font-title-sm text-title-sm text-on-surface hover:text-primary">${esc(dependency.title)}</a>
          ${dependency.detail ? `<p class="font-body-sm text-body-sm text-on-surface-variant">${esc(dependency.detail)}</p>` : ""}
          <div class="flex items-center justify-between gap-2 pt-1 font-label-sm text-label-sm">
            <span class="text-on-surface-variant truncate">Blocks: <strong class="text-on-surface font-medium">${esc(node.title)}</strong></span>
            <button type="button" class="shrink-0 font-label-md text-label-md text-primary hover:underline" data-resolve-dependency="${esc(node.id)}" data-index="${item.index}">Mark resolved</button>
          </div>
        </div>`;
    }

    const isStep = okrs.isStep(node);
    const canTick = isStep && !okrs.savedChildrenOf(node.id).length;
    return `
      <div class="p-space-sm rounded-xl bg-surface-container-low space-y-1">
        <div class="flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold">
            <span class="material-symbols-outlined text-xs">event_busy</span>Overdue ${plural(item.days, "day")}
          </span>
          <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(scopeLabel(item))}</span>
        </div>
        <a href="${hierarchyUrl(node.id)}" class="block font-title-sm text-title-sm text-on-surface hover:text-primary">${esc(node.title)}</a>
        <div class="flex items-center justify-between gap-2 pt-1 font-label-sm text-label-sm">
          <span class="text-on-surface-variant truncate">${isStep ? "Assignee" : "Owner"}: <strong class="text-on-surface font-medium">${esc((isStep ? node.assignee : node.owner) || "Unassigned")}</strong></span>
          ${
            canTick
              ? `<button type="button" class="shrink-0 font-label-md text-label-md text-primary hover:underline" data-mark-done="${esc(node.id)}">Mark done</button>`
              : `<a href="${hierarchyUrl(node.id)}" class="shrink-0 font-label-md text-label-md text-primary hover:underline">${isStep ? "Open" : "Reschedule"}</a>`
          }
        </div>
      </div>`;
  }

  function upcomingHtml({ milestone, objective }, okrs) {
    const due = AIS.okrs.dueLabel(milestone.dueDate);
    const progress = okrs.progressOf(milestone);
    const { done, total } = okrs.stepCounts(milestone);
    return `
      <a href="${hierarchyUrl(milestone.id)}" class="block p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-label-sm text-label-sm font-semibold text-primary">${esc(milestone.code)} <span class="text-on-surface-variant font-medium">· ${esc(objective.code)}</span></span>
          <span class="font-label-sm text-label-sm ${DUE_TONES[due.tone]}">${esc(due.text)}</span>
        </div>
        <div class="font-title-sm text-title-sm text-on-surface mb-1.5">${esc(milestone.title)}</div>
        ${cardBar(progress, 100, statusMeta(okrs.statusOf(milestone)).bar)}
        <div class="flex items-center justify-between gap-2 mt-1 text-[11px] text-on-surface-variant">
          <span>${total ? `${done} / ${total} steps` : "No checklist yet"}</span>
          <span class="truncate">${esc(milestone.owner || "Unassigned")}</span>
        </div>
      </a>`;
  }

  function blockersPanelHtml(okrs, department) {
    const blockers = okrs.blockers(department);
    const upcoming = okrs.upcomingMilestones(department);
    const shown = blockers.slice(0, MAX_BLOCKERS);
    const hidden = blockers.length - shown.length;

    const blockersSection = `
      <div class="space-y-space-sm">
        <div class="flex items-center justify-between">
          <span class="${SECTION_LABEL}">Blockers</span>
          ${blockers.length ? `<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold">${blockers.length}</span>` : ""}
        </div>
        ${
          blockers.length
            ? shown.map((item) => blockerHtml(item, okrs)).join("") +
              (hidden ? `<a href="objectives.html" class="block font-label-md text-label-md text-primary hover:underline">${hidden} more in the hierarchy</a>` : "")
            : `<div class="p-space-sm rounded-xl bg-tertiary-fixed/30 text-on-surface flex items-center gap-2 font-body-sm text-body-sm"><span class="material-symbols-outlined text-tertiary">task_alt</span>No blockers right now.</div>`
        }
      </div>`;

    const upcomingSection = `
      <div class="space-y-space-sm">
        <span class="${SECTION_LABEL}">Upcoming milestones</span>
        ${
          upcoming.length
            ? upcoming.map((item) => upcomingHtml(item, okrs)).join("")
            : `<p class="font-body-sm text-body-sm text-outline italic">No upcoming milestones with a due date.</p>`
        }
        <a href="objectives.html" class="inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline">View all in hierarchy<span class="material-symbols-outlined text-sm">arrow_forward</span></a>
      </div>`;

    return {
      body: blockersSection + upcomingSection,
      summary: `${plural(blockers.length, "blocker")} · ${upcoming.length} upcoming`,
    };
  }

  AIS.definePage("dashboard", async (main) => {
    const list = main.querySelector("[data-objectives-list]");
    const state = { department: "all", status: "all", collapsed: new Set(), visibleIds: [] };
    let highlightTimer = null;

    let okrs;
    try {
      okrs = await AIS.okrs.load();
    } catch (error) {
      console.error(error);
      list.innerHTML = ERROR_STATE(error.message);
      list.querySelector("[data-retry]").addEventListener("click", () => location.reload());
      return;
    }
    if (!main.isConnected) return; // navigated away while loading

    // Flattens the shared tree into what the cards need.
    function objectivesView() {
      return okrs.objectives().map((node) => ({
        id: node.id,
        code: node.code,
        title: node.title,
        team: node.team,
        department: node.department,
        status: okrs.statusOf(node),
        progress: okrs.progressOf(node),
        steps: okrs.leafStepsOf(node).length,
        milestones: okrs.savedChildrenOf(node.id).map((milestone) => ({
          id: milestone.id,
          code: milestone.code,
          title: milestone.title,
          owner: milestone.owner,
          dueDate: milestone.dueDate,
          status: okrs.statusOf(milestone),
          progress: okrs.progressOf(milestone),
          ...okrs.stepCounts(milestone),
        })),
      }));
    }

    function render() {
      const objectives = objectivesView();
      const inDepartment = (objective) => state.department === "all" || objective.department === state.department;
      const departmentObjectives = objectives.filter(inDepartment);
      const visible = departmentObjectives.filter(
        (objective) => state.status === "all" || statusGroup(objective.status) === state.status
      );

      list.innerHTML = !objectives.length
        ? NO_OBJECTIVES
        : visible.length
          ? visible.map((objective) => objectiveCard(objective, state.collapsed.has(objective.id))).join("")
          : EMPTY_STATE;

      main.querySelectorAll("[data-department]").forEach((button) => {
        const isActive = button.dataset.department === state.department;
        button.classList.remove(...DEPARTMENT_ACTIVE, ...DEPARTMENT_INACTIVE);
        button.classList.add(...(isActive ? DEPARTMENT_ACTIVE : DEPARTMENT_INACTIVE));
        button.setAttribute("aria-pressed", String(isActive));
      });

      main.querySelectorAll("[data-status]").forEach((button) => {
        const status = button.dataset.status;
        const isActive = status === state.status;
        STATUS_ACTIVE.forEach((cls) => button.classList.toggle(cls, isActive));
        button.setAttribute("aria-pressed", String(isActive));
        const count = departmentObjectives.filter(
          (objective) => status === "all" || statusGroup(objective.status) === status
        ).length;
        button.querySelector("[data-status-count]").textContent = count;
      });

      main.querySelector("[data-shown-count]").textContent = `${visible.length} of ${objectives.length} Shown`;
      main.querySelector('[data-stat="objectives"]').textContent = objectives.length;
      main.querySelector('[data-stat="milestones"]').textContent = objectives.reduce(
        (total, objective) => total + objective.milestones.length,
        0
      );
      main.querySelector('[data-stat="steps"]').textContent = objectives.reduce((total, objective) => total + objective.steps, 0);

      state.visibleIds = visible.map((objective) => objective.id);
      const allExpanded = state.visibleIds.every((id) => !state.collapsed.has(id));
      main.querySelector("[data-expand-all-label]").textContent = allExpanded ? "Collapse all" : "Expand all";
      main.querySelector("[data-expand-all]").classList.toggle("invisible", !visible.length);

      // Stat cards and the Blockers & Milestones panel follow the department tab.
      main.querySelector("[data-stat-cards]").innerHTML = statCardsHtml(okrs.summary(state.department));
      const panel = blockersPanelHtml(okrs, state.department);
      main.querySelector("[data-blockers-body]").innerHTML = panel.body;
      main.querySelector("[data-blockers-summary]").textContent = panel.summary;
    }

    // "Mark resolved" / "Mark done" in the Blockers panel: the button shows it's
    // working, the change is saved, then the page re-renders with a confirmation.
    async function applyQuickAction(button, action, message) {
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        const changed = await action();
        render();
        if (changed) AIS.toast(message);
      } catch (error) {
        render();
        AIS.toast(error.message, { tone: "error" });
      }
    }

    // Scrolls to an objective card and briefly rings it.
    function highlight(id) {
      const card = list.querySelector(`[data-objective-card="${CSS.escape(id)}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add(...HIGHLIGHT);
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => card.classList.remove(...HIGHLIGHT), 2500);
    }

    function showObjective(id) {
      const node = okrs.byId(id);
      if (!node) return;
      // Make sure the filters don't hide it.
      if (state.department !== "all" && node.department !== state.department) state.department = "all";
      if (state.status !== "all" && statusGroup(node.status) !== state.status) state.status = "all";
      state.collapsed.delete(id);
      render();
      highlight(id);
    }

    function toggleObjective(id) {
      if (state.collapsed.has(id)) state.collapsed.delete(id);
      else state.collapsed.add(id);
      render();
      const trigger = main.querySelector(`[data-toggle-objective="${CSS.escape(id)}"]`);
      if (trigger) trigger.focus({ preventScroll: true });
    }

    main.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest("a, [data-add-objective]")) return; // links and the form are handled elsewhere

      const resolve = target.closest("[data-resolve-dependency]");
      if (resolve) {
        const nodeId = resolve.dataset.resolveDependency;
        const index = Number(resolve.dataset.index);
        const node = okrs.byId(nodeId);
        const title = node && (node.dependencies || [])[index]?.title;
        applyQuickAction(resolve, () => okrs.resolveDependency(nodeId, index), `“${title}” marked resolved.`);
        return;
      }
      const markDone = target.closest("[data-mark-done]");
      if (markDone) {
        const id = markDone.dataset.markDone;
        const node = okrs.byId(id);
        applyQuickAction(markDone, () => okrs.toggleDone(id), `“${node.title}” marked done.`);
        return;
      }

      const objective = target.closest("[data-toggle-objective]");
      const department = target.closest("[data-department]");
      const status = target.closest("[data-status]");

      if (objective) {
        toggleObjective(objective.dataset.toggleObjective);
      } else if (department) {
        state.department = department.dataset.department;
        render();
      } else if (status) {
        state.status = status.dataset.status;
        render();
      } else if (target.closest("[data-clear-filters]")) {
        state.department = "all";
        state.status = "all";
        render();
      } else if (target.closest("[data-expand-all]")) {
        const ids = state.visibleIds;
        const allExpanded = ids.every((id) => !state.collapsed.has(id));
        ids.forEach((id) => (allExpanded ? state.collapsed.add(id) : state.collapsed.delete(id)));
        render();
      }
    });

    main.addEventListener("keydown", (event) => {
      const objective = event.target.closest("[data-toggle-objective]");
      if (objective && event.target === objective && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggleObjective(objective.dataset.toggleObjective);
      }
    });

    // New objective saved from the slide-over form.
    const onOkrsChange = (event) => {
      const id = event.detail && event.detail.id;
      if (id) showObjective(id);
      else render();
    };
    document.addEventListener("okrs:change", onOkrsChange);

    render();

    // Arriving from the "View on dashboard" link after adding an objective elsewhere.
    const highlightId = new URLSearchParams(location.search).get("highlight");
    if (highlightId) showObjective(highlightId);

    return () => {
      document.removeEventListener("okrs:change", onOkrsChange);
      clearTimeout(highlightTimer);
    };
  });
})();
