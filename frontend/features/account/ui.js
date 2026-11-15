/**
 * Account Feature: UI Layer
 * Field validation, Address card components, Overview cards, and Hero stats banner.
 */
import { formatDate, formatPrice } from "../../shared/utils.js";
import { renderStatusBadge } from "../orders/ui.js";
import { getOrderNumber, getOrderTotal } from "../orders/api.js";

// Validation rules (matches backend rules)
const VALIDATION_RULES = {
  first_name: function validateFirstName(value) {
    if (!value) return "First name is required.";
    if (!/^[A-Za-z\s.'-]{1,20}$/.test(value)) return "Use letters only (max 20).";
    return "";
  },
  last_name: function validateLastName(value) {
    if (!value) return "Last name is required.";
    if (!/^[A-Za-z\s.'-]{1,20}$/.test(value)) return "Use letters only (max 20).";
    return "";
  },
  phone: function validatePhone(value) {
    if (!value) return "Mobile number is required.";
    if (!/^[6-9]\d{9}$/.test(value)) return "Enter a valid 10-digit mobile number.";
    return "";
  },
  email: function validateEmail(value) {
    if (!value) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
    return "";
  },
  line: function validateLine(value) {
    if (!value) return "Address is required.";
    if (value.length < 5) return "Address is too short.";
    if (value.length > 300) return "Address is too long (max 300).";
    return "";
  },
  city: function validateCity(value) {
    if (!value) return "City is required.";
    if (!/^[A-Za-z\s.'-]{2,100}$/.test(value)) return "Enter a valid city name (letters only, 2-100).";
    return "";
  },
  pincode: function validatePincode(value) {
    if (!value) return "Pincode is required.";
    if (!/^[1-9]\d{5}$/.test(value)) return "Enter a valid 6-digit pincode.";
    return "";
  },
};

/**
 * Validate a single field by its input name.
 */
export function validateField(name, value) {
  const validator = VALIDATION_RULES[name];
  if (typeof validator === "function") {
    return validator(typeof value === "string" ? value.trim() : "");
  }
  return "";
}

/**
 * Set or clear error state on a field element.
 */
export function setFieldError(inputElement, errorMessage) {
  if (!inputElement) return;
  const fieldContainer = inputElement.closest(".field");
  if (fieldContainer) {
    const errorEl = fieldContainer.querySelector(".error");
    if (errorEl) {
      errorEl.textContent = errorMessage || "";
    }
  }
  inputElement.classList.toggle("invalid", Boolean(errorMessage));
}

/**
 * Validate a list of input elements simultaneously.
 */
export function validateInputs(inputElements) {
  let isAllValid = true;
  inputElements.forEach(function checkInput(input) {
    const errorMessage = validateField(input.name, input.value);
    setFieldError(input, errorMessage);
    if (errorMessage) {
      isAllValid = false;
    }
  });
  return isAllValid;
}

/**
 * Render a single address card.
 */
export function renderAddressCard(address, options = {}) {
  const isDefault = Boolean(options.isDefault);
  const article = document.createElement("article");
  article.className = `address-card${isDefault ? " is-default" : ""}`;

  // Default Badge
  if (isDefault) {
    const badge = document.createElement("span");
    badge.className = "badge-default";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-circle-check";
    badge.append(icon, document.createTextNode(" Default"));
    article.append(badge);
  }

  // Address lines
  const lineP = document.createElement("p");
  lineP.className = "addr-line";
  lineP.textContent = address.line || "";

  const subP = document.createElement("p");
  subP.className = "addr-sub";
  subP.textContent = `${address.city || ""} - ${address.pincode || ""}`;

  const phoneP = document.createElement("p");
  phoneP.className = "addr-phone";
  const phoneIcon = document.createElement("i");
  phoneIcon.className = "fa-solid fa-phone";
  phoneP.append(phoneIcon, document.createTextNode(` ${address.phone || ""}`));

  // Card Actions
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "card-actions";

  if (!isDefault && options.onSetDefault) {
    const defaultBtn = document.createElement("button");
    defaultBtn.type = "button";
    defaultBtn.className = "link-btn";
    defaultBtn.dataset.action = "default";
    defaultBtn.dataset.id = String(address.id);
    const defIcon = document.createElement("i");
    defIcon.className = "fa-regular fa-circle-check";
    defaultBtn.append(defIcon, document.createTextNode(" Set as default"));
    defaultBtn.addEventListener("click", function handleDefaultClick() {
      options.onSetDefault(address);
    });
    actionsDiv.append(defaultBtn);
  }

  if (options.onEdit) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "link-btn";
    editBtn.dataset.action = "edit";
    editBtn.dataset.id = String(address.id);
    const editIcon = document.createElement("i");
    editIcon.className = "fa-solid fa-pen";
    editBtn.append(editIcon, document.createTextNode(" Edit"));
    editBtn.addEventListener("click", function handleEditClick() {
      options.onEdit(address);
    });
    actionsDiv.append(editBtn);
  }

  if (options.onDelete) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "link-btn danger";
    deleteBtn.dataset.action = "delete";
    deleteBtn.dataset.id = String(address.id);
    const delIcon = document.createElement("i");
    delIcon.className = "fa-solid fa-trash";
    deleteBtn.append(delIcon, document.createTextNode(" Delete"));
    deleteBtn.addEventListener("click", function handleDeleteClick() {
      options.onDelete(address);
    });
    actionsDiv.append(deleteBtn);
  }

  article.append(lineP, subP, phoneP, actionsDiv);
  return article;
}

/**
 * Render the default address overview card.
 */
export function renderOverviewAddress(container, defaultAddress) {
  if (!container) return;
  container.replaceChildren();

  if (defaultAddress) {
    const lineP = document.createElement("p");
    lineP.className = "strong";
    lineP.textContent = defaultAddress.line || "";

    const subP = document.createElement("p");
    subP.className = "sub";
    subP.textContent = `${defaultAddress.city || ""} - ${defaultAddress.pincode || ""}`;

    const phoneP = document.createElement("p");
    phoneP.className = "sub";
    phoneP.textContent = defaultAddress.phone || "";

    container.append(lineP, subP, phoneP);
  } else {
    const emptyP = document.createElement("p");
    emptyP.className = "muted";
    emptyP.textContent = "No address saved yet.";
    container.append(emptyP);
  }
}

/**
 * Render the latest order overview card.
 */
export function renderOverviewOrder(container, latestOrder) {
  if (!container) return;
  container.replaceChildren();

  if (latestOrder) {
    const orderNo = getOrderNumber(latestOrder);
    const orderTotal = getOrderTotal(latestOrder);

    const titleP = document.createElement("p");
    titleP.className = "strong";
    titleP.textContent = `Order #${orderNo}`;

    const subP = document.createElement("p");
    subP.className = "sub";
    subP.textContent = `${formatDate(latestOrder.created_at)} • ${formatPrice(orderTotal)}`;

    const statusBadge = renderStatusBadge(latestOrder.status);
    container.append(titleP, subP, statusBadge);
  } else {
    const emptyP = document.createElement("p");
    emptyP.className = "muted";
    emptyP.textContent = "No orders yet.";
    container.append(emptyP);
  }
}

/**
 * Update the hero user greeting and stats.
 */
export function updateHeroBanner(profile, stats = {}) {
  const first = profile && profile.first_name ? String(profile.first_name).trim() : "";
  const last = profile && profile.last_name ? String(profile.last_name).trim() : "";

  const avatar = document.getElementById("avatar");
  if (avatar) {
    const initials = ((first[0] || "") + (last[0] || "")).toUpperCase() || "?";
    avatar.textContent = initials;
  }

  const heroName = document.getElementById("hero-name");
  if (heroName) {
    heroName.textContent = first ? `Hello, ${first}!` : "Welcome!";
  }

  const heroSub = document.getElementById("hero-sub");
  if (heroSub) {
    const details = [profile?.email, profile?.phone].filter(Boolean).join("  •  ");
    heroSub.textContent = details || "Manage your profile, addresses and orders.";
  }

  const statOrders = document.getElementById("stat-orders");
  if (statOrders) {
    statOrders.textContent = String(stats.orderCount !== undefined ? stats.orderCount : 0);
  }

  const statActive = document.getElementById("stat-active");
  if (statActive) {
    statActive.textContent = String(stats.activeOrderCount !== undefined ? stats.activeOrderCount : 0);
  }

  const statAddresses = document.getElementById("stat-addresses");
  if (statAddresses) {
    statAddresses.textContent = String(stats.addressCount !== undefined ? stats.addressCount : 0);
  }
}
