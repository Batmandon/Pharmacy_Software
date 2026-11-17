/**
 * Account Feature: Page Orchestrator
 * Connects Profile, Addresses, Orders, and Tab navigation for account.html.
 */
import { confirmAction, showToast, showMessage } from "../../shared/utils.js";
import { fetchCustomerOrders } from "../orders/api.js";
import { renderOrderCard, populateOrderDialog } from "../orders/ui.js";
import {
  fetchProfile,
  fetchAddresses,
  logoutUser,
  getDefaultAddress,
} from "./api.js";
import { updateHeroBanner } from "./ui.js";
import {
  initProfileController,
  renderProfileForm,
  updateProfileOverviews,
} from "./profile.js";
import {
  initAddressController,
  renderAddressesList,
} from "./address.js";

// Page State
const state = {
  profile: {},
  addresses: [],
  orders: [],
};

// DOM Elements
const pageMessage = document.getElementById("page-message");
const orderListEl = document.getElementById("order-list");
const orderEmptyEl = document.getElementById("order-empty");
const orderDialog = document.getElementById("order-dialog");
const logoutBtn = document.getElementById("logout-btn");

/**
 * Update stats in hero banner and populate profile overview summary cards.
 */
function updateStatsAndOverviews() {
  const activeOrders = state.orders.filter(function checkActive(order) {
    const status = String(order.status || "").toLowerCase();
    return status === "pending" || status === "processing" || status === "confirmed";
  });

  updateHeroBanner(state.profile, {
    orderCount: state.orders.length,
    activeOrderCount: activeOrders.length,
    addressCount: state.addresses.length,
  });

  const defaultAddress = getDefaultAddress(state.addresses);
  const latestOrder = state.orders.length > 0 ? state.orders[0] : null;
  updateProfileOverviews(defaultAddress, latestOrder);
}

/**
 * Switch active account tab and show corresponding panel.
 */
export function showTab(name, options = { updateHash: true }) {
  const targetName = document.getElementById(`panel-${name}`) ? name : "profile";

  document.querySelectorAll(".tab").forEach(function updateTab(button) {
    const isActive = button.dataset.tab === targetName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll(".panel").forEach(function updatePanel(panel) {
    panel.hidden = panel.id !== `panel-${targetName}`;
  });

  if (options.updateHash && typeof history !== "undefined" && history.replaceState) {
    history.replaceState(null, "", `#${targetName}`);
  }
}

/**
 * Render customer order list cards.
 */
function renderOrdersList() {
  if (!orderListEl) return;

  if (state.orders.length === 0) {
    orderListEl.replaceChildren();
    if (orderEmptyEl) {
      orderEmptyEl.hidden = false;
    }
    return;
  }

  const renderedOrderCards = state.orders.map(function mapOrder(order) {
    return renderOrderCard(order, {
      onViewDetails: function handleDetails(selectedOrder) {
        if (!orderDialog) return;
        populateOrderDialog(orderDialog, selectedOrder);
        orderDialog.showModal();
      },
    });
  });

  orderListEl.replaceChildren(...renderedOrderCards);

  if (orderEmptyEl) {
    orderEmptyEl.hidden = state.orders.length > 0;
  }
}

/**
 * Handle user logout with confirmation modal.
 */
async function handleLogoutClick() {
  const confirmed = await confirmAction({
    title: "Log out?",
    text: "You will need to log in again to see your orders and addresses.",
    confirmLabel: "Logout",
  });
  if (!confirmed) return;

  try {
    await logoutUser();
    window.location.assign("login.html");
  } catch (error) {
    if (!error.unauthorized) {
      showToast(error.message || "Logout failed. Please try again.");
    }
  }
}

/**
 * Provide a subtle bounce animation when the user clicks the backdrop or presses Escape on a locked dialog.
 */
function triggerDialogStaticFeedback(dialog) {
  if (!dialog) return;
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
 * Attach synchronous event listeners for navigation, tabs, quick jumps, dialogs, and logout.
 * Must run immediately on page load so UI is never dead or blocked by async network calls.
 */
function initNavigationEvents() {
  // Tab switching
  const tabsNav = document.getElementById("tabs");
  if (tabsNav) {
    tabsNav.addEventListener("click", function handleTabClick(event) {
      const tabBtn = event.target.closest(".tab");
      if (tabBtn && tabBtn.dataset.tab) {
        showTab(tabBtn.dataset.tab);
      }
    });
  }

  // Hash change support
  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", function handleHashChange() {
      const requestedTab = window.location.hash.slice(1);
      showTab(requestedTab, { updateHash: false });
    });
  }

  // Quick jump links (e.g. data-goto="addresses" or data-goto="orders")
  document.addEventListener("click", function handleQuickJumpClick(event) {
    const jumpLink = event.target.closest("[data-goto]");
    if (jumpLink && jumpLink.dataset.goto) {
      showTab(jumpLink.dataset.goto);
    }
  });

  // Logout button
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogoutClick);
  }

  // Dialog close and backdrop interactions
  document.addEventListener("click", function handleDialogCloser(event) {
    const closer = event.target.closest("[data-close]");
    if (closer) {
      const dialog = closer.closest("dialog");
      if (dialog && typeof dialog.close === "function") {
        dialog.close();
      }
      return;
    }
    if (event.target instanceof HTMLDialogElement) {
      if (event.target.id === "address-dialog" || event.target.hasAttribute("data-static")) {
        triggerDialogStaticFeedback(event.target);
        return;
      }
      event.target.close();
    }
  });

  // Prevent Escape key dismissing static dialogs
  document.addEventListener(
    "cancel",
    function handleDialogCancel(event) {
      if (
        event.target instanceof HTMLDialogElement &&
        (event.target.id === "address-dialog" || event.target.hasAttribute("data-static"))
      ) {
        event.preventDefault();
        triggerDialogStaticFeedback(event.target);
      }
    },
    true
  );

  // Phone and Pincode digit sanitization
  document.addEventListener("input", function handleDigitSanitizing(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.form) return;
    if (input.name === "phone" || input.name === "pincode") {
      input.value = input.value.replace(/\D/g, "");
    }
  });
}

