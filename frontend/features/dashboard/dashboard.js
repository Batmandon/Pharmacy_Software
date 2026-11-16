/**
 * Dashboard Feature: Main Coordinator
 * Coordinates view transitions (Overview, Orders, Products), hash routing, modal backdrops, and bootstrap lifecycle.
 */
import { isAlertsStale, setAlertsStale } from "./api.js";
import { initAdminProfile, initAdminLogout, loadDashboardStats } from "./profile.js";
import { initOrders, loadOrders, loadRecentOrders } from "./orders.js";
import { initProducts, loadProducts, loadAlerts } from "./products.js";

const VIEWS = ["overview", "orders", "products"];
const VIEW_TITLES = {
  overview: "Overview",
  orders: "Orders",
  products: "Products",
};

const viewLoaded = {
  orders: false,
  products: false,
};

/**
 * Switch active dashboard view between Overview, Orders, and Products.
 */
export function showView(viewName, options = {}) {
  const updateHash = options.updateHash !== false;
  let targetView = viewName;
  if (!VIEWS.includes(targetView)) {
    targetView = "overview";
  }

  const navItems = document.querySelectorAll(".nav-item[data-view]");
  navItems.forEach(function updateNavActive(item) {
    item.classList.toggle("active", item.dataset.view === targetView);
  });

  VIEWS.forEach(function toggleSectionVisibility(viewId) {
    const viewSection = document.getElementById(`view-${viewId}`);
    if (viewSection) {
      viewSection.hidden = viewId !== targetView;
    }
  });

  const titleEl = document.getElementById("view-title");
  if (titleEl) {
    titleEl.textContent = VIEW_TITLES[targetView] || "Overview";
  }

  if (updateHash && typeof history !== "undefined" && typeof history.replaceState === "function") {
    history.replaceState(null, "", `#${targetView}`);
  }

  // Refresh alert cards if data changed while on another tab
  if (targetView === "overview" && isAlertsStale()) {
    setAlertsStale(false);
    loadAlerts();
  }

  // Lazy load views when visited for the first time
  if (targetView === "orders" && !viewLoaded.orders) {
    viewLoaded.orders = true;
    loadOrders();
  }
  if (targetView === "products" && !viewLoaded.products) {
    viewLoaded.products = true;
    loadProducts();
  }
}

/**
 * Check whether a dialog is locked/static (should not close on backdrop click or Escape).
 */
function isDialogStatic(dialog) {
  if (!dialog) {
    return false;
  }
  return dialog.id === "product-dialog" || dialog.hasAttribute("data-static") || dialog.dataset.static === "true";
}

/**
 * Provide a subtle bounce animation when the user attempts to dismiss a static/locked modal.
 */
function triggerDialogStaticFeedback(dialog) {
  if (!dialog) {
    return;
  }
  dialog.classList.remove("dialog-bounce");
  void dialog.offsetWidth;
  dialog.classList.add("dialog-bounce");
  dialog.addEventListener(
    "animationend",
    function handleAnimationEnd() {
      dialog.classList.remove("dialog-bounce");
    },
    { once: true }
  );
}

/**
 * Attach global event listeners for navigation, links, and dialog backdrops.
 */
function initNavigationEvents() {
  const navEl = document.getElementById("nav");
  if (navEl) {
    navEl.addEventListener("click", function handleNavClick(event) {
      const btn = event.target.closest("[data-view]");
      if (btn && btn.dataset.view) {
        showView(btn.dataset.view);
      }
    });
  }

  document.addEventListener("click", function handleGlobalClicks(event) {
    // Links leading to specific views, e.g. "View all orders"
    const viewLink = event.target.closest("[data-view-link]");
    if (viewLink && viewLink.dataset.viewLink) {
      showView(viewLink.dataset.viewLink);
      return;
    }

    // Quick jump to product from low-stock or expiry table
    const findProductBtn = event.target.closest('[data-action="find-product"]');
    if (findProductBtn) {
      const row = findProductBtn.closest("tr");
      const productName = row ? row.dataset.name : "";
      if (productName) {
        showView("products");
        const searchInput = document.getElementById("product-search");
        if (searchInput) {
          searchInput.value = productName;
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      return;
    }

    // Close buttons on dialogs
    const closer = event.target.closest("[data-close]");
    if (closer) {
      const dialog = closer.closest("dialog");
      if (dialog && typeof dialog.close === "function") {
        dialog.close();
      }
      return;
    }

    // Backdrop click on native <dialog>
    if (event.target instanceof HTMLDialogElement) {
      if (isDialogStatic(event.target)) {
        triggerDialogStaticFeedback(event.target);
        return;
      }
      event.target.close();
    }
  });

  // Intercept the native HTML5 dialog cancel event (triggered by Escape key)
  document.addEventListener(
    "cancel",
    function handleDialogCancel(event) {
      if (event.target instanceof HTMLDialogElement && isDialogStatic(event.target)) {
        event.preventDefault();
        triggerDialogStaticFeedback(event.target);
      }
    },
    true
  );

  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", function handleHashChange() {
      const requestedView = window.location.hash.slice(1);
      showView(requestedView, { updateHash: false });
    });
  }
}

/**
 * Bootstrap dashboard feature.
 */
export async function initDashboard() {
  initNavigationEvents();
  initAdminLogout();
  initProducts();
  initOrders();

  const profile = await initAdminProfile();
  if (!profile) {
    return;
  }

  const initialView = (typeof window !== "undefined" && window.location.hash.slice(1)) || "overview";
  showView(initialView, { updateHash: false });

  loadDashboardStats();
  loadRecentOrders();
  loadAlerts();
}

// Auto-run if running in browser
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboard);
  } else {
    initDashboard();
  }
}
