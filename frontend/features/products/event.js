/**
 * Product Event Handlers & Controller Lifecycle
 * Manages category click events, featured products loading flow,
 * and product details page (PDP) tabs, quantity, and cart actions.
 */
import {
  fetchFeaturedProducts,
  fetchProductDetails,
  addProductToCart,
} from "./api.js";
import {
  getFeaturedGrid,
  getFeaturedStatus,
  getCategorySection,
  renderFeaturedProducts,
  renderFeaturedError,
  setFeaturedLoading,
  getPdpWrapper,
  getProductDetailTabs,
  getProductActionMessage,
  getProductQuantityInput,
  getAddToCartButton,
  renderProductDetails,
  renderDetailTab,
  renderProductDetailError,
  showLoginPrompt,
} from "./ui.js";

export const FEATURED_PRODUCT_LIMIT = 4;
let activeProductDetails = null;

// ==================== HOME / CATEGORY EVENTS ====================
export function handleCategoryClick(event, categorySection = getCategorySection()) {
  const isElement = typeof Element !== "undefined" ? event?.target instanceof Element : true;
  if (!event || !event.target || !isElement) {
    return;
  }

  const categoryCard = typeof event.target.closest === "function"
    ? event.target.closest(".category-card")
    : null;

  if (!categoryCard || (categorySection && typeof categorySection.contains === "function" && !categorySection.contains(categoryCard))) {
    return;
  }

  const categoryName = categoryCard.querySelector?.(".category-name")?.textContent?.trim();
  if (!categoryName) {
    return;
  }

  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  const searchParams = new URLSearchParams({ name: categoryName });
  const targetUrl = `searchproduct.html?${searchParams.toString()}`;

  if (typeof window !== "undefined" && window.location?.assign) {
    window.location.assign(targetUrl);
  }

  return targetUrl;
}

export function initCategoryEvents(categorySection = getCategorySection()) {
  if (!categorySection || typeof categorySection.addEventListener !== "function") {
    return;
  }
  categorySection.addEventListener("click", (event) => handleCategoryClick(event, categorySection));
}

export async function loadFeaturedProductsFlow(limit = FEATURED_PRODUCT_LIMIT) {
  const grid = getFeaturedGrid();
  const status = getFeaturedStatus();
  if (!grid || !status) {
    return;
  }

  try {
    setFeaturedLoading(status);
    const items = await fetchFeaturedProducts(limit);
    renderFeaturedProducts(items, grid, status);
  } catch (error) {
    console.error("Could not load featured products:", error);
    renderFeaturedError("Featured products could not be loaded. Please try again later.", status);
  }
}

// ==================== PRODUCT DETAILS (PDP) EVENTS ====================
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

// ==================== UNIFIED BOOTSTRAP ====================
export function initProductsFeature() {
  // If on Home page: initialize category nav & featured products
  if (getFeaturedGrid() || getCategorySection()) {
    initCategoryEvents();
    loadFeaturedProductsFlow();
  }

  // If on Product Details page: initialize PDP
  if (getPdpWrapper() || getProductDetailTabs()) {
    initProductDetailsEvents();
    loadProductDetailsFlow();
  }
}

// Auto-initialize when running in browser
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProductsFeature);
  } else {
    initProductsFeature();
  }
}
