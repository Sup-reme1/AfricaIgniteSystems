// Objective hierarchy: zoom, inspector panel, collapse, node search and view switcher.
AIS.definePage("objectives", () => {
  let currentZoom = 100;
  const treeCanvas = document.getElementById("tree-root-canvas");
  const zoomIndicator = document.getElementById("zoom-indicator");
  const zoomInBtn = document.getElementById("zoom-in-btn");
  const zoomOutBtn = document.getElementById("zoom-out-btn");
  const zoomResetBtn = document.getElementById("zoom-reset-btn");
  const inspectorPanel = document.getElementById("inspector-panel");
  const closeInspectorBtn = document.getElementById("close-inspector-btn");
  const toggleCollapseBtn = document.getElementById("toggle-collapse-all");
  const collapseText = document.getElementById("collapse-all-text");
  const squadConnectors = document.getElementById("squad-branch-connectors");
  const squadGrid = document.getElementById("squad-kr-grid");
  const searchInput = document.getElementById("node-search-input");

  let isCollapsed = false;

  function applyZoom(val) {
    currentZoom = Math.min(Math.max(val, 50), 150);
    treeCanvas.style.transform = "scale(" + currentZoom / 100 + ")";
    zoomIndicator.textContent = currentZoom + "%";
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => applyZoom(currentZoom + 10));
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => applyZoom(currentZoom - 10));
  }

  if (zoomResetBtn) {
    zoomResetBtn.addEventListener("click", () => applyZoom(100));
  }

  if (closeInspectorBtn && inspectorPanel) {
    closeInspectorBtn.addEventListener("click", () => {
      inspectorPanel.classList.toggle("hidden");
    });
  }

  if (toggleCollapseBtn && squadConnectors && squadGrid) {
    toggleCollapseBtn.addEventListener("click", () => {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        squadConnectors.style.display = "none";
        squadGrid.style.display = "none";
        collapseText.textContent = "Expand All";
      } else {
        squadConnectors.style.display = "flex";
        squadGrid.style.display = "grid";
        collapseText.textContent = "Collapse All";
      }
    });
  }

  // Node click inspector selection
  const selectableCards = document.querySelectorAll(
    "#node-north-star, #pillar-card-a, #pillar-card-b, #pillar-card-c, .node-card"
  );
  selectableCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (inspectorPanel) {
        inspectorPanel.classList.remove("hidden");
      }
      selectableCards.forEach((c) => {
        c.classList.remove("ring-2", "ring-primary-container", "shadow-primary-container/20");
      });
      card.classList.add("ring-2", "ring-primary-container", "shadow-primary-container/20");
    });
  });

  // Simple node search highlighting
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      selectableCards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        if (!query || text.includes(query)) {
          card.style.opacity = "1";
          card.style.transform = "scale(1)";
        } else {
          card.style.opacity = "0.35";
          card.style.transform = "scale(0.98)";
        }
      });
    });
  }

  // View switcher toggles
  const viewTreeBtn = document.getElementById("view-tree-btn");
  const viewListBtn = document.getElementById("view-list-btn");
  const viewMatrixBtn = document.getElementById("view-matrix-btn");
  const allViewBtns = [viewTreeBtn, viewListBtn, viewMatrixBtn];

  allViewBtns.forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      allViewBtns.forEach((b) => {
        if (!b) return;
        b.classList.remove("bg-surface-container-lowest", "text-primary", "shadow-sm");
        b.classList.add("text-on-surface-variant");
      });
      btn.classList.add("bg-surface-container-lowest", "text-primary", "shadow-sm");
      btn.classList.remove("text-on-surface-variant");
    });
  });
});
