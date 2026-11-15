/**
 * Authentication: Register Controller
 * Handles new user registration, form validation, password confirmation,
 * and error messages via shared utils.
 */
import { showMessage, getErrorMessage } from "../../shared/utils.js";

const form = document.getElementById("register-form");
const message = document.getElementById("register-message");
const password = document.getElementById("password");
const confirmation = document.getElementById("confirm");
const submitButton = form ? form.querySelector('button[type="submit"]') : null;

// Validate password and confirmation match
function validatePasswordConfirmation() {
  if (!confirmation || !password) {
    return;
  }
  if (confirmation.value === password.value) {
    confirmation.setCustomValidity("");
  } else {
    confirmation.setCustomValidity("Passwords do not match.");
  }
}

// Handle registration form submission
async function handleRegisterSubmit(event) {
  event.preventDefault();

  if (form) {
    const textInputs = form.querySelectorAll(
      'input[name="first_name"], input[name="last_name"], input[name="email"], input[name="phone"]'
    );
    textInputs.forEach(function trimInput(input) {
      input.value = input.value.trim();
    });
  }

  validatePasswordConfirmation();

  if (!form || !form.reportValidity()) {
    return;
  }

  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  if (!apiBaseUrl) {
    showMessage(message, "API configuration is missing.", "error");
    return;
  }

  const formData = new FormData(form);
  const payload = {
    first_name: formData.get("first_name") ? formData.get("first_name").trim() : "",
    last_name: formData.get("last_name") ? formData.get("last_name").trim() : "",
    email: formData.get("email") ? formData.get("email").trim() : "",
    phone: formData.get("phone") ? formData.get("phone").trim() : "",
    password: formData.get("password") || "",
  };

  if (submitButton) {
    submitButton.disabled = true;
  }
  let redirecting = false;
  showMessage(message, "Creating your account…", "success");

  try {
    const response = await fetch(`${apiBaseUrl}/auth_routes/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      return;
    }

    showMessage(
      message,
      body.Message || body.message || "Account successfully created.",
      "success"
    );
    redirecting = true;
    window.setTimeout(function redirectToLogin() {
      window.location.assign("login.html");
    }, 2000);
  } catch (error) {
    console.error("Registration request failed:", error);
    showMessage(
      message,
      "Could not reach the server. Check that the API is running and try again.",
      "error"
    );
  } finally {
    if (!redirecting && submitButton) {
      submitButton.disabled = false;
    }
  }
}

// Attach event listeners
if (password && confirmation) {
  password.addEventListener("input", validatePasswordConfirmation);
  confirmation.addEventListener("input", validatePasswordConfirmation);
}

if (form) {
  form.addEventListener("submit", handleRegisterSubmit);
}
