// Behaviour shared by every page. Runs once the layout partials are in place.
AIS.layoutReady.then(() => {
  initMobileSidebar();
  initCurrentYear();
});

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
}

function initCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
}
