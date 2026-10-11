// Behaviour and helpers shared by every page.

// Escapes a value for safe use inside HTML built with template strings.
AIS.escape = function (value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => entities[char]);
};

// Short confirmation message, bottom-right, with an optional follow-up link.
//   AIS.toast("Objective added.", { actionLabel: "View on dashboard", href: "index.html" });
//   AIS.toast("Something went wrong.", { tone: "error" });
AIS.toast = function (message, { actionLabel = "", href = "", tone = "success" } = {}) {
  let region = document.querySelector(".ais-toasts");
  if (!region) {
    region = document.createElement("div");
    region.className = "ais-toasts";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }

  const toast = document.createElement("div");
  toast.className =
    "flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg bg-inverse-surface text-inverse-on-surface font-body-md text-body-md";
  toast.innerHTML = `
    <span class="material-symbols-outlined ${tone === "error" ? "text-error-container" : tone === "info" ? "text-inverse-primary" : "text-tertiary-fixed-dim"}">${tone === "error" ? "error" : tone === "info" ? "hourglass_top" : "check_circle"}</span>
    <span class="flex-1">${AIS.escape(message)}</span>
    ${href ? `<a href="${AIS.escape(href)}" class="shrink-0 font-title-sm text-title-sm text-inverse-primary hover:underline">${AIS.escape(actionLabel)}</a>` : ""}
    <button type="button" class="shrink-0 p-1 rounded-lg hover:bg-white/10" aria-label="Dismiss"><span class="material-symbols-outlined text-base">close</span></button>`;
  region.appendChild(toast);

  const dismiss = () => toast.remove();
  toast.querySelector("button").addEventListener("click", dismiss);
  const link = toast.querySelector("a");
  if (link) link.addEventListener("click", dismiss);
  setTimeout(dismiss, 7000);
};

// Any [data-add-objective] element opens the "New objective" form (objective-form.js).
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-add-objective]");
  if (trigger) AIS.objectiveForm.open({ trigger });
});

// Runs once the layout partials are in place.
AIS.layoutReady.then(() => {
  initMobileSidebar();
  initCurrentYear();
  initUserMenu();
  initWorkspaceSwitcher();
});

const initialsOf = (text) =>
  String(text || "")
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

// Header: signed-in user's name/email/initials and the Sign out menu.
function initUserMenu() {
  const root = document.querySelector("[data-user-menu]");
  if (!root || !(AIS.auth && AIS.auth.user())) return;

  function fill() {
    const user = AIS.auth.user();
    // Full name from the profile, or a name made from the email for older accounts.
    const name = AIS.auth.displayName();
    root.querySelector("[data-user-initials]").textContent = initialsOf(name) || "?";
    root.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = name));
    root.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = user.email || ""));
    root.querySelector("[data-user-phone]").textContent = user.phone || "";
    root.querySelector("[data-user-phone-row]").classList.toggle("hidden", !user.phone);
  }
  fill();
  // Settings saved a new name or phone.
  document.addEventListener("profile:change", fill);

  // The profile may have changed since sign-in (e.g. on another device).
  if (!AIS.auth.isDemo() && AIS.api) {
    AIS.api
      .get("/me")
      .then((me) => {
        AIS.auth.updateUser({ fullName: me.fullName || "", phone: me.phone || "", email: me.email || AIS.auth.user().email });
        fill();
      })
      .catch(() => {}); // keep what the session has
  }

  const toggle = root.querySelector("[data-user-menu-toggle]");
  const menu = root.querySelector('[role="menu"]');
  const setOpen = (isOpen) => {
    menu.classList.toggle("hidden", !isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) menu.querySelector('[role="menuitem"]').focus();
  };

  toggle.addEventListener("click", () => setOpen(menu.classList.contains("hidden")));
  root.querySelector("[data-sign-out]").addEventListener("click", () => AIS.auth.signOut());
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.classList.contains("hidden")) {
      setOpen(false);
      toggle.focus();
    }
  });
}

