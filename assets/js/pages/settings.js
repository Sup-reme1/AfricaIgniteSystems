// Settings: three accordion sections —
//   Profile    GET/PATCH /me
//   Workspace  rename (admins) / delete (owners)
//   Members    list, add (person search over GET /workspaces/:id/users), change role,
//              remove (admins), leave
// Every action asks for confirmation first (AIS.confirm). Controls follow your
// role. In the local demo session nothing is sent to the API.
(function () {
  const esc = AIS.escape;

  const INPUT =
    "w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container/40 disabled:opacity-60 disabled:cursor-not-allowed";
  const LABEL = "block mb-1 font-label-md text-label-md text-on-surface-variant";
  const PRIMARY =
    "h-10 px-space-md rounded-lg bg-primary-container hover:bg-primary text-on-primary font-title-sm text-title-sm shadow-sm transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed";
  const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer (read only)" };
  const ROLE_MEANING = {
    owner: "Owners can do everything, including deleting the workspace.",
    admin: "Admins can edit everything and manage members.",
    member: "Members can view and edit objectives, milestones and checklists.",
    viewer: "Viewers can see everything but can't change anything.",
  };
  const ADDABLE_ROLES = ["admin", "member", "viewer"];
  const OPEN_KEY = "ais:settings:open";
  const MIN_QUERY = 2;
  const MAX_RESULTS = 8;

  const normalizePhone = (value) => value.trim().replace(/[\s().-]/g, "");
  const isValidPhone = (value) => /^\+?\d{7,15}$/.test(value);
  const isEmail = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  const initials = (text) =>
    String(text || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?";
  const errorText = (id, message) =>
    message ? `<p class="mt-1 font-label-sm text-label-sm text-error" id="${id}">${esc(message)}</p>` : "";

  // ---- Accordion ------------------------------------------------------------

  function readOpen() {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY));
      return Array.isArray(saved) ? saved : ["profile"];
    } catch {
      return ["profile"];
    }
  }

  function initAccordion(main) {
    const open = new Set(readOpen());
    const sections = [...main.querySelectorAll("[data-accordion-section]")];

    function apply(section, isOpen) {
      const toggle = section.querySelector("[data-accordion-toggle]");
      const panel = main.querySelector(`#${toggle.getAttribute("aria-controls")}`);
      toggle.setAttribute("aria-expanded", String(isOpen));
      panel.hidden = !isOpen;
      section.querySelector("[data-accordion-icon]").classList.toggle("rotate-180", isOpen);
    }

    sections.forEach((section) => apply(section, open.has(section.dataset.accordionSection)));
    main.querySelector("[data-settings-accordion]").addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-accordion-toggle]");
      if (!toggle) return;
      const section = toggle.closest("[data-accordion-section]");
      const name = section.dataset.accordionSection;
      const isOpen = toggle.getAttribute("aria-expanded") !== "true";
      apply(section, isOpen);
      if (isOpen) open.add(name);
      else open.delete(name);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
      } catch {
        // remembered for this visit only
      }
    });
  }

  const setSummary = (main, name, text) => {
    const el = main.querySelector(`[data-accordion-section="${name}"] [data-accordion-summary]`);
    if (el) el.textContent = text;
  };

  // ---- Page -----------------------------------------------------------------

  AIS.definePage("settings", async (main) => {
    const profileEl = main.querySelector("[data-settings-profile]");
    const workspaceEl = main.querySelector("[data-settings-workspace]");
    const membersEl = main.querySelector("[data-settings-members]");
    const demo = AIS.auth.isDemo();
    const me = { ...AIS.auth.user() };

    initAccordion(main);

    // ---- Profile ---------------------------------------------------------

    const profile = { errors: {}, saving: false };

    function renderProfile() {
      const field = (name, label, type, value, extra = "") => `
        <div>
          <label class="${LABEL}" for="profile-${name}">${label}</label>
          <input id="profile-${name}" name="${name}" type="${type}" class="${INPUT}" value="${esc(value)}" ${extra}
            ${profile.errors[name] ? `aria-invalid="true" aria-describedby="profile-${name}-error"` : ""} />
          ${errorText(`profile-${name}-error`, profile.errors[name])}
        </div>`;
      profileEl.innerHTML = `
        <form class="grid sm:grid-cols-2 gap-space-md" novalidate data-profile-form>
          ${field("fullName", "Full name", "text", me.fullName || "", 'autocomplete="name" maxlength="80"')}
          ${field("phone", "Phone number", "tel", me.phone || "", 'autocomplete="tel" maxlength="20" placeholder="+234 803 123 4567"')}
          <div class="sm:col-span-2">
            <span class="${LABEL}">Email</span>
            <p class="h-10 px-3 flex items-center rounded-lg bg-surface-container font-body-md text-body-md text-on-surface-variant">${esc(me.email || "")}</p>
          </div>
          <div class="sm:col-span-2">
            <button type="submit" class="${PRIMARY}" ${profile.saving ? "disabled" : ""}>${profile.saving ? "Saving…" : "Save profile"}</button>
          </div>
        </form>`;
      setSummary(main, "profile", [me.fullName, me.email].filter(Boolean).join(" · ") || "Name, phone and email");
    }

    profileEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (profile.saving) return;
      const fields = event.target.elements;
      const fullName = fields.namedItem("fullName").value.trim().replace(/\s+/g, " ");
      const phone = normalizePhone(fields.namedItem("phone").value);
      profile.errors = {};
      if (fullName.length < 2) profile.errors.fullName = "Enter your full name.";
      if (!isValidPhone(phone)) profile.errors.phone = "Enter a valid phone number with country code, e.g. +234 803 123 4567.";
      if (Object.keys(profile.errors).length) {
        Object.assign(me, { fullName: fields.namedItem("fullName").value, phone: fields.namedItem("phone").value });
        renderProfile();
        profileEl.querySelector('[aria-invalid="true"]').focus();
        return;
      }

      const confirmed = await AIS.confirm({
        title: "Save your profile?",
        message: `Your name will show as “${fullName}” and your phone as ${phone} across the portal.`,
        confirmLabel: "Save profile",
      });
      if (!confirmed) return;

      profile.saving = true;
      renderProfile();
      try {
        const saved = demo ? { fullName, phone } : await AIS.api.patch("/me", { fullName, phone });
        Object.assign(me, { fullName: saved.fullName || fullName, phone: saved.phone || phone });
        AIS.auth.updateUser({ fullName: me.fullName, phone: me.phone });
        document.dispatchEvent(new CustomEvent("profile:change"));
        AIS.toast("Profile saved.");
      } catch (error) {
        profile.errors = error.fields || {};
        if (!Object.keys(profile.errors).length) AIS.toast(`Couldn't save your profile. ${error.message}`, { tone: "error" });
      }
      profile.saving = false;
      renderProfile();
    });

    renderProfile();
    if (!demo) {
      AIS.api
        .get("/me")
        .then((fresh) => {
          if (!main.isConnected || profile.saving) return;
          Object.assign(me, fresh);
          renderProfile();
        })
        .catch(() => {});
    }

    // ---- Workspace -------------------------------------------------------

    let workspace;
    try {
      workspace = await AIS.workspace.current();
    } catch (error) {
      workspaceEl.innerHTML = `<p class="font-body-sm text-body-sm text-error" role="alert">${esc(error.message)}</p>`;
      membersEl.innerHTML = "";
      return;
    }
    if (!main.isConnected) return;
    if (!workspace) {
      workspaceEl.innerHTML = `<p class="font-body-sm text-body-sm text-on-surface-variant">You don't belong to a workspace yet. Create one from the workspace menu in the sidebar.</p>`;
      membersEl.innerHTML = "";
      return;
    }

    const isAdmin = AIS.workspace.isAdmin(workspace.role);
    const isOwner = workspace.role === "owner";
    const ws = { saving: false, error: "", deleting: false };

    function renderWorkspace() {
      workspaceEl.innerHTML = `
        <p class="mb-space-md font-body-sm text-body-sm text-on-surface-variant">
          Objectives, milestones and checklists belong to a workspace. Your role here: <strong class="text-on-surface">${esc(ROLE_LABELS[workspace.role] || workspace.role)}</strong>.
        </p>
        ${
          isAdmin
            ? `<form class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-space-sm items-end" novalidate data-workspace-form>
                <div>
                  <label class="${LABEL}" for="workspace-name">Name</label>
                  <input id="workspace-name" name="name" class="${INPUT}" maxlength="80" value="${esc(workspace.name)}" ${ws.error ? 'aria-invalid="true" aria-describedby="workspace-name-error"' : ""} ${demo ? "disabled" : ""} />
                </div>
                <button type="submit" class="${PRIMARY}" ${ws.saving || demo ? "disabled" : ""}>${ws.saving ? "Saving…" : "Rename"}</button>
                ${ws.error ? `<div class="sm:col-span-2">${errorText("workspace-name-error", ws.error)}</div>` : ""}
              </form>`
            : `<p class="font-title-md text-title-md text-on-surface">${esc(workspace.name)}</p>`
        }
        ${
          isOwner
            ? `<div class="mt-space-lg pt-space-md border-t border-outline-variant/40 flex flex-wrap items-center justify-between gap-space-sm">
                <div>
                  <div class="font-title-sm text-title-sm text-on-surface">Delete this workspace</div>
                  <div class="font-body-sm text-body-sm text-on-surface-variant">Removes it and everything in it for every member.</div>
                </div>
                <button type="button" class="h-10 px-space-md rounded-lg bg-error-container text-on-error-container hover:bg-error hover:text-on-error font-title-sm text-title-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed" data-delete-workspace ${ws.deleting || demo ? "disabled" : ""}>
                  ${ws.deleting ? "Deleting…" : "Delete workspace"}
                </button>
              </div>`
            : ""
        }
        ${demo ? `<p class="mt-space-sm font-label-sm text-label-sm text-on-surface-variant">Demo mode: workspace changes aren't available.</p>` : ""}`;
      setSummary(main, "workspace", `${workspace.name} · Your role: ${ROLE_LABELS[workspace.role] || workspace.role}`);
    }

    workspaceEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = event.target.elements.namedItem("name").value.trim(); // not form.name (the form's own name)
      ws.error = name ? "" : "Enter a name.";
      if (ws.error) return renderWorkspace();
      if (name === workspace.name) return;

      const confirmed = await AIS.confirm({
        title: "Rename this workspace?",
        message: `“${workspace.name}” will be renamed to “${name}” for every member.`,
        confirmLabel: "Rename",
      });
      if (!confirmed) return;

      ws.saving = true;
      renderWorkspace();
      try {
        const saved = await AIS.workspace.rename(workspace.id, name);
        workspace.name = (saved && saved.name) || name;
        const sidebarName = document.querySelector("[data-workspace-name]");
        if (sidebarName) sidebarName.textContent = workspace.name;
        AIS.toast("Workspace renamed.");
      } catch (error) {
        ws.error = (error.fields && error.fields.name) || error.message;
      }
      ws.saving = false;
      renderWorkspace();
    });

    workspaceEl.addEventListener("click", async (event) => {
      if (!event.target.closest("[data-delete-workspace]")) return;
      const confirmed = await AIS.confirm({
        title: `Delete “${workspace.name}”?`,
        message: "All of its objectives, milestones and checklists will be deleted for every member. This can't be undone.",
        confirmLabel: "Delete workspace",
        tone: "danger",
      });
      if (!confirmed) return;

      ws.deleting = true;
      renderWorkspace();
      try {
        await AIS.workspace.remove(workspace.id);
        location.replace("index.html"); // continues in your next workspace
      } catch (error) {
        ws.deleting = false;
        renderWorkspace();
        AIS.toast(`Couldn't delete the workspace. ${error.message}`, { tone: "error" });
      }
    });

    renderWorkspace();

    // ---- Members ---------------------------------------------------------

    const team = { members: null, error: "", adding: false, addError: "", busy: new Set() };
    // Person search: nothing is listed until 2+ characters, then up to 8 matches.
    const search = { query: "", selected: null, results: [], active: -1, open: false, users: null, loadError: "" };
    const memberIds = () => new Set((team.members || []).map((member) => member.userId));
    const nameOf = (person) => person.fullName || person.email || "this person";

    async function loadMembers() {
      AIS.workspace.forgetMembers(workspace.id);
      try {
        team.members = await AIS.workspace.members(workspace.id);
        team.error = "";
      } catch (error) {
        team.error = error.message;
      }
      if (main.isConnected) renderMembers();
    }

    function memberRow(member) {
      const isMe = member.userId === me.id || (demo && member.userId === "demo");
      const name = nameOf(member);
      const busy = team.busy.has(member.userId);
      const roleControl =
        isAdmin && !demo
          ? `<select class="h-9 px-2 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface disabled:opacity-60" aria-label="Role for ${esc(name)}" data-member-role="${esc(member.userId)}" ${busy ? "disabled" : ""}>
              ${Object.entries(ROLE_LABELS)
                .map(([value, label]) => `<option value="${value}" ${member.role === value ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select>`
          : `<span class="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface">${esc(ROLE_LABELS[member.role] || member.role)}</span>`;
      const removeControl = demo
        ? ""
        : isMe
          ? `<button type="button" class="h-9 px-3 rounded-lg font-label-md text-label-md text-error hover:bg-error-container disabled:opacity-60" data-member-remove="${esc(member.userId)}" data-self ${busy ? "disabled" : ""}>Leave</button>`
          : isAdmin
            ? `<button type="button" class="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container disabled:opacity-60" aria-label="Remove ${esc(name)}" data-member-remove="${esc(member.userId)}" ${busy ? "disabled" : ""}><span class="material-symbols-outlined text-lg">person_remove</span></button>`
            : "";
      return `
        <li class="py-space-sm flex flex-wrap items-center gap-space-sm">
          <span class="w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-label-md text-label-md shrink-0">${esc(initials(name))}</span>
          <span class="min-w-0 flex-1">
            <span class="block font-title-sm text-title-sm text-on-surface truncate">${esc(name)}${isMe ? ' <span class="font-body-sm text-body-sm text-on-surface-variant">(you)</span>' : ""}</span>
            <span class="block font-body-sm text-body-sm text-on-surface-variant truncate">${esc(member.email || "")}</span>
          </span>
          ${roleControl}
          ${removeControl}
        </li>`;
    }

    function addFormHtml() {
      const disabled = demo ? "disabled" : "";
      const value = search.selected ? nameOf(search.selected) : search.query;
      return `
        <form class="mt-space-md pt-space-md border-t border-outline-variant/40" novalidate data-member-add>
          <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_13rem_auto] gap-space-sm items-end">
            <div class="relative">
              <label class="${LABEL}" for="member-search">Add a person</label>
              <div class="relative">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg pointer-events-none">person_search</span>
                <input id="member-search" name="search" type="search" class="${INPUT} pl-10" placeholder="Search by name or email" autocomplete="off"
                  role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="member-results"
                  ${team.addError ? 'aria-invalid="true" aria-describedby="member-add-error"' : ""}
                  value="${esc(value)}" data-member-search ${disabled} />
              </div>
              <div class="hidden absolute left-0 right-0 mt-1 bg-surface-container-lowest rounded-xl shadow-lg ring-1 ring-outline-variant/40 p-space-xs z-20" data-member-dropdown>
                <ul id="member-results" role="listbox" aria-label="Matching people" class="max-h-72 overflow-y-auto" data-member-results></ul>
                <p class="px-space-sm py-2 font-body-sm text-body-sm text-on-surface-variant" role="status" data-member-status></p>
              </div>
            </div>
            <div>
              <label class="${LABEL}" for="member-role">Role</label>
              <select id="member-role" name="role" class="${INPUT}" ${disabled}>
                ${ADDABLE_ROLES.map((role) => `<option value="${role}" ${role === "member" ? "selected" : ""}>${ROLE_LABELS[role]}</option>`).join("")}
              </select>
            </div>
            <button type="submit" class="${PRIMARY}" ${team.adding || demo ? "disabled" : ""}>${team.adding ? "Adding…" : "Add member"}</button>
          </div>
          ${errorText("member-add-error", team.addError)}
          <p class="mt-space-sm font-label-sm text-label-sm text-on-surface-variant">${
            demo ? "Demo mode: adding people isn't available." : "Only people with an Africa Ignite Systems account can be found."
          }</p>
        </form>`;
    }

    function renderMembers() {
      const list = team.members
        ? `<ul class="divide-y divide-outline-variant/40">${team.members.map(memberRow).join("")}</ul>`
        : team.error
          ? `<p class="font-body-sm text-body-sm text-error" role="alert">Members could not be loaded. ${esc(team.error)}</p>`
          : `<p class="font-body-sm text-body-sm text-on-surface-variant">Loading members…</p>`;
      membersEl.innerHTML = `
        <p class="mb-space-sm font-body-sm text-body-sm text-on-surface-variant">${isAdmin ? "Add people, change what they can do, or remove them." : "People who can see this workspace."}</p>
        ${list}
        ${isAdmin ? addFormHtml() : ""}`;
      const count = team.members ? team.members.length : 0;
      setSummary(main, "members", team.members ? `${count} ${count === 1 ? "member" : "members"} in ${workspace.name}` : "Who can access this workspace");
      if (isAdmin) updateSearch();
    }

    // -- Person search (combobox) --

    function loadUsers() {
      if (search.users || search.loadError === "loading") return;
      search.loadError = "loading";
      AIS.workspace
        .users(workspace.id)
        .then((users) => {
          search.users = users || [];
          search.loadError = "";
        })
        .catch((error) => {
          search.users = [];
          search.loadError = error.message;
        })
        .finally(() => {
          if (main.isConnected) updateSearch();
        });
    }

    function highlight(text, query) {
      const value = String(text || "");
      const at = value.toLowerCase().indexOf(query);
      if (!query || at < 0) return esc(value);
      return `${esc(value.slice(0, at))}<mark class="bg-primary-fixed text-on-primary-fixed rounded-sm">${esc(value.slice(at, at + query.length))}</mark>${esc(value.slice(at + query.length))}`;
    }

    // Updates only the dropdown, so typing never loses focus.
    function updateSearch() {
      const input = membersEl.querySelector("[data-member-search]");
      const dropdown = membersEl.querySelector("[data-member-dropdown]");
      if (!input || !dropdown) return;
      const listbox = dropdown.querySelector("[data-member-results]");
      const status = dropdown.querySelector("[data-member-status]");

      const query = search.query.trim().toLowerCase();
      const already = memberIds();
      let message = "";
      search.results = [];

      if (search.selected || query.length < MIN_QUERY) {
        message = "";
      } else if (search.loadError === "loading" || !search.users) {
        message = "Searching…";
      } else if (search.loadError) {
        // No users list (e.g. older API): adding by exact email still works.
        message = isEmail(search.query.trim()) ? "Press Add member to add this email." : "Search isn't available right now. Enter their full email instead.";
      } else {
        search.results = search.users
          .filter((user) => `${user.fullName || ""} ${user.email || ""}`.toLowerCase().includes(query))
          .sort((a, b) => already.has(a.userId) - already.has(b.userId) || String(nameOf(a)).localeCompare(String(nameOf(b))))
          .slice(0, MAX_RESULTS);
        if (!search.results.length) message = `No one matches “${search.query.trim()}”.`;
      }

      if (search.active >= search.results.length) search.active = search.results.length - 1;
      const open = search.open && (search.results.length > 0 || Boolean(message));
      dropdown.classList.toggle("hidden", !open);
      input.setAttribute("aria-expanded", String(open && search.results.length > 0));
      input.removeAttribute("aria-activedescendant");
      if (open && search.active >= 0) input.setAttribute("aria-activedescendant", `member-option-${search.active}`);
      status.textContent = message;
      status.classList.toggle("hidden", !message);

      listbox.innerHTML = search.results
        .map((user, i) => {
          const isMember = already.has(user.userId);
          return `
            <li id="member-option-${i}" role="option" aria-selected="${i === search.active}" aria-disabled="${isMember}"
              class="flex items-center gap-space-sm px-space-sm py-2 rounded-lg ${isMember ? "opacity-60 cursor-default" : "cursor-pointer hover:bg-surface-container-high"} ${i === search.active ? "bg-surface-container-high" : ""}"
              data-member-option="${i}">
              <span class="w-8 h-8 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-label-sm text-label-sm shrink-0">${esc(initials(nameOf(user)))}</span>
              <span class="min-w-0 flex-1">
                <span class="block font-body-sm text-body-sm text-on-surface font-medium truncate">${highlight(user.fullName || "No name", query)}</span>
                <span class="block text-[11px] text-on-surface-variant truncate">${highlight(user.email, query)}</span>
              </span>
              ${isMember ? '<span class="shrink-0 text-[11px] text-on-surface-variant">Already a member</span>' : ""}
            </li>`;
        })
        .join("");
    }

    function choose(index) {
      const user = search.results[index];
      if (!user || memberIds().has(user.userId)) return;
      search.selected = user;
      search.query = nameOf(user);
      search.open = false;
      team.addError = "";
      const input = membersEl.querySelector("[data-member-search]");
      input.value = search.query;
      input.removeAttribute("aria-invalid");
      const error = membersEl.querySelector("#member-add-error");
      if (error) error.remove();
      updateSearch();
      membersEl.querySelector("#member-role").focus();
    }

    membersEl.addEventListener("input", (event) => {
      if (!event.target.matches("[data-member-search]")) return;
      search.query = event.target.value;
      search.selected = null; // typing again starts a new search
      search.open = true;
      search.active = -1;
      if (search.query.trim().length >= MIN_QUERY) loadUsers();
      updateSearch();
    });

    membersEl.addEventListener("keydown", (event) => {
      if (!event.target.matches("[data-member-search]")) return;
      const count = search.results.length;
      if (event.key === "ArrowDown" && count) {
        event.preventDefault();
        search.open = true;
        search.active = (search.active + 1) % count;
        updateSearch();
      } else if (event.key === "ArrowUp" && count) {
        event.preventDefault();
        search.open = true;
        search.active = (search.active - 1 + count) % count;
        updateSearch();
      } else if (event.key === "Enter" && search.open && search.active >= 0) {
        event.preventDefault(); // pick the highlighted person instead of submitting
        choose(search.active);
      } else if (event.key === "Escape" && search.open) {
        event.stopPropagation();
        search.open = false;
        updateSearch();
      }
    });

    membersEl.addEventListener("mousedown", (event) => {
      const option = event.target.closest("[data-member-option]");
      if (!option) return;
      event.preventDefault(); // keep focus in the input
      choose(Number(option.dataset.memberOption));
    });

    membersEl.addEventListener("focusout", (event) => {
      if (!event.target.matches("[data-member-search]")) return;
      search.open = false;
      updateSearch();
    });

    // -- Add --

    membersEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (team.adding) return;
      // form.role would hit the built-in ARIA property, so read fields explicitly.
      const role = event.target.elements.namedItem("role").value;
      const typed = search.query.trim();
      const email = search.selected ? search.selected.email : isEmail(typed) ? typed : "";
      team.addError = email ? "" : typed ? "Choose a person from the list." : "Search for the person to add.";
      if (team.addError) {
        renderMembers();
        return membersEl.querySelector("[data-member-search]").focus();
      }

      const label = search.selected ? nameOf(search.selected) : email;
      const confirmed = await AIS.confirm({
        title: `Add ${label} as ${ROLE_LABELS[role]}?`,
        message: `${ROLE_MEANING[role]} They'll see “${workspace.name}” the next time they open the portal.`,
        confirmLabel: "Add member",
      });
      if (!confirmed) return;

      team.adding = true;
      renderMembers();
      try {
        await AIS.api.post(`/workspaces/${workspace.id}/members`, { email, role });
        AIS.toast(`${label} added.`);
        Object.assign(search, { query: "", selected: null, open: false, active: -1 });
        team.adding = false;
        await loadMembers();
        return;
      } catch (error) {
        team.addError = (error.fields && error.fields.email) || error.message;
      }
      team.adding = false;
      renderMembers();
      membersEl.querySelector("[data-member-search]").focus();
    });

    // -- Change role --

    membersEl.addEventListener("change", async (event) => {
      const select = event.target.closest("[data-member-role]");
      if (!select) return;
      const userId = select.dataset.memberRole;
      const member = team.members.find((item) => item.userId === userId);
      const role = select.value;
      const isMe = userId === me.id;

      const confirmed = await AIS.confirm({
        title: isMe ? `Change your own role to ${ROLE_LABELS[role]}?` : `Make ${nameOf(member)} ${ROLE_LABELS[role]}?`,
        message: `${ROLE_MEANING[role]}${isMe && !["owner", "admin"].includes(role) ? " You'll no longer be able to manage members." : ""}`,
        confirmLabel: "Change role",
        tone: isMe ? "danger" : "primary",
      });
      if (!confirmed) {
        select.value = member.role; // put the old role back
        return;
      }

      team.busy.add(userId);
      renderMembers();
      try {
        await AIS.api.patch(`/workspaces/${workspace.id}/members/${userId}`, { role });
        AIS.toast(`${nameOf(member)} is now ${ROLE_LABELS[role]}.`);
        team.busy.delete(userId);
        await loadMembers();
        if (isMe) location.reload(); // your own role changed: refresh what you can do
      } catch (error) {
        team.busy.delete(userId);
        renderMembers(); // shows the unchanged role again
        AIS.toast(`Couldn't change the role. ${error.message}`, { tone: "error" });
      }
    });

    // -- Remove / leave --

    membersEl.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-member-remove]");
      if (!button) return;
      const userId = button.dataset.memberRemove;
      const isSelf = button.hasAttribute("data-self");
      const member = team.members.find((item) => item.userId === userId);

      const confirmed = await AIS.confirm(
        isSelf
          ? {
              title: `Leave “${workspace.name}”?`,
              message: "You'll lose access to its objectives straight away, until an admin adds you again.",
              confirmLabel: "Leave workspace",
              tone: "danger",
            }
          : {
              title: `Remove ${nameOf(member)}?`,
              message: `They'll lose access to “${workspace.name}” straight away. Their past changes stay in the Audit Log.`,
              confirmLabel: "Remove",
              tone: "danger",
            }
      );
      if (!confirmed) return;

      team.busy.add(userId);
      renderMembers();
      try {
        await AIS.api.del(`/workspaces/${workspace.id}/members/${userId}`);
        if (isSelf) {
          // You left: continue in your next workspace.
          try {
            localStorage.removeItem("ais:workspace");
          } catch {
            // nothing stored
          }
          location.replace("index.html");
          return;
        }
        AIS.toast(`${nameOf(member)} removed.`);
        team.busy.delete(userId);
        await loadMembers();
      } catch (error) {
        team.busy.delete(userId);
        renderMembers();
        AIS.toast(`Couldn't ${isSelf ? "leave the workspace" : "remove them"}. ${error.message}`, { tone: "error" });
      }
    });

    renderMembers();
    loadMembers();
  });
})();
