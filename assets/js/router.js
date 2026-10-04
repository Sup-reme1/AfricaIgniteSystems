// Client-side page transitions.
//
// Links between portal pages are intercepted: the target page is fetched and
// only its <main> is swapped in, so the sidebar, header and footer stay mounted
// (no re-render, scroll/search state kept). Anything unusual (new tab, external
// link, fetch error) falls back to a normal page load.
//
// Page scripts register an init function instead of running at load time:
//
//   AIS.definePage("dashboard", (main) => {
//     ...set up listeners / render inside `main`...
//     return () => { ...optional cleanup when leaving the page... };
//   });
//
// The init runs on a full page load and every time the page is navigated to.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  const pageInits = {};
  const loadedScripts = new Set([...document.scripts].map((script) => script.src).filter(Boolean));
  const prefetched = new Map();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let mounted = null; // { page, cleanup }
  let currentPath = location.pathname + location.search;
  let activeNavigation = null;

  // ---- Page lifecycle -------------------------------------------------------

  AIS.definePage = function (page, init) {
    pageInits[page] = init;
    if (document.body.dataset.page === page) mountPage(page);
  };

  function mountPage(page) {
    const init = pageInits[page];
    if (!init || (mounted && mounted.page === page)) return;

    const record = { page, cleanup: null };
    mounted = record;
    try {
      Promise.resolve(init(document.querySelector("main"))).then((cleanup) => {
        if (typeof cleanup !== "function") return;
        // The page may already have been left while an async init was running.
        if (mounted === record) record.cleanup = cleanup;
        else cleanup();
      }, (error) => console.error(`[router] "${page}" failed to initialise`, error));
    } catch (error) {
      console.error(`[router] "${page}" failed to initialise`, error);
    }
  }

  function unmountPage() {
    if (!mounted) return;
    const { cleanup } = mounted;
    mounted = null;
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        console.error("[router] page cleanup failed", error);
      }
    }
  }

  // ---- Navigation -----------------------------------------------------------

  function fetchPage(url) {
    if (prefetched.has(url)) {
      const pending = prefetched.get(url);
      prefetched.delete(url);
      return pending;
    }
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.text();
    });
  }

  function prefetch(url) {
    if (prefetched.has(url) || pathOf(url) === currentPath) return;
    const pending = fetchPage(url);
    pending.catch(() => prefetched.delete(url));
    prefetched.set(url, pending);
  }

  async function navigate(url, { push = true, scrollY = 0 } = {}) {
    const navigation = {};
    activeNavigation = navigation;
    document.documentElement.classList.add("is-navigating");

    try {
      const doc = new DOMParser().parseFromString(await fetchPage(url), "text/html");
      if (activeNavigation !== navigation) return; // superseded by a newer click
      const nextMain = doc.querySelector("main");
      if (!nextMain || !doc.body.dataset.page) throw new Error("Not a portal page");

      await loadStylesheets(doc);
      if (activeNavigation !== navigation) return;

      if (push) {
        history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
        history.pushState({ scrollY: 0 }, "", url);
      }
      currentPath = pathOf(url);

      unmountPage();
      await swapContent(doc, nextMain, scrollY);
      await loadPageScripts(doc);
      mountPage(doc.body.dataset.page);
      document.dispatchEvent(new CustomEvent("page:change", { detail: { page: doc.body.dataset.page } }));
    } catch (error) {
      console.warn("[router] falling back to a full page load:", error);
      location.href = url;
    } finally {
      if (activeNavigation === navigation) {
        activeNavigation = null;
        document.documentElement.classList.remove("is-navigating");
      }
    }
  }

  function swapContent(doc, nextMain, scrollY) {
    const update = () => {
      document.querySelector("main").replaceWith(document.adoptNode(nextMain));
      document.title = doc.title;
      document.body.dataset.page = doc.body.dataset.page;
      AIS.setActiveNav(doc.body.dataset.page);
      window.scrollTo(0, scrollY);
    };

    if (document.startViewTransition && !reduceMotion.matches) {
      return document.startViewTransition(update).updateCallbackDone;
    }
    update();
    return Promise.resolve();
  }

  // Page-specific stylesheets in the next page's <head> are added (never removed).
  function loadStylesheets(doc) {
    const present = new Set(
      [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href)
    );
    const loads = [...doc.head.querySelectorAll('link[rel="stylesheet"]')]
      .map((link) => new URL(link.getAttribute("href"), location.href).href)
      .filter((href) => !present.has(href))
      .map(
        (href) =>
          new Promise((resolve) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.onload = link.onerror = resolve;
            document.head.appendChild(link);
          })
      );
    return Promise.all(loads);
  }

  // Scripts at the end of the next page's <body> that this document hasn't run yet.
  // Shared scripts are already loaded; page scripts are loaded once and their
  // AIS.definePage() call mounts them.
  async function loadPageScripts(doc) {
    for (const source of doc.body.querySelectorAll("script[src]")) {
      const src = new URL(source.getAttribute("src"), location.href).href;
      if (loadedScripts.has(src)) continue;
      loadedScripts.add(src);
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = script.onerror = resolve;
        document.body.appendChild(script);
      });
    }
  }

  // ---- Link interception ----------------------------------------------------

  function pathOf(url) {
    const parsed = new URL(url, location.href);
    return parsed.pathname + parsed.search;
  }

  function portalLinkUrl(event) {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link) return null;
    const href = link.getAttribute("href");
    if (href.startsWith("#") || link.hasAttribute("download") || link.hasAttribute("data-no-router")) return null;
    if (link.target && link.target !== "_self") return null;

    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/(\.html|\/)$/.test(url.pathname)) return null;
    if (url.hash && pathOf(url) === currentPath) return null; // in-page anchor
    return url.href;
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = portalLinkUrl(event);
    if (!url) return;
    event.preventDefault();
    if (pathOf(url) === currentPath) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    navigate(url);
  });

  // Warm the next page while the pointer is on its link.
  document.addEventListener("pointerover", (event) => {
    const url = portalLinkUrl(event);
    if (url) prefetch(url);
  });

  window.addEventListener("popstate", (event) => {
    if (pathOf(location.href) === currentPath) return; // hash-only change
    navigate(location.href, { push: false, scrollY: (event.state && event.state.scrollY) || 0 });
  });

  history.scrollRestoration = "manual";
  history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
})();
