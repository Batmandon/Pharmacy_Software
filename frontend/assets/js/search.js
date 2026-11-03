const grid = document.getElementById("product-grid");
const emptyState = document.getElementById("empty-state");
const pagination = document.getElementById("pagination");
const resultText = document.getElementById("result-text");
const pageTitle = document.getElementById("page-title");

const params = new URLSearchParams(window.location.search);
const searchName = (params.get("name") || "").trim();
const currentPage = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
const pageSize = 20;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function getImageUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function isOptionalString(value) {
  return value === null || value === undefined || typeof value === "string";
}

function isValidAmount(value) {
  return value === null
    || value === undefined
    || (value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0);
}

function isValidProduct(product) {
  const discount = product?.discount_percentage ?? product?.discount_percent ?? 0;
  const productId = Number(product?.id);
  return product !== null
    && typeof product === "object"
    && !Array.isArray(product)
    && Number.isInteger(productId)
    && productId > 0
    && typeof product.name === "string"
    && product.name.trim().length > 0
    && isOptionalString(product.brand)
    && isOptionalString(product.strength)
    && isOptionalString(product.pack_size)
    && isOptionalString(product.category)
    && isOptionalString(product.image_url)
    && isOptionalString(product.form)
    && isOptionalString(product.manufacturer)
    && isOptionalString(product.salt)
    && isOptionalString(product.description)
    && (product.requires_prescription === undefined
      || product.requires_prescription === null
      || typeof product.requires_prescription === "boolean")
    && isValidAmount(product.mrp)
    && Number.isFinite(Number(discount))
    && Number(discount) >= 0
    && Number(discount) <= 100;
}

