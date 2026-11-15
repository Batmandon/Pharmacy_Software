/**
 * Authentication: Login Controller
 * Handles user login, session refresh check, role-based redirects,
 * and error messages via shared utils.
 */
import { showMessage, getErrorMessage } from "../../shared/utils.js";

const form = document.getElementById("login-form");
const message = document.getElementById("login-message");
const email = document.getElementById("email");
const password = document.getElementById("password");
const submitButton = form ? form.querySelector('button[type="submit"]') : null;
let loginSubmitted = false;

// Attempt session refresh on page load
async function refreshSession() {
  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  if (!apiBaseUrl) return;

  try {
    const response = await fetch(`${apiBaseUrl}/auth_routes/refresh_token`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok && !loginSubmitted) {
      showMessage(message, "Your session could not be refreshed. Please log in.", "error");
    }
  } catch (error) {
    if (!loginSubmitted) {
      showMessage(message, "Your session could not be refreshed. Please log in.", "error");
    }
    console.error("Session refresh request failed:", error);
  }
}

// Handle login form submission
async function handleLoginSubmit(event) {
  event.preventDefault();
  email.value = email.value.trim();

  if (!form.reportValidity()) {
    return;
  }

  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  if (!apiBaseUrl) {
    showMessage(message, "API configuration is missing.", "error");
    return;
  }

  loginSubmitted = true;
  if (submitButton) submitButton.disabled = true;
  showMessage(message, "Logging in…", "success");

  try {
    const response = await fetch(`${apiBaseUrl}/auth_routes/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: email.value,
        password: password.value,
      }),
    });

    const responseText = await response.text();
    let body = {};
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = { detail: responseText };
      }
    }

    if (!response.ok) {
      showMessage(message, getErrorMessage(body, response.status), "error");
      if (submitButton) submitButton.disabled = false;
      return;
    }

    showMessage(message, body.message || "Login successful.", "success");
    window.setTimeout(function redirectUser() {
      if (body.role === "admin" || body.role === "pharmacist") {
        window.location.assign("dashboard.html");
      } else {
        window.location.assign("index.html");
      }
    }, 1000);
  } catch (error) {
    console.error("Login request failed:", error);
    showMessage(
      message,
      "Could not reach the server. Check that the API is running and try again.",
      "error"
    );
    if (submitButton) submitButton.disabled = false;
  }
}

// Initialize listeners
if (form) {
  refreshSession();
  form.addEventListener("submit", handleLoginSubmit);
}
