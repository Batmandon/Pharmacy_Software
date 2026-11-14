(() => {
  const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL;
  const query = new URLSearchParams(window.location.search);
  const productId = Number(query.get("id"));
  const image = document.getElementById("mainProductImg");
  const loading = document.getElementById("product-loading");
  const detailLoading = document.getElementById("detail-loading");
  const addToCartButton = document.getElementById("add-to-cart");
  const tabs = document.getElementById("product-detail-tabs");
  const detailContent = document.getElementById("product-detail-content");
  const actionMessage = document.getElementById("product-action-message");
  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  });
  const detailTabs = [
    ["description_uses", "Description & Uses"],
    ["side_effects_warnings", "Side Effects & Warnings"],
    ["dosage_information", "Dosage Information"],
    ["storage_care", "Storage & Care"],
  ];
  let productDetails = null;

  function isOptionalText(value) {
    return value === null || value === undefined || typeof value === "string";
  }

  function getAmount(value) {
    if (value === null || value === undefined) return null;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  function isValidProduct(product) {
    return product !== null
      && typeof product === "object"
      && !Array.isArray(product)
      && Number(product.id) === productId
      && typeof product.name === "string"
      && product.name.trim().length > 0
      && ["In Stock", "Out of Stock"].includes(product.stock_status)
      && (product.price === null || getAmount(product.price) !== null)
      && isOptionalText(product.brand)
      && isOptionalText(product.category)
      && isOptionalText(product.strength)
      && isOptionalText(product.form)
      && isOptionalText(product.pack_size)
      && isOptionalText(product.schedule)
      && isOptionalText(product.description)
      && isOptionalText(product.image_url)
      && isOptionalText(product.storage_condition)
      && detailTabs.every(([key]) => isOptionalText(product[key]))
      && isOptionalText(product.information_source)
      && isOptionalText(product.last_reviewed_at);
  }

  async function readResponse(response) {
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { detail: text };
      }
    }
    if (!response.ok) {
      const message = typeof body.detail === "string"
        ? body.detail
        : `Could not load product (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return body;
  }

  function getSafeImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function setText(selector, value, fallback = "") {
    const element = document.querySelector(selector);
    element.textContent = value || fallback;
  }

  function showLoginOptions() {
    actionMessage.replaceChildren(
      document.createTextNode("Please log in or create an account to add items to your cart. "),
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
      document.createTextNode("."),
    );
    actionMessage.classList.add("is-error");
  }

  function renderProduct(product) {
    productDetails = product;
    document.title = `${product.name} | Shama Medical`;
    setText("#product-name", product.name);
    setText("#breadcrumb-product-name", product.name);
    setText("#breadcrumb-category", product.category, "Shop");

    const meta = [
      product.brand ? `Brand: ${product.brand}` : "",
      product.strength,
      product.form,
      product.pack_size,
    ].filter(Boolean);
    setText("#product-meta", meta.join(" · "));

    const amount = getAmount(product.price);
    setText("#product-price", amount === null ? "" : currency.format(amount), "Price unavailable");
    setText("#product-description", product.description, "");

    const stockBadge = document.getElementById("product-stock");
    stockBadge.replaceChildren();
    const stockIcon = document.createElement("i");
    const inStock = product.stock_status === "In Stock";
    stockIcon.className = inStock ? "fa-solid fa-check" : "fa-solid fa-xmark";
    stockIcon.setAttribute("aria-hidden", "true");
    stockBadge.append(stockIcon, document.createTextNode(` ${product.stock_status}`));
    stockBadge.classList.toggle("out-of-stock", !inStock);

    const imageUrl = getSafeImageUrl(product.image_url);
    image.hidden = !imageUrl;
    image.alt = imageUrl ? `${product.name} product image` : "";
    if (imageUrl) {
      image.addEventListener("error", () => {
        image.hidden = true;
      }, { once: true });
      image.src = imageUrl;
    }
    loading.hidden = true;

    const badges = document.getElementById("product-badges");
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

    const canOrderOnline = inStock && product.schedule === "OTC";
    addToCartButton.disabled = !canOrderOnline;
    addToCartButton.dataset.productId = String(product.id);
    wrapper.querySelectorAll("[data-quantity-change]").forEach((button) => {
      button.disabled = !canOrderOnline;
    });
    renderDetailTab("description_uses");
  }

  function renderDetailTab(key) {
    const tab = detailTabs.find(([tabKey]) => tabKey === key);
    if (!tab || !productDetails) return;

    tabs.querySelectorAll("[data-detail-tab]").forEach((button) => {
      const isSelected = button.dataset.detailTab === key;
      button.classList.toggle("active-hover-tab", isSelected);
      button.setAttribute("aria-selected", String(isSelected));
    });

    const content = productDetails[key];
    const heading = document.createElement("h3");
    heading.className = "pane-heading";
    heading.textContent = tab[1];
    const fragment = document.createDocumentFragment();
    fragment.append(heading);

    if (typeof content === "string" && content.trim()) {
      content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        fragment.append(paragraph);
      });
    } else {
      const empty = document.createElement("p");
      empty.textContent = "Information is not available yet.";
      fragment.append(empty);
    }

    if (productDetails.information_source) {
      const source = document.createElement("small");
      source.className = "detail-source";
      source.textContent = `Source: ${productDetails.information_source}`;
      if (productDetails.last_reviewed_at) {
        source.textContent += ` · Reviewed: ${productDetails.last_reviewed_at}`;
      }
      fragment.append(source);
    }

    detailContent.replaceChildren(fragment);
  }

  function showError() {
    const message = "We couldn't load this product. Please return to the shop and choose a product.";
    loading.textContent = message;
    loading.hidden = false;
    detailLoading.textContent = message;
    detailLoading.hidden = false;
    addToCartButton.disabled = true;
    document.getElementById("product-name").textContent = "Product unavailable";
    document.getElementById("product-stock").textContent = "";
  }

  tabs.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-detail-tab]");
    if (!button || !tabs.contains(button)) return;
    renderDetailTab(button.dataset.detailTab);
  });

  const wrapper = document.querySelector(".pdp-wrapper");
  wrapper.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;
    const quantityButton = event.target.closest("[data-quantity-change]");
    if (quantityButton && wrapper.contains(quantityButton) && productDetails) {
      const quantityInput = document.getElementById("product-quantity");
      const currentQuantity = Number(quantityInput.value);
      const nextQuantity = currentQuantity + Number(quantityButton.dataset.quantityChange);
      const maximum = 20;
      quantityInput.value = String(Math.max(1, Math.min(nextQuantity, maximum)));
      return;
    }

    const addButton = event.target.closest("#add-to-cart");
    if (!addButton || !wrapper.contains(addButton) || !productDetails) return;

    const quantity = Number(document.getElementById("product-quantity").value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      actionMessage.textContent = "Choose a valid quantity (1–20).";
      actionMessage.classList.add("is-error");
      return;
    }

    addButton.disabled = true;
    actionMessage.classList.remove("is-error");
    actionMessage.textContent = "Adding item to cart...";
    try {
      const response = await fetch(`${apiBaseUrl}/orders/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        allowUnauthorizedResponse: true,
        body: JSON.stringify({
          product_id: productDetails.id,
          quantity,
        }),
      });
      if (response.status === 401) {
        showLoginOptions();
        return;
      }
      const result = await readResponse(response);
      actionMessage.textContent = result.message || "Added to cart.";
    } catch (error) {
      console.error("Could not add product to cart:", error);
      actionMessage.textContent = error.message || "Could not add item to cart.";
      actionMessage.classList.add("is-error");
    } finally {
      addButton.disabled = !(
        productDetails.stock_status === "In Stock" && productDetails.schedule === "OTC"
      );
    }
  });

  async function loadProduct() {
    if (!apiBaseUrl) {
      throw new Error("Product service is not configured.");
    }
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new Error("Product ID is missing or invalid.");
    }

    const response = await fetch(
      `${apiBaseUrl}/products/${encodeURIComponent(productId)}/details`,
    );
    const product = await readResponse(response);
    if (!isValidProduct(product)) {
      throw new Error("The server returned invalid product details.");
    }
    renderProduct(product);
  }

  loadProduct().catch((error) => {
    console.error("Could not load product details:", error);
    showError();
  });
})();