function renderProduct(product) {
  const productId = Number(product.id);
  const mrp = Number(product.mrp);
  const discount = Number(product.discount_percentage ?? product.discount_percent ?? 0);
  const hasPrice = product.mrp !== null
    && product.mrp !== undefined
    && Number.isFinite(mrp);
  const sellingPrice = hasPrice
    ? Math.floor((mrp * (100 - discount) / 100) * 100 + 0.5 + Number.EPSILON) / 100
    : null;
  const savings = hasPrice ? mrp - sellingPrice : null;
  const name = escapeHtml(product.name || "Unnamed product");
  const strength = escapeHtml(product.strength || "");
  const category = escapeHtml(product.category || "Uncategorized");
  const brand = escapeHtml(product.brand || "Brand not listed");
  const manufacturer = escapeHtml(product.manufacturer || "");
  const salt = escapeHtml(product.salt || "");
  const description = escapeHtml(product.description || "");
  const packDetails = [product.form, product.pack_size]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  const imageUrl = getImageUrl(product.image_url);
  const discountBadge = discount > 0
    ? `<span class="badge-off">${escapeHtml(discount)}% OFF</span>`
    : "";
  const prescriptionBadge = product.requires_prescription
    ? '<span class="badge-rx">Not for online sale</span>'
    : "";
  const priceDetails = hasPrice
    ? `<div class="price-row">
          <span class="price">${formatPrice(sellingPrice)}</span>
          <span class="mrp">${formatPrice(mrp)}</span>
          ${discount > 0 ? `<span class="save">Save ${formatPrice(savings)}</span>` : ""}
        </div>`
    : '<p class="price-unavailable">Price unavailable</p>';

  return `<article class="card" data-product-id="${productId}">
    <div class="card-img">
      ${imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${name}" loading="lazy">`
        : '<div class="product-image-placeholder" aria-hidden="true"><i class="fa-solid fa-pills"></i></div>'}
      ${discountBadge}
      ${prescriptionBadge}
    </div>
    <div class="card-body">
      <span class="cat">${category}</span>
      <h2 class="name"><a class="product-detail-link" href="product_detail..html?id=${productId}">${name}</a></h2>
      ${strength ? `<span class="strength">${strength}</span>` : ""}
      <span class="product-detail"><strong>Brand:</strong> ${brand}</span>
      ${manufacturer ? `<span class="product-detail"><strong>Manufacturer:</strong> ${manufacturer}</span>` : ""}
      ${salt ? `<span class="product-detail"><strong>Salt:</strong> ${salt}</span>` : ""}
      ${packDetails ? `<span class="pack"><i class="fa-solid fa-box"></i> ${packDetails}</span>` : ""}
      ${description ? `<p class="product-description">${description}</p>` : ""}
      ${product.requires_prescription
        ? '<span class="rx-note">Not for online sale</span>'
        : ""}
      <span class="stock in">In stock</span>
      ${priceDetails}
      ${product.requires_prescription
        ? ""
        : '<button class="btn-cart" type="button"><i class="fa-solid fa-cart-plus"></i> Add to Cart</button>'}
      ${product.requires_prescription ? "" : '<p class="cart-message" role="status" aria-live="polite" hidden></p>'}
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

  function addPageLink(page, label, className = "") {
    const link = document.createElement("a");
    const pageParams = new URLSearchParams(window.location.search);
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

function showError(error) {
  console.error("Could not load products:", error);
  grid.hidden = true;
  pagination.hidden = true;
  emptyState.hidden = false;
  emptyState.classList.add("error-state");
  emptyState.querySelector("h2").textContent = "Products could not be loaded";
  emptyState.querySelector("p").textContent =
    "Please check your connection and try again later.";
  resultText.textContent = "There was a problem loading products.";
}

function showCartMessage(element, message, isError = false) {
  element.replaceChildren(document.createTextNode(message));
  element.classList.toggle("is-error", isError);
  element.hidden = false;
}

function showLoginOptions(element) {
  element.replaceChildren(
    document.createTextNode("Please log in or create an account to add items to your cart. "),
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

grid.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest(".btn-cart");
  if (!button || !grid.contains(button)) {
    return;
  }

  const card = button.closest("[data-product-id]");
  const message = card?.querySelector(".cart-message");
  const productId = Number(card?.dataset.productId);
  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  if (!message || !Number.isSafeInteger(productId) || productId <= 0 || !apiBaseUrl) {
    return;
  }

  button.disabled = true;
  showCartMessage(message, "Adding item to your cart...");
  try {
    const response = await fetch(`${apiBaseUrl}/orders/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      allowUnauthorizedResponse: true,
      body: JSON.stringify({ product_id: productId, quantity: 1 }),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 401) {
      showLoginOptions(message);
      return;
    }
    if (!response.ok) {
      const errorMessage = typeof body.detail === "string"
        ? body.detail
        : "Could not add this product to your cart. Please try again.";
      showCartMessage(message, errorMessage, true);
      return;
    }

    showCartMessage(message, body.message || "Item added to your cart.");
  } catch (error) {
    console.error("Could not add search product to cart:", error);
    showCartMessage(message, "Could not reach the server. Please try again.", true);
  } finally {
    button.disabled = false;
  }
});

async function loadProducts() {
  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error("The API URL is not configured.");
  }

  const endpoint = new URL(
    searchName ? "/products/search" : "/products",
    apiBaseUrl
  );
  if (searchName) {
    endpoint.searchParams.set("name", searchName);
  }
  endpoint.searchParams.set("page", String(currentPage));
  endpoint.searchParams.set("page_size", String(pageSize));

  const response = await fetch(endpoint);
  if (response.status === 404 && searchName) {
    grid.hidden = true;
    pagination.hidden = true;
    emptyState.hidden = false;
    emptyState.classList.remove("error-state");
    emptyState.querySelector("h2").textContent = "No products found";
    emptyState.querySelector("p").textContent =
      `We couldn't find anything matching "${searchName}". Check the spelling or try a different keyword.`;
    pageTitle.textContent = "Search Results";
    resultText.textContent = "No matching products.";
    return;
  }
  if (!response.ok) {
    throw new Error(`Product request failed (HTTP ${response.status}).`);
  }

  const result = await response.json();
  const isValidResponse = result !== null
    && typeof result === "object"
    && !Array.isArray(result)
    && Array.isArray(result.items)
    && Number.isInteger(result.total)
    && result.total >= 0
    && result.page === currentPage
    && result.page_size === pageSize
    && result.items.length <= pageSize
    && result.items.every(isValidProduct);
  if (!isValidResponse) {
    throw new Error("The server returned an invalid product response.");
  }

  grid.innerHTML = result.items.map(renderProduct).join("");
  grid.hidden = result.items.length === 0;
  emptyState.hidden = result.items.length > 0;
  emptyState.classList.remove("error-state");
  if (result.items.length === 0) {
    emptyState.querySelector("h2").textContent = "No products found";
    emptyState.querySelector("p").textContent = searchName
      ? `We couldn't find anything matching "${searchName}". Check the spelling or try a different keyword.`
      : "There are no products available right now.";
  }

  pageTitle.textContent = searchName ? "Search Results" : "Products";
  resultText.textContent = searchName
    ? `Showing ${result.total} products for "${searchName}"`
    : `Showing ${result.total} products`;
  renderPagination(result.total);
}

loadProducts().catch(showError);
