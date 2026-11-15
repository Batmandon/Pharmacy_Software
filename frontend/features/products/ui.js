/**
 * Product UI Rendering & Formatting Helpers
 * Connects card and details components for featured products and catalog views.
 */
import {
  escapeHtml,
  getSafeImageUrl,
  formatPrice,
  getAmount,
} from "../../shared/utils.js";
import { renderProductCard, renderFeaturedProduct } from "./card.js";
import {
  getMainProductImage,
  getProductLoading,
  getDetailLoading,
  getAddToCartButton,
  getProductDetailTabs,
  getProductDetailContent,
  getProductActionMessage,
  getPdpWrapper,
  getProductQuantityInput,
  renderDetailTab,
  showLoginPrompt,
  renderProductDetails,
  renderProductDetailError,
} from "./details.js";

export {
  escapeHtml,
  getSafeImageUrl,
  formatPrice,
  getAmount,
  renderProductCard,
  renderFeaturedProduct,
  getMainProductImage,
  getProductLoading,
  getDetailLoading,
  getAddToCartButton,
  getProductDetailTabs,
  getProductDetailContent,
  getProductActionMessage,
  getPdpWrapper,
  getProductQuantityInput,
  renderDetailTab,
  showLoginPrompt,
  renderProductDetails,
  renderProductDetailError,
};

// ==================== FEATURED PRODUCTS DOM GETTERS ====================
export function getFeaturedGrid() {
  return typeof document !== "undefined" ? document.getElementById("featured-products-grid") : null;
}

export function getFeaturedStatus() {
  return typeof document !== "undefined" ? document.getElementById("featured-products-status") : null;
}

export function getCategorySection() {
  return typeof document !== "undefined" ? document.querySelector(".category-nav-section") : null;
}

// ==================== FEATURED PRODUCTS RENDERING ====================
export function renderFeaturedProducts(items, gridElement = getFeaturedGrid(), statusElement = getFeaturedStatus()) {
  if (!gridElement || !statusElement) {
    return;
  }

  if (items.length === 0) {
    if (typeof gridElement.replaceChildren === "function") {
      gridElement.replaceChildren();
    } else {
      gridElement.innerHTML = "";
    }
    statusElement.textContent = "No products are available right now.";
    statusElement.hidden = false;
    return;
  }

  gridElement.innerHTML = items.map(renderProductCard).join("");
  statusElement.hidden = true;
}

export function renderFeaturedError(errorMessage, statusElement = getFeaturedStatus()) {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = errorMessage || "Featured products could not be loaded. Please try again later.";
  statusElement.hidden = false;
}

export function setFeaturedLoading(statusElement = getFeaturedStatus()) {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = "Loading featured products...";
  statusElement.hidden = false;
}
