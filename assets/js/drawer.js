// Right-hand slide-over (modal) shared by all pages.
//
//   const drawer = AIS.drawer.open({
//     title: "New objective",
//     trigger: buttonThatOpenedIt,       // focus returns here on close
//     beforeClose: () => true,           // return false to keep it open (e.g. unsaved form)
//   });
//   drawer.body.innerHTML = "...";       // fill it
//   drawer.signal                        // AbortSignal: aborted on close, for event listeners
//   drawer.close({ force: true });
//
// Esc, the backdrop and the ✕ button ask to close (through beforeClose). Focus
// stays inside the panel while it's open. It closes on client-side page changes.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  let root = null;
  let current = null;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.className = "ais-drawer";
    root.innerHTML = `
      <div class="ais-drawer__backdrop" data-drawer-dismiss></div>
      <section class="ais-drawer__panel bg-surface-container-lowest shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="ais-drawer-title">
        <div class="p-space-lg bg-surface-container-low flex items-center justify-between gap-2">
          <h2 class="font-title-md text-title-md text-on-surface font-semibold" id="ais-drawer-title"></h2>
          <button type="button" class="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" data-drawer-dismiss aria-label="Close">
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div class="flex-1 min-h-0 flex flex-col" data-drawer-body></div>
      </section>`;
    document.body.appendChild(root);

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-drawer-dismiss]")) requestClose();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      } else if (event.key === "Tab") {
        trapFocus(event);
      }
    });
    document.addEventListener("page:change", () => close({ force: true }));
    return root;
  }

  function trapFocus(event) {
    const focusable = [...root.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function requestClose() {
    if (!current) return;
    if (current.beforeClose && current.beforeClose() === false) return;
    close({ force: true });
  }

  function close() {
    if (!current) return;
    const { trigger, controller } = current;
    current = null;
    controller.abort();
    root.classList.remove("is-open");
    document.body.classList.remove("drawer-open");
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  AIS.drawer = {
    open({ title, trigger = document.activeElement, beforeClose = null } = {}) {
      ensureRoot();
      if (current) close();
      const controller = new AbortController();
      current = { trigger, beforeClose, controller };

      root.querySelector("#ais-drawer-title").textContent = title;
      const body = root.querySelector("[data-drawer-body]");
      body.innerHTML = "";
      root.classList.add("is-open");
      document.body.classList.add("drawer-open");

      return {
        body,
        signal: controller.signal,
        close: (options) => (options && options.force ? close() : requestClose()),
      };
    },
    isOpen: () => Boolean(current),
  };
})();
