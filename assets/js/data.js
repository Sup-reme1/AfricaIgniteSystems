// Data access for the portal. Pages ask for a dataset by name:
//
//   const { objectives } = await AIS.data.load("objectives");
//
// Datasets are mock JSON files in data/ for now. Results are cached for the
// session (they survive client-side page changes), so pages can call load()
// freely. Swapping the source to a real API later only changes this file.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  const DATA_DIR = "data/";
  const cache = new Map();

  AIS.data = {
    load(name) {
      if (!cache.has(name)) {
        const request = fetch(`${DATA_DIR}${name}.json`)
          .then((response) => {
            if (!response.ok) throw new Error(`Could not load "${name}" (${response.status})`);
            return response.json();
          })
          .catch((error) => {
            cache.delete(name); // allow a retry
            throw error;
          });
        cache.set(name, request);
      }
      return cache.get(name);
    },
  };
})();
