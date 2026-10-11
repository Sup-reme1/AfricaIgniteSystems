// Sign-in for the portal (AIS.auth), backed by the Supabase auth API in AIS.config.
//
// Loaded in the <head> of every page. On portal pages it acts as a guard: without
// a valid session it sends the visitor to login.html?next=<this page> before the
// page shows. Pages marked <html data-auth="public"> (the sign-in page) are open.
//
//   await AIS.auth.login(email, password, { remember, onSlow });
//   await AIS.auth.signup(email, password, { onSlow });  // → { needsConfirmation }
//   AIS.auth.user();  AIS.auth.signOut();
//
// The session is kept in localStorage ("Keep me signed in") or sessionStorage.
// There is no refresh endpoint yet, so an expired session means signing in again.
// This guards the screens only; data protection needs the API to check the token.
//
// Local development: opening any page with ?demo=1 on localhost / 127.0.0.1
// creates a temporary demo session (used by the screenshot tool). It is ignored
// on any other host.
(function () {
  const AIS = (window.AIS = window.AIS || {});
  const KEY = "ais:auth:session";
  const LOGIN_PAGE = "login.html";
  const DEFAULT_PAGE = "index.html";
  const isLocalHost = ["localhost", "127.0.0.1"].includes(location.hostname);

  // ---- Storage --------------------------------------------------------------

  function readFrom(storage) {
    try {
      const raw = storage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearSession() {
    [localStorage, sessionStorage].forEach((storage) => {
      try {
        storage.removeItem(KEY);
      } catch {
        // storage blocked: nothing stored
      }
    });
  }

  function storeSession(session, remember) {
    clearSession();
    try {
      (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
      return true;
    } catch {
      return false;
    }
  }

  const isValid = (session) => Boolean(session && session.access_token && session.expires_at * 1000 > Date.now() + 30000);

  function currentSession() {
    const session = readFrom(sessionStorage) || readFrom(localStorage);
    if (session && !isValid(session)) {
      clearSession(); // expired
      return null;
    }
    return session;
  }

  // Keeps only what the portal needs from Supabase's { user, session }.
  function toSession(data) {
    const session = data && (data.session || data);
    if (!session || !session.access_token) return null;
    const user = session.user || (data && data.user) || {};
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token || "",
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (Number(session.expires_in) || 3600),
      user: { id: user.id || "", email: user.email || "" },
    };
  }

  // ---- Requests -------------------------------------------------------------

  // Plain-language messages for what the API (or the network) can return.
  function friendlyMessage(status, message) {
    const text = String(message || "").toLowerCase();
    if (status === 0) return "Can't reach the server. Check your connection and try again.";
    if (status === 408) return "The server took too long to answer. Try again in a moment.";
    if (status === 429 || text.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
    if (text.includes("invalid login credentials")) return "That email and password don't match.";
    if (text.includes("already registered") || text.includes("already exists")) {
      return "An account with this email already exists. Sign in instead.";
    }
    if (text.includes("email not confirmed")) return "Confirm your email first: open the link we sent you, then sign in.";
    if (text.includes("password") && (text.includes("at least") || text.includes("short") || text.includes("weak"))) {
      return message; // Supabase's password rule message is already clear
    }
    if (text.includes("valid email")) return "Enter a valid email address and password.";
    if (status >= 500) return "The server ran into a problem. Try again in a moment.";
    return message || "Something went wrong. Try again.";
  }

  class AuthError extends Error {
    constructor(status, message) {
      super(friendlyMessage(status, message));
      this.status = status;
      this.raw = message;
    }
  }

  async function post(path, body, { onSlow } = {}) {
    const { apiBase, slowRequestMs, requestTimeoutMs } = AIS.config;
    const controller = new AbortController();
    const slowTimer = onSlow ? setTimeout(onSlow, slowRequestMs) : null;
    const timeoutTimer = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new AuthError(error.name === "AbortError" ? 408 : 0, error.message);
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      // empty or non-JSON body
    }
    if (!response.ok) {
      const error = data && (data.error || data.message || data.msg || data.error_description);
      throw new AuthError(response.status, typeof error === "object" && error ? error.message : error);
    }
    return data;
  }

  // ---- Navigation helpers ---------------------------------------------------

  // Only same-site portal pages are allowed as a return destination.
  function safeNext(next) {
    return /^[\w-]+\.html(\?[^#]*)?$/.test(next || "") && !String(next).startsWith(LOGIN_PAGE) ? next : DEFAULT_PAGE;
  }

  function currentPage() {
    const page = location.pathname.split("/").pop() || DEFAULT_PAGE;
    const search = new URLSearchParams(location.search);
    search.delete("demo");
    const query = search.toString();
    return `${page}${query ? `?${query}` : ""}`;
  }

  const loginUrl = (next = currentPage()) => `${LOGIN_PAGE}?next=${encodeURIComponent(next)}`;

  // ---- Public API -----------------------------------------------------------

  AIS.auth = {
    session: currentSession,
    user: () => (currentSession() || {}).user || null,
    isSignedIn: () => Boolean(currentSession()),
    safeNext,
    loginUrl,

    async login(email, password, { remember = true, onSlow } = {}) {
      const data = await post("/auth/login", { email, password }, { onSlow });
      const session = toSession(data);
      if (!session) throw new AuthError(500, "The server didn't return a session.");
      storeSession(session, remember);
      return session;
    },

    // Returns { needsConfirmation: true } when Supabase requires email confirmation.
    async signup(email, password, { onSlow } = {}) {
      const data = await post("/auth/signup", { email, password }, { onSlow });
      // With confirmations on, Supabase answers an existing email with a user
      // that has no identities instead of an error.
      if (data && data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
        throw new AuthError(422, "User already registered");
      }
      const session = toSession(data);
      if (!session) return { needsConfirmation: true };
      storeSession(session, true);
      return { needsConfirmation: false, session };
    },

    signOut() {
      clearSession();
      location.replace(LOGIN_PAGE);
    },
  };

  // ---- Guard ----------------------------------------------------------------

  if (isLocalHost && new URLSearchParams(location.search).get("demo") === "1" && !currentSession()) {
    storeSession(
      { access_token: "demo", refresh_token: "", expires_at: Math.floor(Date.now() / 1000) + 12 * 3600, user: { id: "demo", email: "demo@localhost" }, demo: true },
      false
    );
  }

  function guard() {
    if (document.documentElement.dataset.auth === "public" || currentSession()) return;
    document.documentElement.style.visibility = "hidden"; // no flash of the protected page
    location.replace(loginUrl());
  }

  guard();
  // Client-side page changes don't reload this script; re-check on each one.
  document.addEventListener("page:change", guard);
})();
