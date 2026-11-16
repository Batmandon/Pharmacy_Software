/**
 * Dashboard Feature: Profile & Overview KPI Controller
 * Handles admin session verification, admin header name, logout flow, and overview statistics tiles.
 */
import {
  formatNumber,
  formatPrice,
  confirmAction,
  showToast,
  showMessage,
  clearMessage,
} from "../../shared/utils.js";
import { fetchProfile, logoutUser } from "../account/api.js";
import { request, DASHBOARD_PATHS, DASHBOARD_CONFIG } from "./api.js";

/**
 * Format a numeric value safely.
 */
function toNumber(value) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return number;
  }
  return 0;
}

/**
 * Render KPI summary metrics into the overview tiles.
 */
export function renderStats(statistics) {
  const statTodayEl = document.getElementById("stat-today");
  const statPendingEl = document.getElementById("stat-pending");
  const statRevenueEl = document.getElementById("stat-revenue");
  const statActiveProductsEl = document.getElementById("stat-active-products");

  if (statTodayEl) {
    statTodayEl.textContent = formatNumber(toNumber(statistics.today_orders));
  }
  if (statPendingEl) {
    statPendingEl.textContent = formatNumber(toNumber(statistics.pending_orders));
  }
  if (statRevenueEl) {
    const revenueAmount = toNumber(statistics.revenue);
    statRevenueEl.textContent = formatPrice(revenueAmount) || `â‚¹${revenueAmount}`;
  }
  if (statActiveProductsEl) {
    statActiveProductsEl.textContent = formatNumber(toNumber(statistics.active_products));
  }
}

/**
 * Fetch and display the dashboard summary stats.
 */
export async function loadDashboardStats() {
  const pageMessageEl = document.getElementById("page-message");
  try {
    const statsData = await request("GET", DASHBOARD_PATHS.dashboard);
    renderStats(statsData);
    if (pageMessageEl) {
      clearMessage(pageMessageEl);
    }
  } catch (error) {
    if (!error.redirecting && pageMessageEl) {
      showMessage(pageMessageEl, `Could not load the summary. ${error.message}`, "error");
    }
  }
}

/**
 * Verify that the current logged-in user is an administrator and display their name.
 */
export async function initAdminProfile() {
  const adminNameEl = document.getElementById("admin-name");
  const pageMessageEl = document.getElementById("page-message");

  let profile;
  try {
    profile = await fetchProfile();
  } catch (error) {
    if (!error.unauthorized && !error.redirecting && pageMessageEl) {
      showMessage(pageMessageEl, `Could not load the dashboard. ${error.message}`, "error");
    }
    return null;
  }

  if (!profile || profile.role !== "admin") {
    if (typeof window !== "undefined") {
      window.location.replace(DASHBOARD_CONFIG.ACCOUNT_PAGE);
    }
    return null;
  }

  if (adminNameEl) {
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    adminNameEl.textContent = fullName || "Admin";
  }

  return profile;
}

/**
 * Attach the logout button handler with confirmation dialog.
 */
export function initAdminLogout() {
  const logoutBtn = document.getElementById("logout-btn");
  if (!logoutBtn) {
    return;
  }

  logoutBtn.addEventListener("click", async function handleLogoutClick() {
    const confirmed = await confirmAction({
      title: "Log out?",
      text: "You will need to log in again to open the dashboard.",
      confirmLabel: "Logout",
    });

    if (!confirmed) {
      return;
    }

    try {
      await logoutUser();
      if (typeof window !== "undefined") {
        window.location.href = DASHBOARD_CONFIG.LOGIN_PAGE;
      }
    } catch (error) {
      if (!error.redirecting) {
        showToast(error.message || "Failed to log out.");
      }
    }
  });
}
