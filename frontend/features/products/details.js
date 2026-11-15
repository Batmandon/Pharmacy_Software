/**
 * Product Details Page (PDP) Component & Controller
 * Manages fetching, rendering, tabs, quantity controls, and cart actions for a single product.
 */
import {
  fetchProductDetails,
  addProductToCart,
  DETAIL_TABS,
} from "./api.js";
import {
  formatPrice,
  getAmount,
  getSafeImageUrl,
} from "../../shared/utils.js";

let activeProductDetails = null;

// ==================== DOM SELECTORS ====================
export function getMainProductImage() {
  return typeof document !== "undefined" ? document.getElementById("mainProductImg") : null;
}

export function getProductLoading() {
  return typeof document !== "undefined" ? document.getElementById("product-loading") : null;
}

export function getDetailLoading() {
  return typeof document !== "undefined" ? document.getElementById("detail-loading") : null;
}

export function getAddToCartButton() {
  return typeof document !== "undefined" ? document.getElementById("add-to-cart") : null;
}

export function getProductDetailTabs() {
  return typeof document !== "undefined" ? document.getElementById("product-detail-tabs") : null;
}

export function getProductDetailContent() {
  return typeof document !== "undefined" ? document.getElementById("product-detail-content") : null;
}

export function getProductActionMessage() {
  return typeof document !== "undefined" ? document.getElementById("product-action-message") : null;
}

export function getPdpWrapper() {
  return typeof document !== "undefined" ? document.querySelector(".pdp-wrapper") : null;
}

export function getProductQuantityInput() {
  return typeof document !== "undefined" ? document.getElementById("product-quantity") : null;
}

function setElementText(selector, value, fallback = "") {
  if (typeof document === "undefined") return;
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value || fallback;
  }
}

// ==================== RENDERING ====================
export function renderDetailTab(
  tabKey,
  product = activeProductDetails,
  tabsContainer = getProductDetailTabs(),
  contentContainer = getProductDetailContent()
) {
  if (typeof document === "undefined" || !tabsContainer || !contentContainer || !product) {
    return;
  }

  const tab = DETAIL_TABS.find(([key]) => key === tabKey);
  if (!tab) {
    return;
  }

  tabsContainer.querySelectorAll("[data-detail-tab]").forEach((button) => {
    const isSelected = button.dataset.detailTab === tabKey;
    button.classList.toggle("active-hover-tab", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
  });

  const content = product[tabKey];
  const heading = document.createElement("h3");
  heading.className = "pane-heading";
  heading.textContent = tab[1];

  const fragment = document.createDocumentFragment();
  fragment.append(heading);

  if (typeof content === "string" && content.trim()) {
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        fragment.append(paragraph);
      });
  } else {
    const empty = document.createElement("p");
    empty.textContent = "Information is not available yet.";
    fragment.append(empty);
  }

  if (product.information_source) {
    const source = document.createElement("small");
    source.className = "detail-source";
    source.textContent = `Source: ${product.information_source}`;
    if (product.last_reviewed_at) {
      source.textContent += ` · Reviewed: ${product.last_reviewed_at}`;
    }
    fragment.append(source);
  }

  contentContainer.replaceChildren(fragment);
}

export function showLoginPrompt(actionMessage = getProductActionMessage()) {
  if (typeof document === "undefined" || !actionMessage) return;

  actionMessage.replaceChildren(
    document.createTextNode("Please log in or create an account to add items to your cart. ")
  );
  const loginLink = document.createElement("a");
  loginLink.href = "login.html";
  loginLink.textContent = "Log in";

  const registerLink = document.createElement("a");
  registerLink.href = "register.html";
  registerLink.textContent = "Register";

  actionMessage.append(
    loginLink,
    document.createTextNode(" or "),
    registerLink,
    document.createTextNode(".")
  );
  actionMessage.classList.add("is-error");
}

export function renderProductDetails(product) {
  if (typeof document === "undefined" || !product) {
    return;
  }
  document.title = `${product.name} | Shama Medical`;

  setElementText("#product-name", product.name);
  setElementText("#breadcrumb-product-name", product.name);
  setElementText("#breadcrumb-category", product.category, "Shop");

  const meta = [
    product.brand ? `Brand: ${product.brand}` : "",
    product.strength,
    product.form,
    product.pack_size,
  ].filter(Boolean);
  setElementText("#product-meta", meta.join(" · "));

  const amount = getAmount(product.price);
  setElementText("#product-price", amount === null ? "" : formatPrice(amount), "Price unavailable");
  setElementText("#product-description", product.description, "");

  const stockBadge = document.getElementById("product-stock");
  if (stockBadge) {
    stockBadge.replaceChildren();
    const stockIcon = document.createElement("i");
    const inStock = product.stock_status === "In Stock";
    stockIcon.className = inStock ? "fa-solid fa-check" : "fa-solid fa-xmark";
    stockIcon.setAttribute("aria-hidden", "true");
    stockBadge.append(stockIcon, document.createTextNode(` ${product.stock_status}`));
    stockBadge.classList.toggle("out-of-stock", !inStock);
  }

  const image = getMainProductImage();
  const loading = getProductLoading();
  const imageUrl = getSafeImageUrl(product.image_url);

  if (image) {
    image.hidden = !imageUrl;
    image.alt = imageUrl ? `${product.name} product image` : "";
    if (imageUrl) {
      image.addEventListener("error", () => {
        image.hidden = true;
      }, { once: true });
      image.src = imageUrl;
    }
  }
  if (loading) {
    loading.hidden = true;
  }

  const badges = document.getElementById("product-badges");
  if (badges) {
    badges.replaceChildren();
    if (product.schedule === "OTC") {
      const badge = document.createElement("span");
      badge.className = "eligibility-badge";
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-prescription-bottle-medical";
      icon.setAttribute("aria-hidden", "true");
      badge.append(icon, document.createTextNode(" OTC (Over-The-Counter)"));
      badges.append(badge);
    } else if (product.schedule) {
      const badge = document.createElement("span");
      badge.className = "eligibility-badge";
      badge.textContent = "Prescription required";
      badges.append(badge);
    }
  }

  const inStock = product.stock_status === "In Stock";
  const canOrderOnline = inStock && product.schedule === "OTC";
  const addToCartButton = getAddToCartButton();
  if (addToCartButton) {
    addToCartButton.disabled = !canOrderOnline;
    addToCartButton.dataset.productId = String(product.id);
  }

  const wrapper = getPdpWrapper();
  if (wrapper) {
    wrapper.querySelectorAll("[data-quantity-change]").forEach((button) => {
      button.disabled = !canOrderOnline;
    });
  }

  renderDetailTab("description_uses", product);
}

