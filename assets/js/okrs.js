// Shared OKR model used by the dashboard, the objective hierarchy and the
// "New objective" form. One dataset (data/okrs.json) holds a flat list of
// nodes linked by parentId. The level comes from depth:
//
//   1  Objective / Goal        parentId null
//   2  Milestone               dated deliverable toward the objective
//   3  Checklist item          a step toward the milestone (done: true/false)
//   4+ Sub-step                any item broken down further, no depth limit
//
// Progress is calculated, never typed:
//   - a checklist item with no sub-steps is 0% or 100% (done);
//   - an item or milestone with steps = share of its smallest steps done;
//   - a milestone without steps = 100% only when its status is Complete;
//   - an objective = average of its milestones.
//
//   const okrs = await AIS.okrs.load();
//   okrs.objectives();  okrs.progressOf(node);  okrs.toggleDone(id);  okrs.save();
//
// Pages that change the data from outside the current page (the objective
// form) dispatch `okrs:change` on document with { action, id }.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  const DATASET = "okrs";
  const SCHEMA_VERSION = 3;

  // Node type by depth (0-based). Depth 3 and deeper are all sub-steps.
  const TYPES = [
    { key: "objective", label: "Objective", child: "Milestone", children: "Milestones" },
    { key: "milestone", label: "Milestone", child: "Checklist item", children: "Checklist items" },
    { key: "step", label: "Checklist item", child: "Sub-step", children: "Sub-steps" },
    { key: "step", label: "Sub-step", child: "Sub-step", children: "Sub-steps" },
  ];

  const STATUS_LABELS = {
    "on-track": "On Track",
    "needs-attention": "Needs Attention",
    "at-risk": "At Risk",
    complete: "Complete",
  };

  const DEPARTMENTS = ["Engineering", "Product", "Design", "Data"];

  const FIELD_LABELS = {
    code: "Label",
    title: "Title",
    description: "Description",
    notes: "Notes",
    department: "Department",
    status: "Status",
    owner: "Owner",
    assignee: "Assignee",
    team: "Team",
    targetDate: "Target date",
    dueDate: "Due date",
    expectedPacing: "Expected pacing",
  };

  const pad2 = (n) => String(n).padStart(2, "0");
  const numberIn = (text) => parseInt(String(text).replace(/\D+/g, ""), 10);
  const newId = () => `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const DAY = 24 * 60 * 60 * 1000;

  // ---- Dates (stored as "YYYY-MM-DD") --------------------------------------

  function parseDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  }

  function formatDate(iso) {
    const date = parseDate(iso);
    if (!date) return "";
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
  }

  // "Due in 4 days" / "Due today" / "Overdue 2 days", with a tone for colour.
  function dueLabel(iso, isDone = false) {
    const date = parseDate(iso);
    if (!date) return null;
    if (isDone) return { text: `Done · ${formatDate(iso)}`, tone: "done" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((date - today) / DAY);
    if (days < 0) return { text: `Overdue ${-days} day${days === -1 ? "" : "s"}`, tone: "overdue" };
    if (days === 0) return { text: "Due today", tone: "soon" };
    if (days <= 7) return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "soon" };
    return { text: `Due ${formatDate(iso)}`, tone: "normal" };
  }

  function displayValue(key, value) {
    if (value === undefined || value === null || value === "") return "—";
    if (key === "status") return STATUS_LABELS[value] || value;
    if (key === "expectedPacing") return `${value}%`;
    if (key === "targetDate" || key === "dueDate") return formatDate(value) || value;
    return String(value);
  }

  // ---- Model ----------------------------------------------------------------

  function createModel(data) {
    const model = {
      data,

      byId: (id) => data.nodes.find((node) => node.id === id),
      childrenOf: (id) => data.nodes.filter((node) => node.parentId === id),
      savedChildrenOf: (id) => model.childrenOf(id).filter((node) => !node.isDraft),
      objectives: () => data.nodes.filter((node) => node.parentId === null && !node.isDraft),

      pathTo(id) {
        const path = [];
        let node = model.byId(id);
        while (node) {
          path.unshift(node);
          node = model.byId(node.parentId);
        }
        return path;
      },

      depthOf: (node) => model.pathTo(node.id).length - 1,
      typeOf: (node) => TYPES[Math.max(0, Math.min(model.depthOf(node), TYPES.length - 1))],
      isStep: (node) => model.depthOf(node) >= 2,
      descendantsOf: (id) => model.childrenOf(id).flatMap((child) => [child, ...model.descendantsOf(child.id)]),

      // Smallest saved steps under a node (checklist items without sub-steps).
      leafStepsOf(node) {
        return model
          .descendantsOf(node.id)
          .filter((item) => !item.isDraft && model.isStep(item) && !model.savedChildrenOf(item.id).length);
      },

      // { done, total } of the smallest steps under a node (or the step itself).
      stepCounts(node) {
        const leaves = model.isStep(node) && !model.savedChildrenOf(node.id).length ? [node] : model.leafStepsOf(node);
        return { done: leaves.filter((leaf) => leaf.done).length, total: leaves.length };
      },

      // Checklist items: done when ticked, or when every sub-step is done.
      isDone(node) {
        const { done, total } = model.stepCounts(node);
        return total > 0 && done === total;
      },

      progressOf(node) {
        const depth = model.depthOf(node);
        if (depth === 0) {
          const milestones = model.savedChildrenOf(node.id);
          if (!milestones.length) return 0;
          return Math.round(milestones.reduce((sum, milestone) => sum + model.progressOf(milestone), 0) / milestones.length);
        }
        const { done, total } = model.stepCounts(node);
        if (!total) return depth === 1 && node.status === "complete" ? 100 : 0;
        return Math.round((done / total) * 100);
      },

      // Objectives and milestones: their status, except a milestone whose
      // steps are all done shows Complete.
      statusOf(node) {
        if (model.depthOf(node) === 1 && model.leafStepsOf(node).length && model.isDone(node)) return "complete";
        return node.status || "on-track";
      },

      // Ticks or unticks a checklist item that has no sub-steps. Returns the new value.
      toggleDone(id) {
        const node = model.byId(id);
        if (!node || !model.isStep(node) || model.savedChildrenOf(id).length) return null;
        node.done = !node.done;
        node.history = node.history || [];
        node.history.push({
          at: new Date().toISOString(),
          action: "updated",
          changes: [{ field: "Checklist", note: node.done ? "Marked done" : "Marked not done" }],
        });
        return node.done;
      },

      // Next label for a new objective (OBJ-06) or milestone (M2.4). Steps have none.
      nextCode(parent) {
        if (!parent) {
          const highest = Math.max(0, ...model.objectives().map((node) => numberIn(node.code)).filter(Number.isFinite));
          return `OBJ-${pad2(highest + 1)}`;
        }
        if (model.depthOf(parent) === 0) {
          return `M${numberIn(parent.code) || 1}.${model.childrenOf(parent.id).length + 1}`;
        }
        return "";
      },

      // A new, not yet inserted node under `parentId` (null for an objective).
      newNode(parentId, fields = {}) {
        const parent = parentId ? model.byId(parentId) : null;
        const depth = parent ? model.depthOf(parent) + 1 : 0;
        const base = { id: newId(), parentId: parentId || null, title: "", history: [] };
        let node;
        if (depth === 0) {
          node = {
            ...base,
            code: model.nextCode(null),
            description: "",
            department: DEPARTMENTS[0],
            owner: "",
            team: "",
            status: "on-track",
            targetDate: "",
            expectedPacing: 50,
            confidenceTrend: [],
            dependencies: [],
          };
        } else if (depth === 1) {
          node = {
            ...base,
            code: model.nextCode(parent),
            description: "",
            owner: parent.owner || "",
            dueDate: "",
            status: "on-track",
            dependencies: [],
          };
        } else {
          node = { ...base, notes: "", assignee: parent.assignee || parent.owner || "", dueDate: "", done: false };
        }
        return Object.assign(node, fields);
      },

      // Marks an inserted node as saved and records it in its and its parent's history.
      commitNew(node) {
        delete node.isDraft;
        const now = new Date().toISOString();
        node.history = [{ at: now, action: "created", changes: [] }];
        const parent = model.byId(node.parentId);
        if (parent) {
          parent.history = parent.history || [];
          parent.history.push({ at: now, action: "updated", changes: [{ field: model.typeOf(node).label, note: `Added “${node.title}”` }] });
        }
      },

      // Applies `next` to `node`, records the differences, and returns them.
      update(node, next) {
        const changes = [];
        Object.keys(FIELD_LABELS).forEach((key) => {
          if (key in next && String(node[key] ?? "") !== String(next[key] ?? "")) {
            changes.push({ field: FIELD_LABELS[key], from: displayValue(key, node[key]), to: displayValue(key, next[key]) });
          }
        });
        if (next.dependencies && JSON.stringify(node.dependencies || []) !== JSON.stringify(next.dependencies)) {
          changes.push({
            field: "Dependencies",
            from: (node.dependencies || []).map((dependency) => dependency.title).join(", ") || "None",
            to: next.dependencies.map((dependency) => dependency.title).join(", ") || "None",
          });
        }
        if (changes.length) {
          Object.assign(node, next);
          node.history = node.history || [];
          node.history.push({ at: new Date().toISOString(), action: "updated", changes });
        }
        return changes;
      },

      // Deletes a node and everything under it; returns its parent (null for an objective).
      remove(id) {
        const node = model.byId(id);
        const typeLabel = model.typeOf(node).label;
        const removed = new Set([id, ...model.descendantsOf(id).map((item) => item.id)]);
        data.nodes = data.nodes.filter((item) => !removed.has(item.id));
        const parent = model.byId(node.parentId) || null;
        if (parent) {
          parent.history = parent.history || [];
          parent.history.push({
            at: new Date().toISOString(),
            action: "updated",
            changes: [{ field: typeLabel, note: `Deleted “${node.title}”` }],
          });
        }
        return parent;
      },

      // Validates form values (strings) for a node at `depth` (0 objective, 1 milestone, 2+ step).
      validate(draft, depth) {
        const errors = {};
        const isDate = (value) => !value || parseDate(value) !== null;
        if (!String(draft.title || "").trim()) errors.title = "Enter a title.";
        if (depth <= 1 && !String(draft.code || "").trim()) {
          errors.code = depth === 0 ? "Enter a label, e.g. OBJ-06." : "Enter a label, e.g. M2.4.";
        }
        if (depth === 0) {
          const pace = draft.expectedPacing;
          if (pace === "" || !Number.isFinite(Number(pace)) || Number(pace) < 0 || Number(pace) > 100) {
            errors.expectedPacing = "Enter a number from 0 to 100.";
          }
          if (!isDate(draft.targetDate)) errors.targetDate = "Enter a valid date.";
        } else if (!isDate(draft.dueDate)) {
          errors.dueDate = "Enter a valid date.";
        }
        (draft.dependencies || []).forEach((dependency, i) => {
          if (!String(dependency.title || "").trim()) errors[`dependencies.${i}.title`] = "Name the dependency or remove it.";
        });
        return errors;
      },

      save: () => AIS.data.save(DATASET, data),
    };
    return model;
  }

  AIS.okrs = {
    TYPES,
    STATUS_LABELS,
    DEPARTMENTS,
    formatDate,
    dueLabel,

    async load() {
      let data = await AIS.data.load(DATASET);
      if (data.version !== SCHEMA_VERSION) {
        // A saved copy in an older shape: start again from the file.
        AIS.data.reset(DATASET);
        data = await AIS.data.load(DATASET);
      }
      return createModel(data);
    },

    reset: () => AIS.data.reset(DATASET),
    isModified: () => AIS.data.isModified(DATASET),
  };
})();
