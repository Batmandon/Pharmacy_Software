/**
 * Shared ES Module Utilities for Modern Features
 */

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function getAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function isValidAmount(value) {
  return value === null || value === undefined || getAmount(value) !== null;
}

export function formatPrice(value) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function getImageUrl(value, baseHref) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  try {
    const base = baseHref || (typeof window !== "undefined" && window.location ? window.location.href : "http://localhost:5500");
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export const getSafeImageUrl = getImageUrl;

const defaultDateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDate(value, dateFmt = defaultDateFmt) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

const defaultDateOnlyFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDateOnly(value) {
  if (!value) return "";
  const dateString = typeof value === "string" && !value.includes("T") ? `${value}T00:00:00Z` : value;
  const d = new Date(dateString);
  return Number.isNaN(d.getTime()) ? "" : defaultDateOnlyFmt.format(d);
}

const indianNumberFmt = new Intl.NumberFormat("en-IN");

export function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? indianNumberFmt.format(num) : "0";
}

export function renderTableMessage(tbody, columns, text) {
  if (!tbody) return;
  const td = document.createElement("td");
  td.colSpan = columns;
  td.className = "empty";
  td.textContent = text;
  const tr = document.createElement("tr");
  tr.append(td);
  tbody.replaceChildren(tr);
}

export function addressText(a) {
  if (!a) return "";
  if (typeof a === "string") return a;
  const place = [a.city, a.pincode].filter(Boolean).join(" - ");
  return [a.line, place].filter(Boolean).join(", ");
}

export function getErrorMessage(body, status) {
  if (!body) return `Request failed${status ? ` (HTTP ${status})` : ""}. Please try again.`;
  if (typeof body.detail === "string") {
    return body.detail;
  }
  if (Array.isArray(body.detail)) {
    return body.detail.map((err) => err.msg || JSON.stringify(err)).join(" ");
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  if (typeof body.message === "string") {
    return body.message;
  }
  return `Request failed${status ? ` (HTTP ${status})` : ""}. Please try again.`;
}

export async function readResponse(response) {
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { detail: text };
    }
  }
  if (!response.ok) {
    throw new Error(getErrorMessage(body, response.status));
  }
  return body;
}

export function showMessage(element, text, type = "error") {
  if (!element) return;
  element.textContent = text;
  element.className = `form-message ${type ? `is-${type} ${type}` : ""}`.trim();
  element.hidden = false;
}

export function clearMessage(element) {
  if (!element) return;
  element.textContent = "";
  element.className = "form-message";
  element.hidden = true;
}

let toastTimer = null;
export function showToast(text, duration = 3000) {
  const toast = typeof document !== "undefined"
    ? (document.getElementById("toast") || document.querySelector(".toast"))
    : null;
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

export function confirmAction({ title, text, confirmLabel = "Confirm" }) {
  if (typeof document === "undefined") return Promise.resolve(false);
  const dialog = document.getElementById("confirm-dialog");
  if (!dialog || typeof dialog.showModal !== "function") {
    return Promise.resolve(typeof window !== "undefined" && window.confirm ? window.confirm(`${title}\n\n${text}`) : true);
  }

  const titleEl = document.getElementById("confirm-title");
  const textEl = document.getElementById("confirm-text");
  const okBtn = document.getElementById("confirm-ok") || dialog.querySelector('button[value="confirm"]');
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  if (okBtn) okBtn.textContent = confirmLabel;

  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

// Global browser window attachment
if (typeof window !== "undefined") {
  window.AppUtils = {
    escapeHtml,
    getAmount,
    isValidAmount,
    formatPrice,
    getImageUrl,
    getSafeImageUrl,
    formatDate,
    formatDateOnly,
    formatNumber,
    renderTableMessage,
    addressText,
    getErrorMessage,
    readResponse,
    showMessage,
    clearMessage,
    showToast,
    confirmAction,
  };

  for (const [key, fn] of Object.entries(window.AppUtils)) {
    if (!window[key]) {
      window[key] = fn;
    }
  }
}