/**
 * Asynchronously fetch account profile, addresses, and orders from backend.
 * Gracefully handles offline or unauthenticated mode without crashing the page UI.
 */
async function hydrateAccountData() {
  // 1. Fetch Profile
  try {
    const profileData = await fetchProfile();
    if (profileData && profileData.role === "admin") {
      window.location.replace("dashboard.html");
      return;
    }
    state.profile = profileData || {};
    renderProfileForm(state.profile);
  } catch (error) {
    console.warn("Could not load backend profile:", error);
    if (pageMessage && !error.unauthorized) {
      showMessage(
        pageMessage,
        "Offline Preview: Backend not connected. You can test editing and addresses locally.",
        "info"
      );
    }
  }

  // 2. Fetch Addresses and Orders in parallel
  const [addressResult, orderResult] = await Promise.allSettled([
    fetchAddresses(),
    fetchCustomerOrders(),
  ]);

  if (addressResult.status === "fulfilled" && Array.isArray(addressResult.value)) {
    state.addresses = addressResult.value;
  } else {
    state.addresses = [];
  }
  renderAddressesList(state.addresses);

  if (orderResult.status === "fulfilled" && Array.isArray(orderResult.value)) {
    state.orders = orderResult.value;
  } else {
    state.orders = [];
  }
  renderOrdersList();

  updateStatsAndOverviews();
}

/**
 * Main initialization entry point.
 */
export async function initAccountPage() {
  // Step 1: Immediate synchronous UI bindings (Navigation, Tabs, Controllers, Dialogs)
  initNavigationEvents();

  initProfileController({
    onProfileUpdated: function handleProfileUpdate(updatedProfile) {
      state.profile = updatedProfile;
      updateStatsAndOverviews();
    },
  });

  initAddressController({
    onAddressesChanged: function handleAddressUpdate(updatedAddresses) {
      state.addresses = updatedAddresses;
      updateStatsAndOverviews();
    },
  });

  // Render initial form with default/blank profile so inputs are populated
  renderProfileForm(state.profile);

  // Set initial active tab from location hash or default to 'profile'
  const initialHash = typeof location !== "undefined" ? location.hash.slice(1) : "";
  showTab(initialHash || "profile", { updateHash: false });

  // Step 2: Non-blocking data hydration from backend
  await hydrateAccountData();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAccountPage);
  } else {
    initAccountPage();
  }
}
