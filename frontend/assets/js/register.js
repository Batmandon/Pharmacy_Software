const form = document.getElementById("register-form");
const message = document.getElementById("register-message");
const password = document.getElementById("password");
const confirmation = document.getElementById("confirm");
const submitButton = form.querySelector('button[type="submit"]');

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

  return `Registration failed (HTTP ${status}). Please try again.`;
}

function validatePasswordConfirmation() {
  confirmation.setCustomValidity(
    confirmation.value === password.value ? "" : "Passwords do not match."
  );
}

password.addEventListener("input", validatePasswordConfirmation);
confirmation.addEventListener("input", validatePasswordConfirmation);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  form.querySelectorAll('input[name="first_name"], input[name="last_name"], input[name="email"], input[name="phone"]').forEach((input) => {
    input.value = input.value.trim();
  });
  validatePasswordConfirmation();

  if (!form.reportValidity()) {
    return;
  }

  const formData = new FormData(form);
  const payload = {
    first_name: formData.get("first_name").trim(),
    last_name: formData.get("last_name").trim(),
    email: formData.get("email").trim(),
    phone: formData.get("phone").trim(),
    password: formData.get("password"),
  };

  submitButton.disabled = true;
  let redirecting = false;
  showMessage("Creating your account…", "success");

  try {
    const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/auth_routes/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      return;
    }

    showMessage(
      body.Message || body.message || "Account successfully created.",
      "success"
    );
    redirecting = true;
    window.setTimeout(() => {
      window.location.assign("login.html");
    }, 2000);
  } catch (error) {
    showMessage(
      "Could not reach the server. Check that the API is running and try again.",
      "error"
    );
    console.error("Registration request failed:", error);
  } finally {
    if (!redirecting) {
      submitButton.disabled = false;
    }
  }
});
