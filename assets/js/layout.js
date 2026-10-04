// Injects shared partials (sidebar, header, footer) into each page.
//
// Usage on a page:
//   <body data-page="dashboard">
//     <div data-include="sidebar"></div>
//   ...
//
// Other scripts wait for the layout with:
//   AIS.layoutReady.then(() => { ... });
//
// Partials are loaded with fetch(), so pages must be served over http
// (e.g. VS Code Live Server or `npx serve`), not opened from disk.
(function () {
  const PARTIALS_DIR = "partials/";

  async function loadPartial(placeholder) {
    const name = placeholder.dataset.include;
    try {
      const response = await fetch(PARTIALS_DIR + name + ".html");
      if (!response.ok) throw new Error(response.status + " " + response.statusText);
      const template = document.createElement("template");
      template.innerHTML = (await response.text()).trim();
      placeholder.replaceWith(template.content);
    } catch (error) {
      console.error(
        `[layout] Could not load partial "${name}". ` +
          "If you opened the file directly, serve the project over http instead.",
        error
      );
    }
  }

  // Highlights the nav link whose data-page matches `page`. Safe to call again
  // after client-side navigation (see router.js).
  function setActiveNav(page) {
    document.querySelectorAll("nav[data-active-classes]").forEach((nav) => {
      const active = nav.dataset.activeClasses.split(" ");
      const inactive = (nav.dataset.inactiveClasses || "").split(" ").filter(Boolean);

      nav.querySelectorAll("a[data-page]").forEach((link) => {
        const isActive = link.dataset.page === page;
        link.classList.remove(...active, ...inactive);
        link.classList.add(...(isActive ? active : inactive));
        if (isActive) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    });
  }

  const placeholders = document.querySelectorAll("[data-include]");

  window.AIS = window.AIS || {};
  window.AIS.setActiveNav = setActiveNav;
  window.AIS.layoutReady = Promise.all([...placeholders].map(loadPartial)).then(() => {
    setActiveNav(document.body.dataset.page);
    document.dispatchEvent(new CustomEvent("layout:ready"));
  });
})();