export function renderProductDetailError(message = "We couldn't load this product. Please return to the shop and choose a product.") {
  const loading = getProductLoading();
  const detailLoading = getDetailLoading();
  const addToCartButton = getAddToCartButton();

  if (loading) {
    loading.textContent = message;
    loading.hidden = false;
  }
  if (detailLoading) {
    detailLoading.textContent = message;
    detailLoading.hidden = false;
  }
  if (addToCartButton) {
    addToCartButton.disabled = true;
  }
  setElementText("#product-name", "Product unavailable");
  setElementText("#product-stock", "");
}

// ==================== EVENT HANDLERS ====================
export function getProductIdFromUrl() {
  if (typeof window === "undefined" || !window.location) return null;
  const query = new URLSearchParams(window.location.search);
  const id = Number(query.get("id"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function handleQuantityButtonClick(delta) {
  const quantityInput = getProductQuantityInput();
  if (!quantityInput) return;
  const currentQuantity = Number(quantityInput.value) || 1;
  const nextQuantity = currentQuantity + delta;
  const maximum = 20;
  quantityInput.value = String(Math.max(1, Math.min(nextQuantity, maximum)));
}

export async function handleAddToCartClick(event, product = activeProductDetails) {
  const addButton = getAddToCartButton();
  const actionMessage = getProductActionMessage();
  const quantityInput = getProductQuantityInput();

  if (!addButton || !actionMessage || !product) {
    return;
  }

  const quantity = Number(quantityInput?.value || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    actionMessage.textContent = "Choose a valid quantity (1–20).";
    actionMessage.classList.add("is-error");
    return;
  }

  addButton.disabled = true;
  actionMessage.classList.remove("is-error");
  actionMessage.textContent = "Adding item to cart...";

  try {
    const result = await addProductToCart(product.id, quantity);
    if (result.unauthorized) {
      showLoginPrompt(actionMessage);
      return;
    }
    actionMessage.textContent = result.message || "Added to cart.";
  } catch (error) {
    console.error("Could not add product to cart:", error);
    actionMessage.textContent = error.message || "Could not add item to cart.";
    actionMessage.classList.add("is-error");
  } finally {
    const inStock = product.stock_status === "In Stock";
    const canOrderOnline = inStock && product.schedule === "OTC";
    addButton.disabled = !canOrderOnline;
  }
}

export async function loadProductDetailsFlow(productId = getProductIdFromUrl()) {
  if (!productId) {
    renderProductDetailError("Product ID is missing or invalid.");
    return;
  }

  try {
    const product = await fetchProductDetails(productId);
    activeProductDetails = product;
    renderProductDetails(product);
  } catch (error) {
    console.error("Could not load product details:", error);
    renderProductDetailError();
  }
}

export function initProductDetailsEvents() {
  const tabs = getProductDetailTabs();
  if (tabs) {
    tabs.addEventListener("click", function onTabClick(event) {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("[data-detail-tab]");
      if (!button || !tabs.contains(button) || !activeProductDetails) return;
      renderDetailTab(button.dataset.detailTab, activeProductDetails);
    });
  }

  const wrapper = getPdpWrapper();
  if (wrapper) {
    wrapper.addEventListener("click", async function onWrapperClick(event) {
      if (!(event.target instanceof Element)) return;

      const quantityButton = event.target.closest("[data-quantity-change]");
      if (quantityButton && wrapper.contains(quantityButton)) {
        const delta = Number(quantityButton.dataset.quantityChange) || 0;
        handleQuantityButtonClick(delta);
        return;
      }

      const addButton = event.target.closest("#add-to-cart");
      if (addButton && wrapper.contains(addButton)) {
        await handleAddToCartClick(event, activeProductDetails);
      }
    });
  }
}

export function initProductDetailPage() {
  const wrapper = getPdpWrapper();
  const tabs = getProductDetailTabs();
  if (wrapper || tabs) {
    initProductDetailsEvents();
    loadProductDetailsFlow();
  }
}

// Auto-initialize when loaded on PDP page
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProductDetailPage);
  } else {
    initProductDetailPage();
  }
}
