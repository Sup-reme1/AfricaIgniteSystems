// Confirmation dialog shared by all pages (instead of window.confirm, which
// blocks the screenshot tool and can't be styled).
//
//   if (!(await AIS.confirm({ title: "Remove Ada?", message: "…", confirmLabel: "Remove", tone: "danger" }))) return;
//
// Resolves true (confirmed) or false (Cancel, Esc, or a click outside).
// Danger dialogs focus Cancel first, so pressing Enter can't destroy anything.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  let current = null;

  AIS.confirm = function ({ title, message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "primary" } = {}) {
    if (current) current.finish(false);
    const esc = AIS.escape;
    const danger = tone === "danger";

    return new Promise((resolve) => {
      const trigger = document.activeElement;
      const root = document.createElement("div");
      root.className = "fixed inset-0 z-[80] flex items-center justify-center p-space-md bg-inverse-surface/40";
      root.innerHTML = `
        <div role="alertdialog" aria-modal="true" aria-labelledby="ais-confirm-title" ${message ? 'aria-describedby="ais-confirm-message"' : ""}
          class="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-xl p-space-lg space-y-space-lg">
          <div class="flex items-start gap-space-md">
            <span class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${danger ? "bg-error-container text-error" : "bg-primary-fixed text-primary"}">
              <span class="material-symbols-outlined">${danger ? "warning" : "help"}</span>
            </span>
            <div class="min-w-0 pt-1">
              <h2 id="ais-confirm-title" class="font-title-md text-title-md text-on-surface">${esc(title)}</h2>
              ${message ? `<p id="ais-confirm-message" class="mt-1 font-body-sm text-body-sm text-on-surface-variant">${esc(message)}</p>` : ""}
            </div>
          </div>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" class="h-10 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-title-sm text-title-sm transition-colors" data-confirm-cancel>${esc(cancelLabel)}</button>
            <button type="button" class="h-10 px-space-md rounded-lg font-title-sm text-title-sm shadow-sm transition-colors ${danger ? "bg-error hover:bg-on-error-container text-on-error" : "bg-primary-container hover:bg-primary text-on-primary"}" data-confirm-ok>${esc(confirmLabel)}</button>
          </div>
        </div>`;

      function finish(value) {
        if (!root.isConnected) return;
        root.remove();
        document.removeEventListener("keydown", onKey, true);
        current = null;
        if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
        resolve(value);
      }

      function onKey(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation(); // don't also close panels/menus underneath
          finish(false);
        } else if (event.key === "Tab") {
          const buttons = [...root.querySelectorAll("button")];
          const index = buttons.indexOf(document.activeElement);
          event.preventDefault();
          buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
        }
      }

      root.addEventListener("click", (event) => {
        if (event.target === root || event.target.closest("[data-confirm-cancel]")) finish(false);
        else if (event.target.closest("[data-confirm-ok]")) finish(true);
      });
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(root);
      current = { finish };
      root.querySelector(danger ? "[data-confirm-cancel]" : "[data-confirm-ok]").focus();
    });
  };
})();
