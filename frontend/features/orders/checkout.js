/**
 * Orders Feature: Checkout Controller
 * Coordinates the checkout process: Cart summary, Fulfillment selection,
 * Delivery address management, and Order placement.
 */
import { formatPrice, showToast } from "../../shared/utils.js";
import {
  fetchCart,
  removeCartItem,
  placeOrder,
  fetchDeliveryAddresses,
} from "./api.js";
import { renderCartItem } from "./ui.js";

const DELIVERY_CHARGE = 30;
const PICKUP_ADDRESS = "Shama Medical Store, Behjam, Lakhimpur-kheri";

// State
let cart = [];
let cartSubtotal = 0;
let cartReady = false;
let selectedFulfillment = "delivery";
let orderInProgress = false;

// DOM Elements
const summary = document.getElementById("sum");
const cartItems = document.getElementById("cart-items");
const cartMessage = document.getElementById("cart-message");
const addressContainer = document.getElementById("checkout-address");
const addressTitle = document.getElementById("atitle");
const addressText = document.getElementById("atext");
const addressPicker = document.getElementById("delivery-address-select");
const addressPickerLabel = document.querySelector(".address-picker-label");
const fulfillmentOptions = document.getElementById("fulfillment-options");
const orderButtons = document.querySelectorAll("[data-order]");
const summaryToggle = document.getElementById("tg");

function setCartMessage(messageText) {
  if (!cartMessage) return;
  cartMessage.textContent = messageText;
  cartMessage.hidden = false;
}

function updateOrderButtons() {
  const addressId = addressContainer ? Number(addressContainer.dataset.addressId) : 0;
  const hasValidAddress = selectedFulfillment === "pickup"
    || (Number.isSafeInteger(addressId) && addressId > 0);

  const canPlaceOrder = cartReady && cart.length > 0 && hasValidAddress && !orderInProgress;

  orderButtons.forEach(function setButtonState(button) {
    button.disabled = !canPlaceOrder;
  });
}

function renderCart(subtotal) {
  if (!cartItems || !summary) return;

  const renderedItems = cart.map(function mapCartItem(item) {
    return renderCartItem(item, {
      onRemove: handleRemoveCartItem,
    });
  });
  cartItems.replaceChildren(...renderedItems);

  const hasItems = cart.length > 0;
  const delivery = hasItems && selectedFulfillment === "delivery" ? DELIVERY_CHARGE : 0;
  const total = subtotal + delivery;
  const countLabel = `Order summary (${cart.length} ${cart.length === 1 ? "item" : "items"})`;

  const mobileTitle = document.getElementById("mobile-summary-title");
  if (mobileTitle) mobileTitle.textContent = countLabel;

  const desktopTitle = document.getElementById("desktop-summary-title");
  if (desktopTitle) desktopTitle.textContent = countLabel;

  const subtotalEl = summary.querySelector('[data-summary="subtotal"]');
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

  const deliveryEl = summary.querySelector('[data-summary="delivery"]');
  if (deliveryEl) deliveryEl.textContent = formatPrice(delivery);

  const taxEl = summary.querySelector('[data-summary="tax"]');
  if (taxEl) taxEl.textContent = formatPrice(0);

  const totalEl = summary.querySelector('[data-summary="total"]');
  if (totalEl) totalEl.textContent = formatPrice(total);

  const mobileTotalEl = document.querySelector('[data-summary="mobile-total"]');
  if (mobileTotalEl) mobileTotalEl.textContent = formatPrice(total);

  updateOrderButtons();

  if (hasItems) {
    if (cartMessage) cartMessage.hidden = true;
  } else {
    setCartMessage("Your cart is empty.");
  }
}

function renderDeliveryAddress() {
  if (!addressPicker || !addressContainer || !addressText) return;

  const selectedAddress = addressPicker.selectedOptions[0];
  const addressId = selectedAddress ? selectedAddress.dataset.addressId : null;

  if (!addressId) {
    addressContainer.removeAttribute("data-address-id");
    addressText.textContent = "No saved delivery address. Add an address before ordering.";
    updateOrderButtons();
    return;
  }

  addressContainer.dataset.addressId = addressId;
  addressText.textContent = selectedAddress.dataset.addressText || "";
  if (addressTitle) addressTitle.textContent = "Deliver to";
  updateOrderButtons();
}

