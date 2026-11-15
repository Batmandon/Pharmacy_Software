/**
 * Account Feature: Profile Controller
 * Manages customer personal details form, validation, and overview cards.
 */
import { showToast, showMessage, clearMessage } from "../../shared/utils.js";
import { updateProfile } from "./api.js";
import {
  validateInputs,
  setFieldError,
  renderOverviewAddress,
  renderOverviewOrder,
} from "./ui.js";

// DOM Elements
const profileForm = document.getElementById("profile-form");
const profileMessage = document.getElementById("profile-message");
const editProfileBtn = document.getElementById("edit-profile-btn");
const cancelProfileBtn = document.getElementById("cancel-profile-btn");
const saveProfileBtn = document.getElementById("save-profile-btn");
const profileActions = document.getElementById("profile-actions");
const overviewAddressEl = document.getElementById("overview-address");
const overviewOrderEl = document.getElementById("overview-order");

let currentProfile = {};
let onProfileUpdatedCallback = null;

/**
 * Render profile values into the form fields.
 */
export function renderProfileForm(profile) {
  if (!profileForm) return;
  currentProfile = profile ? { ...profile } : {};

  const inputs = profileForm.querySelectorAll("input");
  inputs.forEach(function setInputValue(input) {
    input.value = currentProfile[input.name] !== undefined ? currentProfile[input.name] : "";
  });
}

/**
 * Render the overview cards located below the profile form.
 */
export function updateProfileOverviews(defaultAddress, latestOrder) {
  renderOverviewAddress(overviewAddressEl, defaultAddress);
  renderOverviewOrder(overviewOrderEl, latestOrder);
}

/**
 * Toggle form editing mode (readonly vs editable).
 */
export function setProfileEditing(isEditing) {
  if (!profileForm) return;
  profileForm.classList.toggle("is-readonly", !isEditing);

  const inputs = profileForm.querySelectorAll("input");
  inputs.forEach(function setReadonly(input) {
    input.readOnly = !isEditing || input.name === "email";
  });

  if (profileActions) profileActions.hidden = !isEditing;
  if (editProfileBtn) editProfileBtn.hidden = isEditing;

  if (isEditing) {
    const firstInput = profileForm.querySelector('input:not([readonly])');
    if (firstInput) firstInput.focus();
  }
}

/**
 * Handle profile form submit and save changes.
 */
async function handleProfileSave(event) {
  event.preventDefault();
  clearMessage(profileMessage);

  const editableInputs = [...profileForm.querySelectorAll("input")].filter(function filterInput(input) {
    return input.name !== "email";
  });

  if (!validateInputs(editableInputs)) {
    showMessage(profileMessage, "Please fix the highlighted fields.", "error");
    return;
  }

  const payload = {};
  editableInputs.forEach(function gatherField(input) {
    payload[input.name] = input.value.trim();
  });

  if (saveProfileBtn) {
    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = "Saving...";
  }

  try {
    await updateProfile(payload);
    currentProfile = { ...currentProfile, ...payload };
    renderProfileForm(currentProfile);
    setProfileEditing(false);
    showToast("Profile updated successfully.");

    if (typeof onProfileUpdatedCallback === "function") {
      onProfileUpdatedCallback(currentProfile);
    }
  } catch (error) {
    if (!error.unauthorized) {
      showMessage(profileMessage, error.message || "Could not update profile.", "error");
    }
  } finally {
    if (saveProfileBtn) {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = "Save changes";
    }
  }
}

/**
 * Cancel profile editing and restore original values.
 */
function handleProfileCancel() {
  renderProfileForm(currentProfile);
  if (profileForm) {
    profileForm.querySelectorAll("input").forEach(function clearError(input) {
      setFieldError(input, "");
    });
  }
  clearMessage(profileMessage);
  setProfileEditing(false);
}

/**
 * Initialize profile event listeners.
 */
export function initProfileController(options = {}) {
  onProfileUpdatedCallback = options.onProfileUpdated || null;

  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", function handleEditClick() {
      clearMessage(profileMessage);
      setProfileEditing(true);
    });
  }

  if (cancelProfileBtn) {
    cancelProfileBtn.addEventListener("click", handleProfileCancel);
  }

  if (profileForm) {
    profileForm.addEventListener("submit", handleProfileSave);
  }
}
