(function () {
  var emailForm = document.getElementById("library-email-form");
  var passwordForm = document.getElementById("library-password-form");
  var emailInput = document.getElementById("library-email");
  var passwordInput = document.getElementById("library-password");
  var passwordSubmit = document.getElementById("library-password-submit");
  var passwordHint = document.getElementById("library-password-hint");
  var msg = document.getElementById("library-gate-msg");
  var pendingEmail = "";

  function showMsg(text) {
    if (!msg) return;
    msg.hidden = !text;
    msg.textContent = text || "";
  }

  function destination() {
    var next = new URLSearchParams(location.search).get("next") || "/";
    if (!next.startsWith("/") || next.startsWith("//") || next.indexOf("\\") !== -1) {
      return "/";
    }
    return next;
  }

  function showEmailStep() {
    pendingEmail = "";
    if (emailForm) emailForm.hidden = false;
    if (passwordForm) passwordForm.hidden = true;
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.autocomplete = "current-password";
    }
    if (passwordSubmit) passwordSubmit.textContent = "Sign in";
    if (passwordHint) passwordHint.textContent = "";
  }

  function showPasswordStep(email, mode) {
    pendingEmail = email;
    if (emailForm) emailForm.hidden = true;
    if (passwordForm) passwordForm.hidden = false;
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.autocomplete = mode === "set" ? "new-password" : "current-password";
      passwordInput.focus();
    }
    if (passwordSubmit) {
      passwordSubmit.textContent = mode === "set" ? "Set password & sign in" : "Sign in";
    }
    if (passwordHint) {
      passwordHint.textContent =
        mode === "set"
          ? "First visit for " + email + ". Choose a password of at least 12 characters."
          : "Enter the password for " + email + ".";
    }
  }

  function parseJson(res) {
    return res.json().then(function (data) {
      return { ok: res.ok, status: res.status, data: data };
    });
  }

  if (emailForm) {
    emailForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = emailInput ? emailInput.value.trim() : "";
      showMsg("");
      fetch("/api/library/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email }),
      })
        .then(parseJson)
        .then(function (result) {
          if (!result.ok) {
            showMsg((result.data && result.data.error) || "Could not continue. Please try again.");
            return;
          }
          if (result.data.status === "need_set_password") {
            showPasswordStep(result.data.email, "set");
            return;
          }
          if (result.data.status === "need_password") {
            showPasswordStep(result.data.email, "password");
            return;
          }
          showMsg("Could not continue. Please try again.");
        })
        .catch(function () {
          showMsg("Could not reach the server. Please try again.");
        });
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var password = passwordInput ? passwordInput.value : "";
      showMsg("");
      fetch("/api/library/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: pendingEmail, password: password }),
      })
        .then(parseJson)
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            location.href = destination();
            return;
          }
          showMsg((result.data && result.data.error) || "Could not sign in. Please try again.");
        })
        .catch(function () {
          showMsg("Could not reach the server. Please try again.");
        });
    });
  }

  var toggle = document.getElementById("library-password-toggle");
  if (toggle && passwordInput) {
    toggle.addEventListener("click", function () {
      var show = passwordInput.type === "password";
      passwordInput.type = show ? "text" : "password";
      toggle.textContent = show ? "Hide" : "Show";
      toggle.setAttribute("aria-pressed", show ? "true" : "false");
    });
  }

  var back = document.getElementById("library-back-email");
  if (back) {
    back.addEventListener("click", function () {
      showMsg("");
      showEmailStep();
      if (emailInput) emailInput.focus();
    });
  }

  var forgot = document.getElementById("library-forgot");
  if (forgot) {
    forgot.addEventListener("click", function () {
      var email = pendingEmail || (emailInput ? emailInput.value.trim() : "");
      if (!email) {
        showMsg("Enter your email address first.");
        return;
      }
      showMsg("");
      fetch("/api/library/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email }),
      })
        .then(parseJson)
        .then(function (result) {
          showMsg(
            (result.data && result.data.message) ||
              "If that address is registered, a reset link has been sent."
          );
        })
        .catch(function () {
          showMsg("Could not reach the server. Please try again.");
        });
    });
  }
})();