// Sidebar: current workspace, a list to switch, and "New workspace".
function initWorkspaceSwitcher() {
  const root = document.querySelector("[data-workspace-switcher]");
  if (!root || !AIS.workspace) return;
  const toggle = root.querySelector("[data-workspace-toggle]");
  const menu = root.querySelector("[data-workspace-menu]");
  const list = root.querySelector("[data-workspace-list]");
  const form = root.querySelector("[data-workspace-create]");
  const ROLE = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer (read only)" };

  const setOpen = (isOpen) => {
    menu.classList.toggle("hidden", !isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  };

  async function fill() {
    let workspaces;
    let current;
    try {
      [workspaces, current] = await Promise.all([AIS.workspace.list(), AIS.workspace.current()]);
    } catch (error) {
      root.querySelector("[data-workspace-name]").textContent = "Workspaces unavailable";
      root.querySelector("[data-workspace-role]").textContent = error.message;
      return;
    }
    if (!current) {
      root.querySelector("[data-workspace-name]").textContent = "No workspace yet";
      root.querySelector("[data-workspace-role]").textContent = "Create one below";
    } else {
      root.querySelector("[data-workspace-initials]").textContent = initialsOf(current.name) || "W";
      root.querySelector("[data-workspace-name]").textContent = current.name;
      root.querySelector("[data-workspace-role]").textContent = ROLE[current.role] || current.role;
    }

    list.innerHTML = workspaces
      .map((workspace) => {
        const isCurrent = current && workspace.id === current.id;
        return `
          <button type="button" role="menuitemradio" aria-checked="${isCurrent}" data-workspace-id="${AIS.escape(workspace.id)}"
            class="w-full flex items-center gap-2 px-space-sm py-2 rounded-lg text-left hover:bg-surface-container-high ${isCurrent ? "bg-surface-container" : ""}">
            <span class="w-6 h-6 rounded-md bg-primary-container text-on-primary flex items-center justify-center text-[10px] font-bold shrink-0">${AIS.escape(initialsOf(workspace.name) || "W")}</span>
            <span class="min-w-0 flex-1">
              <span class="block font-body-sm text-body-sm text-on-surface font-medium truncate">${AIS.escape(workspace.name)}</span>
              <span class="block text-[11px] text-on-surface-variant">${AIS.escape(ROLE[workspace.role] || workspace.role)}</span>
            </span>
            ${isCurrent ? '<span class="material-symbols-outlined text-base text-primary">check</span>' : ""}
          </button>`;
      })
      .join("");
    // The demo session has a single fake workspace: nothing to create.
    form.classList.toggle("hidden", AIS.auth.isDemo());
  }

  toggle.addEventListener("click", () => setOpen(menu.classList.contains("hidden")));
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-workspace-id]");
    if (!item || item.getAttribute("aria-checked") === "true") return setOpen(false);
    AIS.workspace.select(item.dataset.workspaceId);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    const button = form.querySelector("button");
    const name = input.value.trim();
    if (!name) return input.focus();
    button.disabled = true;
    button.textContent = "Adding…";
    try {
      const workspace = await AIS.workspace.create(name);
      AIS.workspace.select(workspace.id);
    } catch (error) {
      AIS.toast(`Couldn't create the workspace. ${error.message}`, { tone: "error" });
      button.disabled = false;
      button.textContent = "Add";
    }
  });
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.classList.contains("hidden")) {
      setOpen(false);
      toggle.focus();
    }
  });

  fill();
}

function initMobileSidebar() {
  const openButton = document.querySelector("[data-sidebar-open]");

  function setOpen(isOpen) {
    document.body.classList.toggle("sidebar-open", isOpen);
    if (openButton) openButton.setAttribute("aria-expanded", String(isOpen));
  }

  if (openButton) openButton.addEventListener("click", () => setOpen(true));

  document.querySelectorAll("[data-sidebar-close]").forEach((el) => {
    el.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });

  // Close the drawer after a client-side page change (see router.js).
  document.addEventListener("page:change", () => setOpen(false));
}

function initCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
}
