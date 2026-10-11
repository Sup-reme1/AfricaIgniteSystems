// Environment settings shared by every page. Change the API address here only.
(function () {
  const AIS = (window.AIS = window.AIS || {});

  const HOSTED_API = "https://brevomailapi.onrender.com/api";
  const LOCAL_API = "http://localhost:3000/api"; // backend running on this machine
  // Set to true to develop against the local backend instead of the hosted one.
  const USE_LOCAL_API = false;

  AIS.config = {
    // Express + Supabase API: auth, profile, workspaces, OKR data.
    apiBase: USE_LOCAL_API ? LOCAL_API : HOSTED_API,
    // Show "waking up the server" after this long (the hosted API is on Render, which can sleep).
    slowRequestMs: 5000,
    // Give up after this long.
    requestTimeoutMs: 90000,
  };
})();
