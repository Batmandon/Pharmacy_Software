const categorySection = document.querySelector(".category-nav-section");
const featuredGrid = document.getElementById("featured-products-grid");
const featuredStatus = document.getElementById("featured-products-status");
const featuredProductLimit = 4;

categorySection?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const categoryCard = event.target.closest(".category-card");
  if (!categoryCard || !categorySection.contains(categoryCard)) {
    return;
  }

  const categoryName = categoryCard.querySelector(".category-name")?.textContent.trim();
  if (!categoryName) {
    return;
  }

  event.preventDefault();
  const searchParams = new URLSearchParams({ name: categoryName });
  window.location.assign(`searchproduct.html?${searchParams.toString()}`);
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function getSafeImageUrl(value) {
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

function getAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function formatPrice(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function isValidProduct(product) {
  return product !== null
    && typeof product === "object"
    && !Array.isArray(product)
    && typeof product.name === "string"
    && product.name.trim().length > 0
    && (product.category === null || product.category === undefined || typeof product.category === "string")
    && (product.image_url === null || product.image_url === undefined || typeof product.image_url === "string")
    && (product.mrp === null || product.mrp === undefined || getAmount(product.mrp) !== null)
    && (product.selling_price === null
      || product.selling_price === undefined
      || getAmount(product.selling_price) !== null);
}

function renderFeaturedProduct(product) {
  const name = escapeHtml(product.name.trim());
  const category = escapeHtml(product.category || "Health Product");
  const imageUrl = getSafeImageUrl(product.image_url);
  const sellingPrice = getAmount(product.selling_price);
  const mrp = getAmount(product.mrp);
  const priceMarkup = sellingPrice === null
    ? '<span class="product-price">Price unavailable</span>'
    : `<span class="product-price">${formatPrice(sellingPrice)}</span>
       ${mrp !== null ? `<span class="product-mrp">${formatPrice(mrp)}</span>` : ""}`;

  return `<article class="product-card">
    <div class="product-img-box">
      ${imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${name}" loading="lazy">`
        : '<i class="fa-solid fa-pills" aria-hidden="true"></i>'}
    </div>
    <div class="product-details">
      <span class="product-category">${category}</span>
      <h3 class="product-name">${name}</h3>
      <div class="product-price-row">${priceMarkup}</div>
    </div>
  </article>`;
}

async function loadFeaturedProducts() {
  if (!featuredGrid || !featuredStatus) {
    return;
  }

  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error("The API URL is not configured.");
  }

  const endpoint = new URL("/products", apiBaseUrl);
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("page_size", String(featuredProductLimit));

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Featured products request failed (HTTP ${response.status}).`);
  }

  const result = await response.json();
  const isValidResponse = result !== null
    && typeof result === "object"
    && !Array.isArray(result)
    && Array.isArray(result.items)
    && Number.isInteger(result.total)
    && result.total >= 0
    && result.items.length <= featuredProductLimit
    && result.total >= result.items.length
    && (result.items.length > 0 || result.total === 0)
    && result.items.every(isValidProduct);
  if (!isValidResponse) {
    throw new Error("The server returned an invalid featured products response.");
  }

  if (result.items.length === 0) {
    featuredGrid.replaceChildren();
    featuredStatus.textContent = "No products are available right now.";
    return;
  }

  featuredGrid.innerHTML = result.items.map(renderFeaturedProduct).join("");
  featuredStatus.hidden = true;
}

loadFeaturedProducts().catch((error) => {
  console.error("Could not load featured products:", error);
  if (featuredStatus) {
    featuredStatus.textContent =
      "Featured products could not be loaded. Please try again later.";
  }
});
