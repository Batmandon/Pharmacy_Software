const form = document.getElementById("login-form");
const message = document.getElementById("login-message");
const email = document.getElementById("email");
const password = document.getElementById("password");
const submitButton = form.querySelector('button[type="submit"]');
let loginSubmitted = false;

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message is-${type}`;
  message.hidden = false;
}

function getErrorMessage(body, status) {
  if (typeof body.detail === "string") {
    return body.detail;
  }

  if (Array.isArray(body.detail)) {
    return body.detail.map((error) => error.msg).join(" ");
  }

  if (typeof body.error === "string") {
    return body.error;
  }

  return `Login failed (HTTP ${status}). Please try again.`;
}

async function refreshSession() {
  try {
    const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/auth_routes/refresh_token`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok && !loginSubmitted) {
      showMessage("Your session could not be refreshed. Please log in.", "error");
    }
  } catch (error) {
    if (!loginSubmitted) {
      showMessage("Your session could not be refreshed. Please log in.", "error");
    }
    console.error("Session refresh request failed:", error);
  }
}

refreshSession();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  email.value = email.value.trim();

  if (!form.reportValidity()) {
    return;
  }

  loginSubmitted = true;
  submitButton.disabled = true;
  showMessage("Logging in…", "success");

  try {
    const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/auth_routes/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: email.value,
        password: password.value,
      }),
    });
    const responseText = await response.text();
    let body;

    try {
      body = responseText ? JSON.parse(responseText) : {};
    } catch {
      body = { detail: responseText };
    }
    if (!body || typeof body !== "object") {
      body = {};
    }

    if (!response.ok) {
      showMessage(getErrorMessage(body, response.status), "error");
      submitButton.disabled = false;
      return;
    }

    showMessage(body.message || "Login successful.", "success");
    window.setTimeout(() => {
      if (body.role === "admin" || body.role === "pharmacist") {
        window.location.assign("dashboard.html");
      } else {
        window.location.assign("index.html");
      }
    }, 1000);
  } catch (error) {
    showMessage(
      "Could not reach the server. Check that the API is running and try again.",
      "error"
    );
    console.error("Login request failed:", error);
    submitButton.disabled = false;
  }
});
