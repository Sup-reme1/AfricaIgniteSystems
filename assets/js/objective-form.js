// "New objective" form in the right-hand slide-over (AIS.drawer). Any element
// with [data-add-objective] opens it (header button, dashboard; wired in app.js).
//
// Saving adds the objective (top level of the tree) to the shared OKR data, saves
// it, dispatches `okrs:change` ({ action: "created", id }) so open pages update,
// and shows a confirmation toast with a follow-up link.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  const esc = AIS.escape;

  const INPUT =
    "w-full px-3 py-2 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container/40";
  const LABEL = "block mb-1 font-label-md text-label-md text-on-surface-variant";

  async function open({ trigger } = {}) {
    let okrs;
    try {
      okrs = await AIS.okrs.load();
    } catch (error) {
      console.error(error);
      AIS.toast("Objectives could not be loaded. Refresh the page and try again.", { tone: "error" });
      return;
    }

    const { DEPARTMENTS, STATUS_LABELS } = AIS.okrs;
    const draft = {
      code: okrs.nextCode(null),
      title: "",
      description: "",
      department: DEPARTMENTS[0],
      team: "",
      owner: (AIS.auth && AIS.auth.displayName()) || "", // the signed-in person, editable
      status: "on-track",
      targetDate: "",
      expectedPacing: "0",
    };
    const state = { errors: {}, dirty: false, confirmingDiscard: false, saving: false, formError: "" };

    const drawer = AIS.drawer.open({
      title: "New objective",
      trigger,
      beforeClose() {
        if (!state.dirty) return true;
        state.confirmingDiscard = true;
        render();
        drawer.body.querySelector("[data-discard]").focus();
        return false;
      },
    });

    function field(name, label, control, hint = "") {
      const error = state.errors[name];
      return `
        <div>
          <label class="${LABEL}" for="objective-${name}">${label}</label>
          ${control}
          ${hint && !error ? `<p class="mt-1 font-label-sm text-label-sm text-on-surface-variant">${hint}</p>` : ""}
          ${error ? `<p class="mt-1 font-label-sm text-label-sm text-error" id="objective-${name}-error">${esc(error)}</p>` : ""}
        </div>`;
    }

    function attrs(name) {
      const invalid = state.errors[name] ? ` aria-invalid="true" aria-describedby="objective-${name}-error"` : "";
      return `id="objective-${name}" name="${name}" data-field="${name}"${invalid}`;
    }

    function render() {
      const options = (values, selected) =>
        values.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`).join("");

      drawer.body.innerHTML = `
        <form class="flex-1 min-h-0 flex flex-col" novalidate data-objective-form>
          ${
            state.confirmingDiscard
              ? `<div class="m-space-md mb-0 p-space-sm rounded-lg bg-secondary-container text-on-secondary-container font-body-sm text-body-sm" role="alert">
                  <p class="font-semibold">Discard this new objective?</p>
                  <div class="mt-2 flex gap-2">
                    <button type="button" class="px-3 h-8 rounded-lg bg-error text-on-error font-label-md text-label-md" data-discard>Discard</button>
                    <button type="button" class="px-3 h-8 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md" data-keep-editing>Keep editing</button>
                  </div>
                </div>`
              : ""
          }
          ${
            state.formError
              ? `<p class="m-space-md mb-0 p-space-sm rounded-lg bg-error-container text-on-error-container font-body-sm text-body-sm" role="alert">${esc(state.formError)}</p>`
              : ""
          }
          <div class="flex-1 min-h-0 overflow-y-auto p-space-lg space-y-space-md">
            <p class="font-body-sm text-body-sm text-on-surface-variant">
              An objective is the goal at the top of the tree. After saving, use <strong class="text-on-surface">Set up hierarchy</strong> to break it into milestones and checklists.
            </p>
            ${field("title", "Title", `<textarea class="${INPUT}" rows="3" maxlength="160" required placeholder="e.g. Double partner-sourced revenue in East Africa" ${attrs("title")}>${esc(draft.title)}</textarea>`)}
            ${field("description", "Description", `<textarea class="${INPUT}" rows="3" maxlength="500" placeholder="Why this matters and what success looks like" ${attrs("description")}>${esc(draft.description)}</textarea>`)}
            <div class="grid grid-cols-2 gap-space-sm">
              ${field("code", "Label", `<input class="${INPUT}" type="text" maxlength="20" ${attrs("code")} value="${esc(draft.code)}" />`)}
              ${field("department", "Department", `<select class="${INPUT}" ${attrs("department")}>${options(DEPARTMENTS.map((name) => [name, name]), draft.department)}</select>`)}
            </div>
            <div class="grid grid-cols-2 gap-space-sm">
              ${field("owner", "Owner", `<input class="${INPUT}" type="text" maxlength="60" placeholder="e.g. Sarah Lin" ${attrs("owner")} value="${esc(draft.owner)}" />`)}
              ${field("team", "Team", `<input class="${INPUT}" type="text" maxlength="60" placeholder="e.g. AI Product Squad" ${attrs("team")} value="${esc(draft.team)}" />`)}
            </div>
            <div class="grid grid-cols-2 gap-space-sm">
              ${field("status", "Status", `<select class="${INPUT}" ${attrs("status")}>${options(Object.entries(STATUS_LABELS), draft.status)}</select>`)}
              ${field("targetDate", "Target date", `<input class="${INPUT}" type="date" ${attrs("targetDate")} value="${esc(draft.targetDate)}" />`)}
            </div>
            ${field("expectedPacing", "Expected progress by now (%)", `<input class="${INPUT}" type="number" min="0" max="100" step="1" inputmode="numeric" ${attrs("expectedPacing")} value="${esc(draft.expectedPacing)}" />`, "Used to show whether it's ahead or behind.")}
          </div>
          <div class="p-space-md bg-surface-container-low flex gap-2">
            <button type="submit" class="flex-1 h-10 bg-primary-container hover:bg-primary text-on-primary font-title-sm text-title-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-wait" ${state.saving ? "disabled" : ""}>
              ${
                state.saving
                  ? '<span class="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></span><span>Saving…</span>'
                  : '<span class="material-symbols-outlined text-base">check</span><span>Save objective</span>'
              }
            </button>
            <button type="button" class="flex-1 h-10 bg-surface-container-lowest hover:bg-surface-container text-on-surface font-title-sm text-title-sm rounded-lg shadow-sm transition-colors" data-cancel>Cancel</button>
          </div>
        </form>`;
    }

    function showErrors() {
      state.confirmingDiscard = false;
      render();
      const invalid = drawer.body.querySelector('[aria-invalid="true"]');
      if (invalid) invalid.focus();
    }

    async function save() {
      if (state.saving) return;
      state.formError = "";
      state.errors = okrs.validate(draft, 0);
      if (Object.keys(state.errors).length) return showErrors();

      const node = okrs.newNode(null, {
        code: draft.code.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        department: draft.department,
        owner: draft.owner.trim(),
        team: draft.team.trim(),
        status: draft.status,
        targetDate: draft.targetDate,
        expectedPacing: Math.round(Number(draft.expectedPacing)),
      });
      state.saving = true;
      render();
      try {
        await okrs.createNode(node);
      } catch (error) {
        state.saving = false;
        state.errors = AIS.okrs.fieldErrors(error);
        if (!Object.keys(state.errors).length) state.formError = error.message;
        return showErrors();
      }

      drawer.close({ force: true });
      document.dispatchEvent(new CustomEvent("okrs:change", { detail: { action: "created", id: node.id } }));

      const page = document.body.dataset.page;
      const followUp =
        page === "dashboard"
          ? { actionLabel: "Set up hierarchy", href: `objectives.html?focus=${encodeURIComponent(node.id)}` }
          : page === "objectives"
            ? {}
            : { actionLabel: "View on dashboard", href: `index.html?highlight=${encodeURIComponent(node.id)}` };
      AIS.toast(`Objective “${node.title}” added.`, followUp);
    }

    const listen = (type, handler) => drawer.body.addEventListener(type, handler, { signal: drawer.signal });

    listen("input", (event) => {
      const control = event.target.closest("[data-field]");
      if (!control) return;
      draft[control.dataset.field] = control.value;
      state.dirty = true;
    });
    listen("change", (event) => {
      const control = event.target.closest("select[data-field], input[type=date][data-field]");
      if (!control) return;
      draft[control.dataset.field] = control.value;
      state.dirty = true;
    });
    listen("submit", (event) => {
      event.preventDefault();
      save();
    });
    listen("click", (event) => {
      if (event.target.closest("[data-cancel]")) drawer.close();
      else if (event.target.closest("[data-discard]")) drawer.close({ force: true });
      else if (event.target.closest("[data-keep-editing]")) {
        state.confirmingDiscard = false;
        render();
        drawer.body.querySelector("#objective-title").focus();
      }
    });

    render();
    drawer.body.querySelector("#objective-title").focus();
  }

  AIS.objectiveForm = { open };
})();
