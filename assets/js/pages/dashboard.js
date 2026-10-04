// Dashboard: renders company objectives from data/objectives.json, with
// department / status filters and expandable key results.
(function () {
  const esc = AIS.escape;

  const STATUS = {
    "on-track": {
      label: "On Track",
      badge: "bg-tertiary-container/10 text-tertiary",
      dot: "bg-tertiary",
      bar: "bg-tertiary-container",
      value: "text-on-surface",
      note: "text-tertiary",
    },
    ahead: {
      label: "Ahead of Target",
      badge: "bg-tertiary-fixed text-on-tertiary-fixed",
      icon: "rocket_launch",
      bar: "bg-tertiary-container",
      value: "text-tertiary",
      note: "text-tertiary",
    },
    "needs-attention": {
      label: "Needs Attention",
      badge: "bg-secondary-container text-on-secondary-container",
      dot: "bg-secondary",
      bar: "bg-secondary",
      value: "text-on-surface",
      note: "text-error",
    },
    "at-risk": {
      label: "At Risk",
      badge: "bg-error-container text-on-error-container",
      dot: "bg-error",
      bar: "bg-error",
      value: "text-error",
      note: "text-error",
    },
    complete: {
      label: "Complete / Exceeded",
      badge: "bg-tertiary-container text-on-tertiary",
      icon: "check",
      bar: "bg-tertiary-container",
      value: "text-tertiary",
      note: "text-tertiary",
    },
  };

  const DEPARTMENT_ACTIVE = ["bg-surface-container-lowest", "text-on-surface", "shadow-sm"];
  const DEPARTMENT_INACTIVE = ["text-on-surface-variant", "hover:text-on-surface"];
  const STATUS_ACTIVE = ["ring-2", "ring-primary-container/40"];

  // "Ahead of target" objectives count as on track for filtering.
  const statusGroup = (status) => (status === "ahead" ? "on-track" : status);

  function statusBadge(status, weight) {
    const meta = STATUS[status];
    const marker = meta.icon
      ? `<span class="material-symbols-outlined text-xs">${meta.icon}</span>`
      : `<span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>`;
    return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${meta.badge} font-label-sm text-label-sm ${weight}">${marker}${meta.label}</span>`;
  }

  function keyResultCard(kr) {
    const meta = STATUS[kr.status];
    return `
      <div class="p-space-md bg-surface-container-low rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-space-md hover:bg-surface-container transition-all">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-label-sm text-label-sm text-primary font-semibold">${esc(kr.code)}</span>
            ${statusBadge(kr.status, "font-medium")}
          </div>
          <div class="font-title-sm text-title-sm text-on-surface">${esc(kr.title)}</div>
          <div class="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-3">
            <span>Owner: <strong class="text-on-surface font-medium">${esc(kr.owner)}</strong></span>
            <span>•</span>
            <span>Target: ${esc(kr.target)}</span>
          </div>
        </div>
        <div class="flex items-center gap-space-md shrink-0 sm:w-48 justify-between sm:justify-end">
          <div class="text-left sm:text-right">
            <div class="font-title-sm text-title-sm ${meta.value} font-bold">${esc(kr.value)}</div>
            <div class="font-label-sm text-label-sm ${meta.note} font-medium">${esc(kr.note)}</div>
          </div>
          <div class="w-16 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div class="h-full ${meta.bar} rounded-full" style="width: ${Number(kr.progress)}%"></div>
          </div>
        </div>
      </div>`;
  }

  function objectiveCard(objective, isCollapsed) {
    const meta = STATUS[objective.status];
    const krsId = `${objective.id}-krs`;
    return `
      <div class="bg-surface-container-lowest rounded-xl shadow-sm transition-all overflow-hidden">
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
              <span class="font-label-sm text-label-sm text-on-surface-variant">${esc(objective.team)}</span>
            </div>
            <h3 class="font-headline-sm text-headline-sm text-on-surface tracking-tight">${esc(objective.title)}</h3>
          </div>
          <div class="flex items-center gap-space-lg shrink-0">
            <div class="text-right">
              <div class="font-title-md text-title-md text-on-surface font-bold">${Number(objective.progress)}%</div>
              <div class="font-label-sm text-label-sm text-on-surface-variant">Avg Progress</div>
            </div>
            <div class="w-24 h-2 bg-surface-container rounded-full overflow-hidden hidden sm:block">
              <div class="h-full ${meta.bar} rounded-full" style="width: ${Number(objective.progress)}%"></div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant transition-transform ${isCollapsed ? "-rotate-90" : ""}">expand_more</span>
          </div>
        </div>
        <div class="px-space-lg pb-space-lg pt-space-xs space-y-space-sm ${isCollapsed ? "hidden" : ""}" id="${krsId}">
          ${objective.keyResults.map(keyResultCard).join("")}
        </div>
      </div>`;
  }

  const EMPTY_STATE = `
    <div class="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm text-center space-y-space-sm">
      <span class="material-symbols-outlined text-4xl text-outline">filter_alt_off</span>
      <p class="font-title-md text-title-md text-on-surface">No objectives match these filters</p>
      <button type="button" class="font-title-sm text-title-sm text-primary hover:underline" data-clear-filters>Clear filters</button>
    </div>`;

  const ERROR_STATE = `
    <div class="bg-error-container rounded-xl p-space-lg text-on-error-container font-body-md text-body-md">
      Objectives could not be loaded. Refresh the page to try again.
    </div>`;

  AIS.definePage("dashboard", async (main) => {
    const list = main.querySelector("[data-objectives-list]");
    const state = { department: "all", status: "all", collapsed: new Set(), visibleIds: [] };

    let objectives;
    try {
      ({ objectives } = await AIS.data.load("objectives"));
    } catch (error) {
      console.error(error);
      list.innerHTML = ERROR_STATE;
      return;
    }
    if (!main.isConnected) return; // navigated away while loading

    function inDepartment(objective) {
      return state.department === "all" || objective.department === state.department;
    }

    function render() {
      const departmentObjectives = objectives.filter(inDepartment);
      const visible = departmentObjectives.filter(
        (objective) => state.status === "all" || statusGroup(objective.status) === state.status
      );

      list.innerHTML = visible.length
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
        button.classList.toggle(STATUS_ACTIVE[0], isActive);
        button.classList.toggle(STATUS_ACTIVE[1], isActive);
        button.setAttribute("aria-pressed", String(isActive));
        const count = departmentObjectives.filter(
          (objective) => status === "all" || statusGroup(objective.status) === status
        ).length;
        button.querySelector("[data-status-count]").textContent = count;
      });

      main.querySelector("[data-shown-count]").textContent = `${visible.length} of ${objectives.length} Shown`;
      main.querySelector('[data-stat="objectives"]').textContent = objectives.length;
      main.querySelector('[data-stat="key-results"]').textContent = objectives.reduce(
        (total, objective) => total + objective.keyResults.length,
        0
      );

      state.visibleIds = visible.map((objective) => objective.id);
      const allExpanded = state.visibleIds.every((id) => !state.collapsed.has(id));
      main.querySelector("[data-expand-all-label]").textContent = allExpanded ? "Collapse All KRs" : "Expand All KRs";
      main.querySelector("[data-expand-all]").classList.toggle("invisible", !visible.length);
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
      if (objective && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggleObjective(objective.dataset.toggleObjective);
      }
    });

    render();
  });
})();
