import assert from "node:assert/strict";

// Setup mock document for testing DOM functions in Node
globalThis.document = {
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(),
      textContent: "",
      className: "",
      children: [],
      classList: {
        add(cls) { this.className += ` ${cls}`; },
        remove() {},
        toggle() {},
      },
      setAttribute() {},
      append(...nodes) {
        this.children.push(...nodes);
      },
    };
  },
  createTextNode(text) {
    return { text };
  },
  createDocumentFragment() {
    return {
      children: [],
      append(...nodes) {
        this.children.push(...nodes);
      },
    };
  },
  getElementById() {
    return null;
  },
  querySelector() {
    return null;
  },
};

// Import from products feature
import {
  fetchCatalogProducts,
  isValidCatalogProduct,
  validateCatalogResponse,
} from "../frontend/features/products/api.js";

import {
  renderCatalogCard,
} from "../frontend/features/products/card.js";

import {
  renderPagination,
  showCatalogEmptyState,
} from "../frontend/features/products/catalog.js";

console.log("=== RUNNING CATALOG MODULE TESTS ===");

// 1. isValidCatalogProduct
const sampleProd = {
  id: 42,
  name: "Paracetamol 650",
  brand: "Dolo",
  strength: "650mg",
  pack_size: "15 tablets",
  category: "OTC Medicines",
  image_url: "https://example.com/dolo.jpg",
  mrp: 30,
  discount_percentage: 10,
};

assert.equal(isValidCatalogProduct(sampleProd), true);
assert.equal(isValidCatalogProduct({ ...sampleProd, name: "" }), false);
assert.equal(isValidCatalogProduct({ ...sampleProd, mrp: "invalid" }), false);
assert.equal(isValidCatalogProduct({ ...sampleProd, discount_percentage: 150 }), false); // > 100
assert.equal(isValidCatalogProduct(null), false);
console.log("✔ api.js: isValidCatalogProduct passed");

// 2. validateCatalogResponse
const sampleResp = {
  items: [sampleProd],
  total: 1,
  page: 1,
  page_size: 20,
};
assert.equal(validateCatalogResponse(sampleResp, 20, 1), true);
assert.equal(validateCatalogResponse({ ...sampleResp, items: [] }, 20, 1), true);
assert.equal(validateCatalogResponse(null, 20, 1), false);
console.log("✔ api.js: validateCatalogResponse passed");

// 3. fetchCatalogProducts (All products)
globalThis.APP_CONFIG = { API_BASE_URL: "http://mock-api.local" };
let requestedUrl = "";
globalThis.fetch = async (url) => {
  requestedUrl = url.toString();
  const urlObj = new URL(url);
  const p = Number(urlObj.searchParams.get("page")) || 1;
  return {
    ok: true,
    status: 200,
    json: async () => ({ ...sampleResp, page: p }),
  };
};

const catalogData = await fetchCatalogProducts({ page: 2, pageSize: 20 });
assert.equal(catalogData.items.length, 1);
assert.ok(requestedUrl.includes("/products?page=2&page_size=20"));
console.log("✔ api.js: fetchCatalogProducts (all) passed");

// 4. fetchCatalogProducts (Search query)
await fetchCatalogProducts({ name: "dolo", page: 1, pageSize: 20 });
assert.ok(requestedUrl.includes("/products/search?name=dolo&page=1&page_size=20"));
console.log("✔ api.js: fetchCatalogProducts (search) passed");

// 5. fetchCatalogProducts (404 Search Not Found)
globalThis.fetch = async () => ({
  ok: false,
  status: 404,
});

const notFoundData = await fetchCatalogProducts({ name: "nonexistent" });
assert.equal(notFoundData.notFound, true);
assert.equal(notFoundData.items.length, 0);
console.log("✔ api.js: fetchCatalogProducts 404 handling passed");

// 6. renderCatalogCard HTML generation
const cardHtml = renderCatalogCard(sampleProd);
assert.ok(cardHtml.includes("Paracetamol 650"));
assert.ok(cardHtml.includes("Dolo"));
assert.ok(cardHtml.includes("650mg"));
assert.ok(cardHtml.includes("product_detail..html?id=42"));
assert.ok(cardHtml.includes("btn-cart"));
assert.ok(cardHtml.includes("badge-off"));
console.log("✔ card.js: renderCatalogCard passed");

// 7. renderPagination with mock DOM
const mockPagination = {
  children: [],
  hidden: false,
  replaceChildren() { this.children = []; },
  append(node) { this.children.push(node); },
};

renderPagination(50, 1, 20, mockPagination); // 3 pages
assert.equal(mockPagination.hidden, false);
assert.ok(mockPagination.children.length > 0);

renderPagination(10, 1, 20, mockPagination); // 1 page -> should hide
assert.equal(mockPagination.hidden, true);
console.log("✔ catalog.js: renderPagination passed");

console.log("\nALL CATALOG TESTS PASSED SUCCESSFULLY! 🎉");
