import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Test api.js
import {
  getAmount,
  isValidProduct,
  validateProductsResponse,
  fetchFeaturedProducts,
} from "../frontend/features/products/api.js";

// Test ui.js
import {
  escapeHtml,
  getSafeImageUrl,
  formatPrice,
  renderFeaturedProduct,
  renderFeaturedProducts,
  renderFeaturedError,
  setFeaturedLoading,
} from "../frontend/features/products/ui.js";

// Test event.js
import {
  handleCategoryClick,
  loadFeaturedProductsFlow,
  FEATURED_PRODUCT_LIMIT,
} from "../frontend/features/products/event.js";

console.log("=== RUNNING PRODUCTS MODULE TESTS ===");

// 1. API: getAmount
assert.equal(getAmount(100), 100);
assert.equal(getAmount("250.50"), 250.5);
assert.equal(getAmount("0"), 0);
assert.equal(getAmount(null), null);
assert.equal(getAmount(undefined), null);
assert.equal(getAmount(""), null);
assert.equal(getAmount("-5"), null);
assert.equal(getAmount("invalid"), null);
console.log("✔ api.js: getAmount passed");

// 2. API: isValidProduct
const validProd = {
  name: "Paracetamol 500mg",
  category: "OTC Medicines",
  image_url: "https://example.com/pills.jpg",
  selling_price: 50,
  mrp: 60,
};
assert.equal(isValidProduct(validProd), true);
assert.equal(isValidProduct({ ...validProd, name: "" }), false);
assert.equal(isValidProduct({ ...validProd, selling_price: "invalid" }), false);
assert.equal(isValidProduct(null), false);
assert.equal(isValidProduct([]), false);
console.log("✔ api.js: isValidProduct passed");

// 3. API: validateProductsResponse
const validResp = {
  total: 1,
  items: [validProd],
};
assert.equal(validateProductsResponse(validResp, 4), true);
assert.equal(validateProductsResponse({ total: 0, items: [] }, 4), true);
assert.equal(validateProductsResponse({ total: 5, items: [validProd, validProd, validProd, validProd, validProd] }, 4), false);
assert.equal(validateProductsResponse({ total: -1, items: [] }, 4), false);
assert.equal(validateProductsResponse(null, 4), false);
console.log("✔ api.js: validateProductsResponse passed");

// 4. API: fetchFeaturedProducts with mocked fetch
globalThis.APP_CONFIG = { API_BASE_URL: "http://mock-api.local" };
globalThis.fetch = async (url) => {
  const urlObj = new URL(url);
  assert.equal(urlObj.pathname, "/products");
  assert.equal(urlObj.searchParams.get("page"), "1");
  assert.equal(urlObj.searchParams.get("page_size"), "4");
  return {
    ok: true,
    status: 200,
    json: async () => ({
      total: 1,
      items: [validProd],
    }),
  };
};

const items = await fetchFeaturedProducts(4);
assert.equal(items.length, 1);
assert.equal(items[0].name, "Paracetamol 500mg");
console.log("✔ api.js: fetchFeaturedProducts passed");

// 5. UI: escapeHtml
assert.equal(escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
assert.equal(escapeHtml("A & B 'C'"), "A &amp; B &#39;C&#39;");
console.log("✔ ui.js: escapeHtml passed");

// 6. UI: getSafeImageUrl
assert.equal(getSafeImageUrl("https://example.com/img.png"), "https://example.com/img.png");
assert.equal(getSafeImageUrl("javascript:alert(1)"), "");
assert.equal(getSafeImageUrl(""), "");
console.log("✔ ui.js: getSafeImageUrl passed");

// 7. UI: formatPrice
const priceStr = formatPrice(199.5);
assert.ok(priceStr.includes("199.50") || priceStr.includes("200"));
console.log("✔ ui.js: formatPrice passed");

// 8. UI: renderFeaturedProduct
const html = renderFeaturedProduct(validProd);
assert.ok(html.includes("Paracetamol 500mg"));
assert.ok(html.includes("OTC Medicines"));
assert.ok(html.includes("product-card"));
console.log("✔ ui.js: renderFeaturedProduct passed");

// 9. UI: renderFeaturedProducts with mock DOM
const mockGrid = {
  innerHTML: "",
  replaceChildren() { this.innerHTML = ""; },
};
const mockStatus = {
  textContent: "",
  hidden: false,
};

renderFeaturedProducts([validProd], mockGrid, mockStatus);
assert.ok(mockGrid.innerHTML.includes("Paracetamol 500mg"));
assert.equal(mockStatus.hidden, true);

renderFeaturedProducts([], mockGrid, mockStatus);
assert.equal(mockStatus.textContent, "No products are available right now.");
assert.equal(mockStatus.hidden, false);
console.log("✔ ui.js: renderFeaturedProducts passed");

// 10. UI: renderFeaturedError & setFeaturedLoading
renderFeaturedError("Failed to load", mockStatus);
assert.equal(mockStatus.textContent, "Failed to load");
assert.equal(mockStatus.hidden, false);

setFeaturedLoading(mockStatus);
assert.equal(mockStatus.textContent, "Loading featured products...");
assert.equal(mockStatus.hidden, false);
console.log("✔ ui.js: renderFeaturedError and setFeaturedLoading passed");

// 11. Event: handleCategoryClick
const mockCard = {
  closest(selector) { return selector === ".category-card" ? this : null; },
  querySelector(selector) {
    if (selector === ".category-name") return { textContent: "Baby Care" };
    return null;
  },
};
const mockCategorySection = {
  contains(el) { return el === mockCard; },
};
const mockEvent = {
  target: mockCard,
  preventDefaultCalled: false,
  preventDefault() { this.preventDefaultCalled = true; },
};

const resultUrl = handleCategoryClick(mockEvent, mockCategorySection);
assert.equal(resultUrl, "searchproduct.html?name=Baby+Care");
assert.equal(mockEvent.preventDefaultCalled, true);
console.log("✔ event.js: handleCategoryClick passed");

console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎉");
