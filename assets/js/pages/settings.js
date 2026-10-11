// Settings: your profile (GET/PATCH /me), the current workspace (rename /
// delete) and its members (list, add by email, change role, remove / leave).
// Controls follow your role: admins and owners manage members, owners can
// delete the workspace. In the local demo session nothing is sent to the API.
(function () {
  const esc = AIS.escape;

  const INPUT =
    "w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container/40 disabled:opacity-60";
  const LABEL = "block mb-1 font-label-md text-label-md text-on-surface-variant";
  const PRIMARY =
    "h-10 px-space-md rounded-lg bg-primary-container hover:bg-primary text-on-primary font-title-sm text-title-sm shadow-sm transition-colors disabled:opacity-60 disabled:cursor-wait";
  const SECONDARY =
    "h-10 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-title-sm text-title-sm transition-colors";
  const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer (read only)" };
  const ADDABLE_ROLES = ["admin", "member", "viewer"];

  const normalizePhone = (value) => value.trim().replace(/[\s().-]/g, "");
  const isValidPhone = (value) => /^\+?\d{7,15}$/.test(value);
  const initials = (text) =>
    String(text || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?";

  function heading(id, title, description) {
    return `
      <div class="mb-space-md">
        <h2 id="${id}" class="font-headline-sm text-headline-sm text-on-surface">${title}</h2>
        ${description ? `<p class="font-body-sm text-body-sm text-on-surface-variant">${description}</p>` : ""}
      </div>`;
  }

  function errorText(id, message) {
    return message ? `<p class="mt-1 font-label-sm text-label-sm text-error" id="${id}">${esc(message)}</p>` : "";
  }

  AIS.definePage("settings", async (main) => {
    const profileEl = main.querySelector("[data-settings-profile]");
    const workspaceEl = main.querySelector("[data-settings-workspace]");
    const membersEl = main.querySelector("[data-settings-members]");
    const demo = AIS.auth.isDemo();
    const me = { ...AIS.auth.user() };

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
        ${heading("profile-heading", "Your profile", "Shown in the header and as the default owner of what you create.")}
        <form class="grid sm:grid-cols-2 gap-space-md" novalidate data-profile-form>
          ${field("fullName", "Full name", "text", me.fullName || "", 'autocomplete="name" maxlength="80"')}
          ${field("phone", "Phone number", "tel", me.phone || "", 'autocomplete="tel" maxlength="20" placeholder="+234 803 123 4567"')}
          <div class="sm:col-span-2">
            <span class="${LABEL}">Email</span>
            <p class="h-10 px-3 flex items-center rounded-lg bg-surface-container font-body-md text-body-md text-on-surface-variant">${esc(me.email || "")}</p>
          </div>
          <div class="sm:col-span-2 flex items-center gap-space-sm">
            <button type="submit" class="${PRIMARY}" ${profile.saving ? "disabled" : ""}>${profile.saving ? "Saving…" : "Save profile"}</button>
          </div>
        </form>`;
    }

    profileEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (profile.saving) return;
      const form = event.target;
      const fullName = form.fullName.value.trim().replace(/\s+/g, " ");
      const phone = normalizePhone(form.phone.value);
      profile.errors = {};
      if (fullName.length < 2) profile.errors.fullName = "Enter your full name.";
      if (!isValidPhone(phone)) profile.errors.phone = "Enter a valid phone number with country code, e.g. +234 803 123 4567.";
      me.fullName = form.fullName.value;
      me.phone = form.phone.value;
      if (Object.keys(profile.errors).length) {
        renderProfile();
        profileEl.querySelector('[aria-invalid="true"]').focus();
        return;
      }

      profile.saving = true;
      renderProfile();
      try {
        const saved = demo ? { fullName, phone, email: me.email } : await AIS.api.patch("/me", { fullName, phone });
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
      workspaceEl.innerHTML = `${heading("workspace-heading", "Workspace")}<p class="font-body-sm text-body-sm text-error" role="alert">${esc(error.message)}</p>`;
      membersEl.remove();
      return;
    }
    if (!main.isConnected) return;
    if (!workspace) {
      workspaceEl.innerHTML = `${heading("workspace-heading", "Workspace")}<p class="font-body-sm text-body-sm text-on-surface-variant">You don't belong to a workspace yet. Create one from the workspace menu in the sidebar.</p>`;
      membersEl.remove();
      return;
    }

    const isAdmin = AIS.workspace.isAdmin(workspace.role);
    const isOwner = workspace.role === "owner";
    const ws = { saving: false, error: "", confirmDelete: false, deleting: false };

    function renderWorkspace() {
      workspaceEl.innerHTML = `
        ${heading("workspace-heading", "Workspace", `Objectives, milestones and checklists belong to a workspace. Your role here: <strong class="text-on-surface">${esc(ROLE_LABELS[workspace.role] || workspace.role)}</strong>.`)}
        ${
          isAdmin
            ? `<form class="flex flex-col sm:flex-row sm:items-end gap-space-sm" novalidate data-workspace-form>
                <div class="flex-1">
                  <label class="${LABEL}" for="workspace-name">Name</label>
                  <input id="workspace-name" name="name" class="${INPUT}" maxlength="80" value="${esc(workspace.name)}" ${ws.error ? 'aria-invalid="true" aria-describedby="workspace-name-error"' : ""} ${demo ? "disabled" : ""} />
                  ${errorText("workspace-name-error", ws.error)}
                </div>
                <button type="submit" class="${PRIMARY}" ${ws.saving || demo ? "disabled" : ""}>${ws.saving ? "Saving…" : "Rename"}</button>
              </form>`
            : `<p class="font-title-md text-title-md text-on-surface">${esc(workspace.name)}</p>`
        }
        ${
          isOwner
            ? `<div class="mt-space-lg pt-space-md border-t border-outline-variant/40">
                ${
                  ws.confirmDelete
                    ? `<div class="p-space-sm rounded-lg bg-error-container text-on-error-container space-y-2" role="alert">
                        <p class="font-body-sm text-body-sm"><strong>Delete “${esc(workspace.name)}”</strong> and all of its objectives, milestones and checklists for every member? This can't be undone.</p>
                        <div class="flex gap-2">
                          <button type="button" class="h-9 px-space-md rounded-lg bg-error text-on-error font-title-sm text-title-sm disabled:opacity-60" data-delete-workspace-confirm ${ws.deleting ? "disabled" : ""}>${ws.deleting ? "Deleting…" : "Delete workspace"}</button>
                          <button type="button" class="${SECONDARY} h-9" data-delete-workspace-cancel>Cancel</button>
                        </div>
                      </div>`
                    : `<button type="button" class="inline-flex items-center gap-1 font-title-sm text-title-sm text-error hover:underline disabled:opacity-60" data-delete-workspace ${demo ? "disabled" : ""}>
                        <span class="material-symbols-outlined text-lg">delete</span>Delete this workspace
                      </button>`
                }
              </div>`
            : ""
        }
        ${demo ? `<p class="mt-space-sm font-label-sm text-label-sm text-on-surface-variant">Demo mode: workspace changes aren't available.</p>` : ""}`;
    }

    workspaceEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = event.target.name.value.trim();
      ws.error = name ? "" : "Enter a name.";
      if (ws.error || name === workspace.name) return renderWorkspace();
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
      if (event.target.closest("[data-delete-workspace]")) {
        ws.confirmDelete = true;
        renderWorkspace();
        workspaceEl.querySelector("[data-delete-workspace-confirm]").focus();
      } else if (event.target.closest("[data-delete-workspace-cancel]")) {
        ws.confirmDelete = false;
        renderWorkspace();
      } else if (event.target.closest("[data-delete-workspace-confirm]")) {
        ws.deleting = true;
        renderWorkspace();
        try {
          await AIS.workspace.remove(workspace.id);
          location.replace("index.html"); // continues in your next workspace
        } catch (error) {
          ws.deleting = false;
          ws.confirmDelete = false;
          renderWorkspace();
          AIS.toast(`Couldn't delete the workspace. ${error.message}`, { tone: "error" });
        }
      }
    });

    renderWorkspace();

    // ---- Members ---------------------------------------------------------

    const team = { members: null, error: "", adding: false, addError: "", busy: new Set() };

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
      const name = member.fullName || member.email || "Member";
      const busy = team.busy.has(member.userId);
      const roleControl =
        isAdmin && !demo
          ? `<select class="h-9 px-2 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface" aria-label="Role for ${esc(name)}" data-member-role="${esc(member.userId)}" ${busy ? "disabled" : ""}>
              ${Object.entries(ROLE_LABELS)
                .map(([value, label]) => `<option value="${value}" ${member.role === value ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select>`
          : `<span class="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface">${esc(ROLE_LABELS[member.role] || member.role)}</span>`;
      const removeControl = demo
        ? ""
        : isMe
          ? `<button type="button" class="font-label-md text-label-md text-error hover:underline disabled:opacity-60" data-member-remove="${esc(member.userId)}" data-self ${busy ? "disabled" : ""}>Leave</button>`
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

    function renderMembers() {
      const list = team.members
        ? `<ul class="divide-y divide-outline-variant/40">${team.members.map(memberRow).join("")}</ul>`
        : team.error
          ? `<p class="font-body-sm text-body-sm text-error" role="alert">Members could not be loaded. ${esc(team.error)}</p>`
          : `<p class="font-body-sm text-body-sm text-on-surface-variant">Loading members…</p>`;
      const addForm =
        isAdmin && !demo
          ? `<form class="mt-space-md pt-space-md border-t border-outline-variant/40 grid sm:grid-cols-[1fr_auto_auto] gap-space-sm items-end" novalidate data-member-add>
              <div>
                <label class="${LABEL}" for="member-email">Add someone by email</label>
                <input id="member-email" name="email" type="email" class="${INPUT}" placeholder="colleague@company.com" autocomplete="off"
                  ${team.addError ? 'aria-invalid="true" aria-describedby="member-email-error"' : ""} />
                ${errorText("member-email-error", team.addError)}
              </div>
              <div>
                <label class="${LABEL}" for="member-role">Role</label>
                <select id="member-role" name="role" class="${INPUT}">
                  ${ADDABLE_ROLES.map((role) => `<option value="${role}" ${role === "member" ? "selected" : ""}>${ROLE_LABELS[role]}</option>`).join("")}
                </select>
              </div>
              <button type="submit" class="${PRIMARY}" ${team.adding ? "disabled" : ""}>${team.adding ? "Adding…" : "Add member"}</button>
              <p class="sm:col-span-3 font-label-sm text-label-sm text-on-surface-variant">They need an Africa Ignite Systems account first.</p>
            </form>`
          : "";
      const count = team.members ? team.members.length : 0;
      membersEl.innerHTML = `
        ${heading("members-heading", `Members${count ? ` (${count})` : ""}`, isAdmin ? "Add people, change what they can do, or remove them." : "People who can see this workspace.")}
        ${list}
        ${addForm}`;
    }

    membersEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      const email = form.email.value.trim();
      team.addError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Enter a valid email address.";
      if (team.addError) {
        renderMembers();
        return membersEl.querySelector("#member-email").focus();
      }
      team.adding = true;
      renderMembers();
      try {
        await AIS.api.post(`/workspaces/${workspace.id}/members`, { email, role: form.role.value });
        AIS.toast(`${email} added.`);
        team.adding = false;
        await loadMembers();
        return;
      } catch (error) {
        team.addError = (error.fields && error.fields.email) || error.message;
      }
      team.adding = false;
      renderMembers();
      const input = membersEl.querySelector("#member-email");
      input.value = email;
      input.focus();
    });

    membersEl.addEventListener("change", async (event) => {
      const select = event.target.closest("[data-member-role]");
      if (!select) return;
      const userId = select.dataset.memberRole;
      const member = team.members.find((item) => item.userId === userId);
      team.busy.add(userId);
      renderMembers();
      try {
        await AIS.api.patch(`/workspaces/${workspace.id}/members/${userId}`, { role: select.value });
        AIS.toast(`${member.fullName || member.email} is now ${ROLE_LABELS[select.value]}.`);
        team.busy.delete(userId);
        await loadMembers();
        if (userId === me.id) location.reload(); // your own role changed: refresh what you can do
      } catch (error) {
        team.busy.delete(userId);
        renderMembers(); // the select shows the unchanged role again
        AIS.toast(`Couldn't change the role. ${error.message}`, { tone: "error" });
      }
    });

    membersEl.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-member-remove]");
      if (!button) return;
      const userId = button.dataset.memberRemove;
      const isSelf = button.hasAttribute("data-self");
      const member = team.members.find((item) => item.userId === userId);
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
        AIS.toast(`${member.fullName || member.email} removed.`);
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
