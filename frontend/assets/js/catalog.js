const productGrid = document.getElementById("product-grid");
const emptyState = document.getElementById("empty-state");
const pagination = document.getElementById("pagination");
const resultText = document.getElementById("result-text");
const catalogContainer = document.querySelector(".shop-container");
const pageSize = 20;
const requestedPage = Number.parseInt(new URLSearchParams(window.location.search).get("page") || "1", 10);
const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

function stretchCatalogForEmptyState() {
  if (!catalogContainer.classList.contains("has-empty-state")) {
    return;
  }

  const emptyStateTop = emptyState.getBoundingClientRect().top + window.scrollY;
  emptyState.style.minHeight =
    `${Math.max(0, window.innerHeight + window.scrollY - emptyStateTop)}px`;
}

window.addEventListener("resize", stretchCatalogForEmptyState);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function getAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function isValidAmount(value) {
  return value === null || value === undefined || getAmount(value) !== null;
}

function getImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function formatPrice(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function isOptionalString(value) {
  return value === null || value === undefined || typeof value === "string";
}

function isValidProduct(product) {
  const discount = product?.discount_percentage ?? product?.discount_percent ?? 0;
  const id = Number(product?.id);
  return product !== null
    && typeof product === "object"
    && !Array.isArray(product)
    && Number.isInteger(id)
    && id > 0
    && typeof product.name === "string"
    && product.name.trim().length > 0
    && isOptionalString(product.brand)
    && isOptionalString(product.strength)
    && isOptionalString(product.pack_size)
    && isOptionalString(product.image_url)
    && isOptionalString(product.form)
    && isValidAmount(product.mrp)
    && Number.isFinite(Number(discount))
    && Number(discount) >= 0
    && Number(discount) <= 100;
}

function renderProduct(product) {
  const productId = Number(product.id);
  const name = escapeHtml(product.name.trim());
  const brand = escapeHtml(product.brand || "Brand not listed");
  const strength = escapeHtml(product.strength || "");
  const packSize = escapeHtml(product.pack_size || "");
  const imageUrl = getImageUrl(product.image_url);
  const mrp = getAmount(product.mrp);
  const discount = Number(product.discount_percentage ?? product.discount_percent ?? 0);
  const sellingPrice = mrp === null
    ? null
    : Math.round((mrp * (100 - discount) / 100 + Number.EPSILON) * 100) / 100;

  return `<article class="product-card" data-product-id="${productId}">
    <div class="product-img-box">
      ${imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${name}" loading="lazy">`
        : '<i class="fa-solid fa-pills catalog-product-image-placeholder" aria-hidden="true"></i>'}
    </div>
    <div class="product-info">
      <h2 class="product-name"><a class="product-detail-link" href="product_detail..html?id=${productId}">${name}</a></h2>
      <span class="product-brand">${brand}</span>
      ${strength ? `<span class="product-pack">${strength}</span>` : ""}
      <div class="product-meta-row">
        ${sellingPrice === null
          ? '<span class="product-pack">Price unavailable</span>'
          : `<span class="product-price">${formatPrice(sellingPrice)}</span>
             ${discount > 0 ? `<span class="product-mrp">${formatPrice(mrp)}</span>` : ""}`}
      </div>
      ${packSize ? `<span class="product-pack">${packSize}</span>` : ""}
    </div>
  </article>`;
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / pageSize);
  pagination.replaceChildren();
  pagination.hidden = totalPages <= 1;
  if (pagination.hidden) {
    return;
  }

  function addPage(page, label, current = false) {
    if (current) {
      const currentPageElement = document.createElement("span");
      currentPageElement.className = "current";
      currentPageElement.setAttribute("aria-current", "page");
      currentPageElement.textContent = label;
      pagination.append(currentPageElement);
      return;
    }

    const link = document.createElement("a");
    link.href = `?page=${page}`;
    link.textContent = label;
    pagination.append(link);
  }

  if (currentPage > 1) {
    addPage(currentPage - 1, "Previous");
  }

  const firstPage = Math.max(1, currentPage - 2);
  const lastPage = Math.min(totalPages, currentPage + 2);
  for (let page = firstPage; page <= lastPage; page += 1) {
    addPage(page, String(page), page === currentPage);
  }

  if (currentPage < totalPages) {
    addPage(currentPage + 1, "Next");
  }
}

function showEmptyState(message, error = false) {
  catalogContainer.classList.add("has-empty-state");
  productGrid.hidden = true;
  pagination.hidden = true;
  emptyState.hidden = false;
  emptyState.classList.toggle("catalog-error-state", error);
  emptyState.querySelector("h2").textContent = error
    ? "Products could not be loaded"
    : "No products found";
  emptyState.querySelector("p").textContent = message;
  stretchCatalogForEmptyState();
}

async function loadProducts() {
  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error("The API URL is not configured.");
  }

  const endpoint = new URL("/products", apiBaseUrl);
  endpoint.searchParams.set("page", String(currentPage));
  endpoint.searchParams.set("page_size", String(pageSize));

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Product request failed (HTTP ${response.status}).`);
  }

  const result = await response.json();
  const validResponse = result !== null
    && typeof result === "object"
    && !Array.isArray(result)
    && Array.isArray(result.items)
    && Number.isInteger(result.total)
    && result.total >= 0
    && result.page === currentPage
    && result.page_size === pageSize
    && result.items.length <= pageSize
    && result.items.every(isValidProduct);
  if (!validResponse) {
    throw new Error("The server returned an invalid product response.");
  }

  if (result.items.length === 0) {
    showEmptyState("There are no products available right now.");
    resultText.textContent = "No products available.";
    return;
  }

  productGrid.innerHTML = result.items.map(renderProduct).join("");
  productGrid.hidden = false;
  catalogContainer.classList.remove("has-empty-state");
  emptyState.style.minHeight = "";
  emptyState.hidden = true;
  resultText.textContent = `Showing ${result.total} products`;
  renderPagination(result.total);
}

loadProducts().catch((error) => {
  console.error("Could not load catalog products:", error);
  showEmptyState("Please check your connection and try again later.", true);
  resultText.textContent = "There was a problem loading products.";
});
