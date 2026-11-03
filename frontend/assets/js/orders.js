(() => {
  const summary = document.getElementById("sum");
  const cartItems = document.getElementById("cart-items");
  const cartMessage = document.getElementById("cart-message");
  const addressContainer = document.getElementById("checkout-address");
  const addressTitle = document.getElementById("atitle");
  const addressText = document.getElementById("atext");
  const addressPicker = document.getElementById("delivery-address-select");
  const addressPickerLabel = document.querySelector(".address-picker-label");
  const fulfillmentOptions = document.getElementById("fulfillment-options");
  const toastElement = document.getElementById("t");
  const orderButtons = document.querySelectorAll("[data-order]");
  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  });
  const deliveryCharge = 30;
  const pickupAddress = "Shama Medical Store, Behjam, Lakhimpur-kheri";
  let cart = [];
  let cartSubtotal = 0;
  let cartReady = false;
  let selectedFulfillment = "delivery";
  let orderInProgress = false;
  let toastTimeout;

  function showToast(message) {
    toastElement.textContent = message;
    toastElement.classList.add("show");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      toastElement.classList.remove("show");
    }, 3000);
  }

  function setCartMessage(message) {
    cartMessage.textContent = message;
    cartMessage.hidden = false;
  }

  function formatAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("The cart response contains an invalid amount.");
    }
    return amount;
  }

  function getImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function createCartItem(item) {
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.cartItem = "";

    const imageContainer = document.createElement("div");
    imageContainer.className = "pill";
    const imageUrl = getImageUrl(item.img_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.replaceWith(document.createTextNode("💊"));
      }, { once: true });
      imageContainer.append(image);
    } else {
      imageContainer.textContent = "💊";
    }

    const details = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = item.name;
    const description = document.createElement("small");
    description.textContent = [
      item.strength,
      item.pack_size,
      `${currency.format(formatAmount(item.price))} each`,
      `Qty ${item.quantity}`,
    ].filter(Boolean).join(" · ");
    details.append(name, description);

    const price = document.createElement("span");
    price.className = "price";
    price.textContent = currency.format(formatAmount(item.line_total));

    const removeButton = document.createElement("button");
    removeButton.className = "remove-item";
    removeButton.type = "button";
    removeButton.dataset.removeItem = "";
    removeButton.dataset.productId = String(item.product_id);
    removeButton.setAttribute("aria-label", `Remove ${item.name} from cart`);
    removeButton.title = "Remove item";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-trash-can";
    icon.setAttribute("aria-hidden", "true");
    removeButton.append(icon);

    row.append(imageContainer, details, price, removeButton);
    return row;
  }

  function renderCart(subtotal) {
    cartItems.replaceChildren(...cart.map(createCartItem));
    const hasItems = cart.length > 0;
    const delivery = hasItems && selectedFulfillment === "delivery" ? deliveryCharge : 0;
    const total = subtotal + delivery;
    const countLabel = `Order summary (${cart.length} ${cart.length === 1 ? "item" : "items"})`;

    document.getElementById("mobile-summary-title").textContent = countLabel;
    document.getElementById("desktop-summary-title").textContent = countLabel;
    summary.querySelector('[data-summary="subtotal"]').textContent = currency.format(subtotal);
    summary.querySelector('[data-summary="delivery"]').textContent = currency.format(delivery);
    summary.querySelector('[data-summary="tax"]').textContent = currency.format(0);
    summary.querySelector('[data-summary="total"]').textContent = currency.format(total);
    document.querySelector('[data-summary="mobile-total"]').textContent = currency.format(total);
    updateOrderButtons();

    if (hasItems) {
      cartMessage.hidden = true;
    } else {
      setCartMessage("Your cart is empty.");
    }
  }

  function updateOrderButtons() {
    const addressId = Number(addressContainer.dataset.addressId);
    const hasAddress = selectedFulfillment === "pickup"
      || (Number.isSafeInteger(addressId) && addressId > 0);
    orderButtons.forEach((button) => {
      button.disabled = !cartReady || cart.length === 0 || !hasAddress || orderInProgress;
    });
  }

  function renderDeliveryAddress() {
    const selectedAddress = addressPicker.selectedOptions[0];
    const addressId = selectedAddress?.dataset.addressId;
    if (!addressId) {
      addressContainer.removeAttribute("data-address-id");
      addressText.textContent = "No saved delivery address. Add an address before ordering.";
      updateOrderButtons();
      return;
    }

    addressContainer.dataset.addressId = addressId;
    addressText.textContent = selectedAddress.dataset.addressText;
    addressTitle.textContent = "Deliver to";
    updateOrderButtons();
  }

  async function loadAddresses() {
    const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/addresses`, {
      credentials: "include",
    });
    const body = await readResponse(response);
    if (!Array.isArray(body.items)) {
      throw new Error("The address response is missing its items list.");
    }

    const options = body.items.map((address) => {
      const id = Number(address.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("The address response contains an invalid address ID.");
      }
      const addressParts = [address.line, address.city, address.pincode, address.phone]
        .filter((part) => typeof part === "string" && part.trim());
      const option = document.createElement("option");
      option.value = String(id);
      option.dataset.addressId = String(id);
      option.dataset.addressText = addressParts.join(", ");
      option.textContent = option.dataset.addressText;
      return option;
    });

    addressPicker.replaceChildren(...options);
    if (!options.length) {
      addressContainer.removeAttribute("data-address-id");
      addressTitle.textContent = "Deliver to";
      addressText.textContent = "No saved delivery address. Add an address before ordering.";
      addressPicker.hidden = true;
      addressPickerLabel.hidden = true;
      updateOrderButtons();
      return;
    }

    addressPickerLabel.hidden = options.length < 2;
    addressPicker.hidden = options.length < 2;
    renderDeliveryAddress();
  }

  function setFulfillment(mode) {
    selectedFulfillment = mode;
    fulfillmentOptions.querySelectorAll("[data-fulfillment]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.fulfillment === mode));
    });

    const isPickup = mode === "pickup";
    addressPicker.hidden = isPickup || addressPicker.options.length < 2;
    addressPickerLabel.hidden = addressPicker.hidden;
    if (isPickup) {
      addressContainer.removeAttribute("data-address-id");
      addressTitle.textContent = "Pick up at";
      addressText.textContent = pickupAddress;
    } else {
      renderDeliveryAddress();
    }

    renderCart(cartSubtotal);
  }

  async function readResponse(response) {
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
      const message = typeof body.detail === "string"
        ? body.detail
        : Array.isArray(body.detail)
          ? body.detail.map((error) => error.msg).join(" ")
          : `Request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return body;
  }

  async function loadCart() {
    try {
      const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/orders/items`, {
        credentials: "include",
      });
      const body = await readResponse(response);
      if (!Array.isArray(body.items)) {
        throw new Error("The cart response is missing its items list.");
      }
      cart = body.items;
      cartSubtotal = formatAmount(body.total);
      cartReady = true;
      renderCart(cartSubtotal);
    } catch (error) {
      console.error("Could not load cart:", error);
      cart = [];
      cartSubtotal = 0;
      cartReady = false;
      cartItems.replaceChildren();
      renderCart(0);
      setCartMessage(error.message || "Could not load your cart. Please try again.");
    }
  }

  summary.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;
    const removeButton = event.target.closest("[data-remove-item]");
    if (!removeButton || !summary.contains(removeButton)) return;

    removeButton.disabled = true;
    try {
      const response = await fetch(
        `${window.APP_CONFIG.API_BASE_URL}/orders/items/${encodeURIComponent(removeButton.dataset.productId)}`,
        { method: "DELETE", credentials: "include" },
      );
      await readResponse(response);
      await loadCart();
    } catch (error) {
      console.error("Could not remove cart item:", error);
      removeButton.disabled = false;
      setCartMessage(error.message || "Could not remove this item. Please try again.");
    }
  });

  fulfillmentOptions.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-fulfillment]");
    if (!button || !fulfillmentOptions.contains(button)) return;
    setFulfillment(button.dataset.fulfillment);
  });

  addressPicker.addEventListener("change", renderDeliveryAddress);

  const summaryToggle = document.getElementById("tg");
  summaryToggle.addEventListener("click", () => {
    const isOpen = summary.classList.toggle("open");
    summaryToggle.setAttribute("aria-expanded", String(isOpen));
    document.getElementById("tgl").textContent = isOpen ? "Hide" : "Show";
  });

  document.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-order]");
    if (!button || button.disabled) return;

    const payload = {
      payment_method: selectedFulfillment === "pickup" ? "pickup" : "cod",
    };
    if (selectedFulfillment === "delivery") {
      const addressId = Number(addressContainer.dataset.addressId);
      if (!Number.isSafeInteger(addressId) || addressId <= 0) {
        showToast("Choose a saved delivery address before ordering.");
        return;
      }
      payload.address_id = addressId;
    }

    orderInProgress = true;
    updateOrderButtons();
    try {
      const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const result = await readResponse(response);
      showToast(`Order placed${result.order_id ? ` (#${result.order_id})` : ""}.`);
      await loadCart();
    } catch (error) {
      console.error("Could not place order:", error);
      showToast(error.message || "Could not place your order. Please try again.");
    } finally {
      orderInProgress = false;
      updateOrderButtons();
    }
  });

  fulfillmentOptions.querySelectorAll("[data-fulfillment]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.fulfillment === selectedFulfillment));
  });
  loadAddresses().catch((error) => {
    console.error("Could not load delivery addresses:", error);
    addressText.textContent = error.message || "Could not load delivery addresses.";
    updateOrderButtons();
  });
  loadCart();
})();
