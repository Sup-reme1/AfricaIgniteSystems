// Data API client (AIS.api): base URL from AIS.config, the signed-in user's
// Bearer token, JSON in and out, timeouts, and one error format.
//
//   const rows = await AIS.api.get("/workspaces");
//   const saved = await AIS.api.patch(`/items/${id}`, { done: true });
//
// Errors are AIS.api.ApiError { status, message, fields }:
//   0   network failure        408 timed out
//   400 validation (fields)    401 session expired → redirects to sign-in
//   403 view-only access       404 gone / not visible   409 duplicate label
//   422 rule broken            5xx server problem
// The first slow request on a page shows a "waking up the server" toast
// (the hosted API can sleep).
(function () {
  const AIS = (window.AIS = window.AIS || {});
  let slowNoticeShown = false;

  class ApiError extends Error {
    constructor(status, message, fields) {
      super(message);
      this.status = status;
      this.fields = fields || {};
    }
  }

  function messageFor(status, data) {
    const text = data && (typeof data.error === "string" ? data.error : data.message);
    if (status === 403) return "You have view-only access to this workspace.";
    if (status === 404) return text || "That item no longer exists. Refresh to see the latest.";
    if (status === 409) return text || "That label is already used.";
    if (status >= 500) return "The server ran into a problem. Try again in a moment.";
    return text || "Something went wrong. Try again.";
  }

  async function request(method, path, body) {
    const session = AIS.auth && AIS.auth.session();
    if (!session) {
      AIS.auth.expire();
      throw new ApiError(401, "Sign in to continue.");
    }

    const { apiBase, slowRequestMs, requestTimeoutMs } = AIS.config;
    const controller = new AbortController();
    const slowTimer = setTimeout(() => {
      if (slowNoticeShown || !AIS.toast) return;
      slowNoticeShown = true;
      AIS.toast("Waking up the server, this can take up to a minute…", { tone: "info" });
    }, slowRequestMs);
    const timeoutTimer = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw error.name === "AbortError"
        ? new ApiError(408, "The server took too long to answer. Try again.")
        : new ApiError(0, "Can't reach the server. Check your connection and try again.");
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    }

    if (response.status === 204) return null;
    let data = null;
    try {
      data = await response.json();
    } catch {
      // empty or non-JSON body
    }
    if (!response.ok) {
      if (response.status === 401) AIS.auth.expire();
      throw new ApiError(response.status, messageFor(response.status, data), data && data.fields);
    }
    return data;
  }

  AIS.api = {
    ApiError,
    get: (path) => request("GET", path),
    post: (path, body = {}) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    del: (path) => request("DELETE", path),
  };
})();
