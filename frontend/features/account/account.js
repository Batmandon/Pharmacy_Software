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

function updateStatsAndOverviews() {
  const activeOrders = state.orders.filter(function checkActive(order) {
    const s = String(order.status || "").toLowerCase();
    return s === "pending" || s === "processing" || s === "confirmed";
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

function showTab(name, options = { updateHash: true }) {
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

function renderOrdersList() {
  if (!orderListEl) return;

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

async function initAccountPage() {
  const initialHash = typeof location !== "undefined" ? location.hash.slice(1) : "";
  showTab(initialHash || "profile", { updateHash: false });

  // 1. Fetch Profile and check authorization
  let profileData;
  try {
    profileData = await fetchProfile();
  } catch (error) {
    if (!error.unauthorized && pageMessage) {
      showMessage(pageMessage, "Could not load your profile. Please refresh.", "error");
    }
    return;
  }

  if (profileData && profileData.role === "admin") {
    window.location.replace("dashboard.html");
    return;
  }

  state.profile = profileData || {};

  // 2. Initialize Sub-Controllers
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

  renderProfileForm(state.profile);

  // 3. Fetch Addresses and Orders in parallel
  const [addressResult, orderResult] = await Promise.allSettled([
    fetchAddresses(),
    fetchCustomerOrders(),
  ]);

  if (addressResult.status === "fulfilled") {
    state.addresses = addressResult.value || [];
    renderAddressesList(state.addresses);
  }

  if (orderResult.status === "fulfilled") {
    state.orders = orderResult.value || [];
    renderOrdersList();
  }

  updateStatsAndOverviews();

  // 4. Attach Navigation & Global Dialog Listeners
  const tabsNav = document.getElementById("tabs");
  if (tabsNav) {
    tabsNav.addEventListener("click", function handleTabClick(event) {
      const tabBtn = event.target.closest(".tab");
      if (tabBtn && tabBtn.dataset.tab) {
        showTab(tabBtn.dataset.tab);
      }
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", function handleHashChange() {
      showTab(location.hash.slice(1), { updateHash: false });
    });
  }

  document.addEventListener("click", function handleQuickJumpClick(event) {
    const jumpLink = event.target.closest("[data-goto]");
    if (jumpLink && jumpLink.dataset.goto) {
      showTab(jumpLink.dataset.goto);
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogoutClick);
  }

  document.addEventListener("click", function handleDialogCloser(event) {
    const closer = event.target.closest("[data-close]");
    if (closer) {
      const dialog = closer.closest("dialog");
      if (dialog) dialog.close();
      return;
    }
    if (event.target instanceof HTMLDialogElement) {
      event.target.close();
    }
  });

  document.addEventListener("input", function handleDigitSanitizing(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.form) return;
    if (input.name === "phone" || input.name === "pincode") {
      input.value = input.value.replace(/\D/g, "");
    }
  });
}

if (typeof document !== "undefined") {
  initAccountPage();
}
