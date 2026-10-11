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
    <span class="material-symbols-outlined ${tone === "error" ? "text-error-container" : "text-tertiary-fixed-dim"}">${tone === "error" ? "error" : "check_circle"}</span>
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
});

// Header: signed-in user's name/email/initials and the Sign out menu.
function initUserMenu() {
  const root = document.querySelector("[data-user-menu]");
  const user = AIS.auth && AIS.auth.user();
  if (!root || !user) return;

  // "ada.obi@company.com" → "Ada Obi"
  const name = String(user.email || "Signed in")
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  root.querySelector("[data-user-initials]").textContent = initials || "?";
  root.querySelector("[data-user-name]").textContent = name;
  root.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = user.email || ""));

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