async function loadAddresses() {
  if (!addressPicker || !addressContainer) return;

  try {
    const addresses = await fetchDeliveryAddresses();
    const options = addresses.map(function mapAddressOption(address) {
      const id = Number(address.id);
      const addressParts = [address.line, address.city, address.pincode, address.phone]
        .filter(function checkPart(part) {
          return typeof part === "string" && part.trim();
        });

      const option = document.createElement("option");
      option.value = String(id);
      option.dataset.addressId = String(id);
      option.dataset.addressText = addressParts.join(", ");
      option.textContent = option.dataset.addressText;
      return option;
    });

    addressPicker.replaceChildren(...options);

    if (options.length === 0) {
      addressContainer.removeAttribute("data-address-id");
      if (addressTitle) addressTitle.textContent = "Deliver to";
      if (addressText) addressText.textContent = "No saved delivery address. Add an address before ordering.";
      addressPicker.hidden = true;
      if (addressPickerLabel) addressPickerLabel.hidden = true;
      updateOrderButtons();
      return;
    }

    if (addressPickerLabel) addressPickerLabel.hidden = options.length < 2;
    addressPicker.hidden = options.length < 2;
    renderDeliveryAddress();
  } catch (error) {
    console.error("Could not load delivery addresses:", error);
    if (addressText) {
      addressText.textContent = error.message || "Could not load delivery addresses.";
    }
    updateOrderButtons();
  }
}

function setFulfillment(mode) {
  selectedFulfillment = mode;
  if (fulfillmentOptions) {
    fulfillmentOptions.querySelectorAll("[data-fulfillment]").forEach(function setPressed(button) {
      const isSelected = button.dataset.fulfillment === mode;
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  const isPickup = mode === "pickup";
  if (addressPicker) {
    addressPicker.hidden = isPickup || addressPicker.options.length < 2;
  }
  if (addressPickerLabel) {
    addressPickerLabel.hidden = isPickup || addressPicker.hidden;
  }

  if (isPickup) {
    if (addressContainer) addressContainer.removeAttribute("data-address-id");
    if (addressTitle) addressTitle.textContent = "Pick up at";
    if (addressText) addressText.textContent = PICKUP_ADDRESS;
  } else {
    renderDeliveryAddress();
  }

  renderCart(cartSubtotal);
}

async function handleRemoveCartItem(productId, button) {
  if (button) button.disabled = true;

  try {
    await removeCartItem(productId);
    showToast("Item removed from cart.");
    await loadCart();
  } catch (error) {
    console.error("Could not remove cart item:", error);
    if (button) button.disabled = false;
    showToast(error.message || "Could not remove this item. Please try again.");
  }
}

async function loadCart() {
  try {
    const cartData = await fetchCart();
    cart = cartData.items;
    cartSubtotal = cartData.total;
    cartReady = true;
    renderCart(cartSubtotal);
  } catch (error) {
    console.error("Could not load cart:", error);
    cart = [];
    cartSubtotal = 0;
    cartReady = false;
    if (cartItems) cartItems.replaceChildren();
    renderCart(0);
    setCartMessage(error.message || "Could not load your cart. Please try again.");
  }
}

async function handlePlaceOrderSubmit(event) {
  event.preventDefault();
  const button = event.currentTarget;
  if (!button || button.disabled || orderInProgress) return;

  const payload = {
    payment_method: selectedFulfillment === "pickup" ? "pickup" : "cod",
  };

  if (selectedFulfillment === "delivery") {
    const addressId = addressContainer ? Number(addressContainer.dataset.addressId) : 0;
    if (!Number.isSafeInteger(addressId) || addressId <= 0) {
      showToast("Choose a saved delivery address before ordering.");
      return;
    }
    payload.address_id = addressId;
  }

  orderInProgress = true;
  updateOrderButtons();

  try {
    const result = await placeOrder(payload);
    const orderNo = result.order_id || result.id || "";
    showToast(`Order placed successfully${orderNo ? ` (#${orderNo})` : ""}!`);
    await loadCart();
  } catch (error) {
    console.error("Could not place order:", error);
    showToast(error.message || "Could not place your order. Please try again.");
  } finally {
    orderInProgress = false;
    updateOrderButtons();
  }
}

function initCheckout() {
  if (fulfillmentOptions) {
    fulfillmentOptions.addEventListener("click", function handleFulfillmentClick(event) {
      const button = event.target.closest("[data-fulfillment]");
      if (!button || !fulfillmentOptions.contains(button)) return;
      setFulfillment(button.dataset.fulfillment);
    });
  }

  if (addressPicker) {
    addressPicker.addEventListener("change", renderDeliveryAddress);
  }

  if (summaryToggle && summary) {
    summaryToggle.addEventListener("click", function toggleSummary() {
      const isOpen = summary.classList.toggle("open");
      summaryToggle.setAttribute("aria-expanded", String(isOpen));
      const toggleLabel = document.getElementById("tgl");
      if (toggleLabel) {
        toggleLabel.textContent = isOpen ? "Hide" : "Show";
      }
    });
  }

  orderButtons.forEach(function attachOrderListener(button) {
    button.addEventListener("click", handlePlaceOrderSubmit);
  });

  // Initial load
  loadAddresses();
  loadCart();
}

if (typeof document !== "undefined") {
  initCheckout();
}
