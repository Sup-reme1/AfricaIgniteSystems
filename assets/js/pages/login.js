// Sign-in page (login.html): "Sign in" and "Create account" tabs on one form,
// posting to the auth API through AIS.auth. This page sits outside the portal
// shell and router, so it runs as a plain script rather than AIS.definePage.
//
// login.html?next=<page>  returns there after signing in (portal pages only).
// login.html#signup       opens the "Create account" tab.
(function () {
  const params = new URLSearchParams(location.search);
  const next = AIS.auth.safeNext(params.get("next"));

  // Already signed in: go straight on.
  if (AIS.auth.isSignedIn()) {
    location.replace(next);
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const form = $("[data-auth-form]");
  const email = $("#auth-email");
  const password = $("#auth-password");
  const confirm = $("#auth-confirm");
  const remember = $("#auth-remember");
  const submit = $("[data-auth-submit]");
  const alertBox = $("[data-auth-alert]");
  const panel = $("#auth-panel");
  const confirmPanel = $("[data-auth-confirm]");

  const COPY = {
    login: {
      heading: "Welcome back",
      subheading: "Sign in to continue to your workspace.",
      submit: "Sign in",
      busy: "Signing in…",
      switchText: "Don't have an account?",
      switchAction: "Create one",
    },
    signup: {
      heading: "Create your account",
      subheading: "Start setting objectives and tracking progress with your team.",
      submit: "Create account",
      busy: "Creating account…",
      switchText: "Already have an account?",
      switchAction: "Sign in",
    },
  };
  const TAB_ACTIVE = ["bg-surface-container-lowest", "text-on-surface", "shadow-sm"];
  const TAB_INACTIVE = ["text-on-surface-variant", "hover:text-on-surface"];
  const MIN_PASSWORD = 6;

  let mode = location.hash === "#signup" ? "signup" : "login";
  let busy = false;

  // ---- View -----------------------------------------------------------------

  function setMode(nextMode) {
    mode = nextMode;
    const copy = COPY[mode];
    $("[data-auth-heading]").textContent = copy.heading;
    $("[data-auth-subheading]").textContent = copy.subheading;
    $("[data-auth-submit-label]").textContent = copy.submit;
    $("[data-auth-switch-text]").textContent = copy.switchText;
    $("[data-auth-switch]").textContent = copy.switchAction;

    $$("[data-auth-tabs] [data-auth-tab]").forEach((tab) => {
      const active = tab.dataset.authTab === mode;
      tab.classList.remove(...TAB_ACTIVE, ...TAB_INACTIVE);
      tab.classList.add(...(active ? TAB_ACTIVE : TAB_INACTIVE));
      tab.setAttribute("aria-selected", String(active));
    });
    panel.setAttribute("aria-labelledby", `tab-${mode}`);
    $$("[data-signup-only]").forEach((el) => el.classList.toggle("hidden", mode !== "signup"));
    $$("[data-login-only]").forEach((el) => el.classList.toggle("hidden", mode !== "login"));
    password.autocomplete = mode === "signup" ? "new-password" : "current-password";

    panel.classList.remove("hidden");
    confirmPanel.classList.add("hidden");
    $("[data-auth-tabs]").classList.remove("hidden");
    clearErrors();
    history.replaceState(null, "", `${location.pathname}${location.search}${mode === "signup" ? "#signup" : ""}`);
  }

  function showAlert(message, action) {
    $("[data-auth-alert-text]").textContent = message;
    const existing = alertBox.querySelector("[data-auth-alert-action]");
    if (existing) existing.remove();
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shrink-0 font-title-sm text-title-sm underline";
      button.dataset.authAlertAction = "";
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      alertBox.appendChild(button);
    }
    alertBox.classList.remove("hidden");
  }

  function fieldError(input, message) {
    const error = $(`#${input.id}-error`);
    error.textContent = message;
    error.classList.toggle("hidden", !message);
    if (message) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function clearErrors() {
    alertBox.classList.add("hidden");
    [email, password, confirm].forEach((input) => fieldError(input, ""));
  }

  function setBusy(isBusy) {
    busy = isBusy;
    submit.disabled = isBusy;
    $("[data-auth-spinner]").classList.toggle("hidden", !isBusy);
    $("[data-auth-submit-label]").textContent = isBusy ? COPY[mode].busy : COPY[mode].submit;
    if (!isBusy) $("[data-auth-slow]").classList.add("hidden");
    [email, password, confirm, remember].forEach((input) => (input.disabled = isBusy));
  }

  function validate() {
    clearErrors();
    const errors = [];
    const value = email.value.trim();
    if (!value) errors.push([email, "Enter your email address."]);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push([email, "Enter a valid email address, like you@company.com."]);
    if (!password.value) errors.push([password, "Enter your password."]);
    else if (mode === "signup" && password.value.length < MIN_PASSWORD) {
      errors.push([password, `Use at least ${MIN_PASSWORD} characters.`]);
    }
    if (mode === "signup" && confirm.value !== password.value) errors.push([confirm, "The passwords don't match."]);
    errors.forEach(([input, message]) => fieldError(input, message));
    if (errors.length) errors[0][0].focus();
    return !errors.length;
  }

  // ---- Submit -----------------------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy || !validate()) return;

    const credentials = [email.value.trim(), password.value];
    const onSlow = () => $("[data-auth-slow]").classList.remove("hidden");
    setBusy(true);
    try {
      if (mode === "login") {
        await AIS.auth.login(...credentials, { remember: remember.checked, onSlow });
        location.replace(next);
        return;
      }
      const result = await AIS.auth.signup(...credentials, { onSlow });
      if (!result.needsConfirmation) {
        location.replace(next);
        return;
      }
      setBusy(false);
      showConfirmation(credentials[0]);
    } catch (error) {
      setBusy(false);
      const alreadyExists = /already exists/i.test(error.message);
      showAlert(
        error.message,
        alreadyExists ? { label: "Sign in", run: () => switchTo("login") } : null
      );
      (alreadyExists || error.status === 400 ? email : password).focus();
    }
  }

  function showConfirmation(address) {
    $("[data-auth-confirm-email]").textContent = address;
    panel.classList.add("hidden");
    $("[data-auth-tabs]").classList.add("hidden");
    $("[data-auth-heading]").textContent = "Almost there";
    $("[data-auth-subheading]").textContent = "Confirm your email to finish creating your account.";
    confirmPanel.classList.remove("hidden");
    confirmPanel.querySelector("button").focus();
  }

  // Keeps the typed email when switching tabs; clears passwords.
  function switchTo(nextMode) {
    if (busy) return;
    password.value = "";
    confirm.value = "";
    setMode(nextMode);
    (email.value ? password : email).focus();
  }

  // ---- Events -----------------------------------------------------------------

  form.addEventListener("submit", handleSubmit);

  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-auth-tab]");
    if (tab) switchTo(tab.dataset.authTab);
    else if (event.target.closest("[data-auth-switch]")) switchTo(mode === "login" ? "signup" : "login");
  });

  $("[data-toggle-password]").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const show = password.type === "password";
    [password, confirm].forEach((input) => (input.type = show ? "text" : "password"));
    button.setAttribute("aria-pressed", String(show));
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    button.querySelector(".material-symbols-outlined").textContent = show ? "visibility_off" : "visibility";
  });

  // Arrow keys move between the two tabs.
  $("[data-auth-tabs]").addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    switchTo(mode === "login" ? "signup" : "login");
    $(`#tab-${mode}`).focus();
  });

  setMode(mode);
})();
