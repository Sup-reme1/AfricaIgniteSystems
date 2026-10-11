// Environment settings shared by every page. Change the API address here only.
(function () {
  const AIS = (window.AIS = window.AIS || {});

  AIS.config = {
    // Auth API (Express + Supabase): POST /auth/signup and /auth/login with { email, password }.
    apiBase: "https://brevomailapi.onrender.com/api",
    // Show "waking up the server" after this long (the API is on Render, which can sleep).
    slowRequestMs: 5000,
    // Give up after this long.
    requestTimeoutMs: 90000,
  };
})();
