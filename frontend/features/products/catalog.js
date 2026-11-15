/**
 * Product Catalog & Search Controller
 * Manages product listing, search queries, pagination, and direct add-to-cart actions
 * for product.html (all medicines) and searchproduct.html (search results).
 */
import { fetchCatalogProducts, addProductToCart } from "./api.js";
import { renderCatalogCard } from "./card.js";
import { escapeHtml } from "../../shared/utils.js";

export const DEFAULT_PAGE_SIZE = 20;

// ==================== DOM SELECTORS ====================
export function getProductGrid() {
  return typeof document !== "undefined" ? document.getElementById("product-grid") : null;
}

export function getEmptyState() {
  return typeof document !== "undefined" ? document.getElementById("empty-state") : null;
}

export function getPaginationElement() {
  return typeof document !== "undefined" ? document.getElementById("pagination") : null;
}

export function getResultTextElement() {
  return typeof document !== "undefined" ? document.getElementById("result-text") : null;
}

export function getPageTitleElement() {
  return typeof document !== "undefined" ? document.getElementById("page-title") : null;
}

// ==================== UI RENDERING ====================
export function renderPagination(
  total,
  currentPage,
  pageSize = DEFAULT_PAGE_SIZE,
  pagination = getPaginationElement()
) {
  if (!pagination) return;

  const totalPages = Math.ceil(total / pageSize);
  pagination.replaceChildren();
  pagination.hidden = totalPages <= 1;
  if (pagination.hidden) {
    return;
  }

  function addPageLink(page, label, className = "") {
    const link = document.createElement("a");
    const pageParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    pageParams.set("page", String(page));
    link.href = `?${pageParams.toString()}`;
    link.textContent = label;
    if (className) {
      link.className = className;
    }
    if (page === currentPage) {
      link.setAttribute("aria-current", "page");
    }
    pagination.append(link);
  }

  if (currentPage > 1) {
    addPageLink(currentPage - 1, "Previous");
  }

  const firstPage = Math.max(1, currentPage - 2);
  const lastPage = Math.min(totalPages, currentPage + 2);
  for (let page = firstPage; page <= lastPage; page += 1) {
    if (page === currentPage) {
      const current = document.createElement("span");
      current.className = "current";
      current.setAttribute("aria-current", "page");
      current.textContent = String(page);
      pagination.append(current);
    } else {
      addPageLink(page, String(page));
    }
  }

  if (currentPage < totalPages) {
    addPageLink(currentPage + 1, "Next");
  }
}

export function showCatalogEmptyState(message, isError = false) {
  const grid = getProductGrid();
  const emptyState = getEmptyState();
  const pagination = getPaginationElement();
  const resultText = getResultTextElement();

  if (grid) grid.hidden = true;
  if (pagination) pagination.hidden = true;

  if (emptyState) {
    emptyState.hidden = false;
    emptyState.classList.toggle("error-state", isError);
    emptyState.classList.toggle("catalog-error-state", isError);
    const h2 = emptyState.querySelector("h2");
    const p = emptyState.querySelector("p");
    if (h2) h2.textContent = isError ? "Products could not be loaded" : "No products found";
    if (p) p.textContent = message;
  }

  if (resultText) {
    resultText.textContent = isError ? "There was a problem loading products." : "No products available.";
  }
}

export function showCartMessage(element, message, isError = false) {
  if (!element || typeof document === "undefined") return;
  element.replaceChildren(document.createTextNode(message));
  element.classList.toggle("is-error", isError);
  element.hidden = false;
}

export function showLoginPromptForCart(element) {
  if (!element || typeof document === "undefined") return;
  element.replaceChildren(
    document.createTextNode("Please log in or create an account to add items to your cart. ")
  );
  const loginLink = document.createElement("a");
  loginLink.href = "login.html";
  loginLink.textContent = "Log in";

  const registerLink = document.createElement("a");
  registerLink.href = "register.html";
  registerLink.textContent = "Register";

  element.append(loginLink, document.createTextNode(" or "), registerLink, document.createTextNode("."));
  element.classList.add("is-error");
  element.hidden = false;
}

// ==================== EVENT CONTROLLER ====================
export async function handleCatalogGridClick(event) {
  if (!(event.target instanceof (typeof Element !== "undefined" ? Element : Object))) {
    return;
  }

  const button = typeof event.target.closest === "function" ? event.target.closest(".btn-cart") : null;
  const grid = getProductGrid();
  if (!button || (grid && !grid.contains(button))) {
    return;
  }

  const card = button.closest("[data-product-id]");
  const message = card?.querySelector(".cart-message");
  const productId = Number(card?.dataset.productId);

  if (!message || !Number.isSafeInteger(productId) || productId <= 0) {
    return;
  }

  button.disabled = true;
  showCartMessage(message, "Adding item to your cart...");

  try {
    const result = await addProductToCart(productId, 1);
    if (result.unauthorized) {
      showLoginPromptForCart(message);
      return;
    }
    showCartMessage(message, result.message || "Item added to your cart.");
  } catch (error) {
    console.error("Could not add product to cart:", error);
    showCartMessage(message, error.message || "Could not reach the server. Please try again.", true);
  } finally {
    button.disabled = false;
  }
}

export async function loadCatalogProducts() {
  const grid = getProductGrid();
  const emptyState = getEmptyState();
  const pageTitle = getPageTitleElement();
  const resultText = getResultTextElement();

  if (!grid) return;

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const searchName = (searchParams.get("name") || "").trim();
  const requestedPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  try {
    const result = await fetchCatalogProducts({
      name: searchName,
      page: currentPage,
      pageSize: DEFAULT_PAGE_SIZE,
    });

    if (result.notFound || result.items.length === 0) {
      const notFoundMessage = searchName
        ? `We couldn't find anything matching "${searchName}". Check the spelling or try a different keyword.`
        : "There are no products available right now.";
      showCatalogEmptyState(notFoundMessage, false);
      if (pageTitle) pageTitle.textContent = searchName ? "Search Results" : "Products";
      return;
    }

    grid.innerHTML = result.items.map(renderCatalogCard).join("");
    grid.hidden = false;
    if (emptyState) emptyState.hidden = true;

    if (pageTitle) {
      pageTitle.textContent = searchName ? "Search Results" : "Products";
    }
    if (resultText) {
      resultText.textContent = searchName
        ? `Showing ${result.total} products for "${searchName}"`
        : `Showing ${result.total} products`;
    }

    renderPagination(result.total, currentPage, DEFAULT_PAGE_SIZE);
  } catch (error) {
    console.error("Could not load catalog products:", error);
    showCatalogEmptyState("Please check your connection and try again later.", true);
  }
}

export function initCatalogPage() {
  const grid = getProductGrid();
  if (!grid) return;

  grid.addEventListener("click", handleCatalogGridClick);
  loadCatalogProducts();
}

// Auto-initialize when loaded on Catalog or Search page
if (typeof document !== "undefined") {
  // Only auto-run if this page has #product-grid and is not the home page
  const hasCatalogGrid = document.getElementById("product-grid");
  const isHomePage = document.getElementById("featured-products-grid");

  if (hasCatalogGrid && !isHomePage) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initCatalogPage);
    } else {
      initCatalogPage();
    }
  }
}
