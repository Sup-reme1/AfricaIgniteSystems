// Current workspace (AIS.workspace). Data in the portal belongs to a workspace;
// the user picks one in the sidebar switcher and it's remembered per browser.
//
//   const ws = await AIS.workspace.current();   // { id, name, role }
//   AIS.workspace.select(id);                    // switch (reloads the page)
//   await AIS.workspace.create("Growth team");   // POST /workspaces
//   await AIS.workspace.members(ws.id);          // [{ userId, email, fullName, role }]
//
// In the local demo session (?demo=1) there's one fake workspace and no API calls.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  const KEY = "ais:workspace";
  const DEMO = [{ id: "demo", name: "Demo workspace", role: "owner" }];

  let listPromise = null;
  const membersCache = new Map();

  function storedId() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function remember(id) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // storage blocked: the first workspace is used next time
    }
  }

  AIS.workspace = {
    list() {
      if (!listPromise) {
        listPromise = AIS.auth.isDemo()
          ? Promise.resolve(DEMO)
          : AIS.api.get("/workspaces").catch((error) => {
              listPromise = null; // allow a retry
              throw error;
            });
      }
      return listPromise;
    },

    async current() {
      const list = await AIS.workspace.list();
      return list.find((workspace) => workspace.id === storedId()) || list[0] || null;
    },

    // Switching reloads the page so every cache starts clean for the new workspace.
    select(id) {
      remember(id);
      location.reload();
    },

    async create(name) {
      const workspace = await AIS.api.post("/workspaces", { name });
      listPromise = null;
      return workspace;
    },

    async rename(id, name) {
      const workspace = await AIS.api.patch(`/workspaces/${id}`, { name });
      listPromise = null;
      return workspace;
    },

    async remove(id) {
      await AIS.api.del(`/workspaces/${id}`);
      listPromise = null;
      if (storedId() === id) {
        try {
          localStorage.removeItem(KEY);
        } catch {
          // nothing stored
        }
      }
    },

    members(id) {
      if (AIS.auth.isDemo()) {
        const user = AIS.auth.user() || {};
        return Promise.resolve([{ userId: "demo", email: user.email, fullName: user.fullName, role: "owner" }]);
      }
      if (!membersCache.has(id)) {
        membersCache.set(
          id,
          AIS.api.get(`/workspaces/${id}/members`).catch((error) => {
            membersCache.delete(id);
            throw error;
          })
        );
      }
      return membersCache.get(id);
    },

    forgetMembers: (id) => membersCache.delete(id),

    canEdit: (role) => ["owner", "admin", "member"].includes(role),
    isAdmin: (role) => ["owner", "admin"].includes(role),
  };
})();
