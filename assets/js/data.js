// Data access for the portal. Pages ask for a dataset by name:
//
//   const { objectives } = await AIS.data.load("objectives");
//
// Datasets are mock JSON files in data/. Results are cached for the session
// (they survive client-side page changes), so pages can call load() freely.
//
// Edits are kept in this browser with save(); a saved copy takes precedence
// over the JSON file until reset() is called. Swapping all of this for a real
// API later only changes this file.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  const DATA_DIR = "data/";
  const STORAGE_PREFIX = "ais:data:";
  const cache = new Map();

  function readSaved(name) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + name);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null; // storage blocked or corrupt copy: fall back to the file
    }
  }

  function fetchFile(name) {
    return fetch(`${DATA_DIR}${name}.json`).then((response) => {
      if (!response.ok) throw new Error(`Could not load "${name}" (${response.status})`);
      return response.json();
    });
  }

  AIS.data = {
    load(name) {
      if (!cache.has(name)) {
        const saved = readSaved(name);
        const request = (saved ? Promise.resolve(saved) : fetchFile(name)).catch((error) => {
          cache.delete(name); // allow a retry
          throw error;
        });
        cache.set(name, request);
      }
      return cache.get(name);
    },

    // Stores `value` as the current version of the dataset. Returns false if
    // the browser refused (private mode, quota); the session copy still updates.
    save(name, value) {
      cache.set(name, Promise.resolve(value));
      try {
        localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn(`[data] Could not save "${name}" in this browser`, error);
        return false;
      }
    },

    // Drops saved edits; the next load() reads the JSON file again.
    reset(name) {
      cache.delete(name);
      try {
        localStorage.removeItem(STORAGE_PREFIX + name);
      } catch {
        // nothing saved to remove
      }
    },

    isModified(name) {
      try {
        return localStorage.getItem(STORAGE_PREFIX + name) !== null;
      } catch {
        return false;
      }
    },
  };
})();
