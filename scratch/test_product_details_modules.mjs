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
  getElementById(id) {
    if (id === "product-quantity") {
      return mockQuantityInput;
    }
    return null;
  },
  querySelector() {
    return null;
  },
};

// Import from products feature
import {
  isValidProductDetails,
  fetchProductDetails,
  addProductToCart,
  DETAIL_TABS,
} from "../frontend/features/products/api.js";

import {
  renderDetailTab,
  renderProductDetails,
  showLoginPrompt,
  renderProductDetailError,
} from "../frontend/features/products/ui.js";

import {
  handleQuantityButtonClick,
  getProductIdFromUrl,
} from "../frontend/features/products/event.js";

console.log("=== RUNNING PRODUCT DETAILS MODULE TESTS ===");

// 1. DETAIL_TABS
assert.equal(DETAIL_TABS.length, 4);
assert.equal(DETAIL_TABS[0][0], "description_uses");
console.log("✔ api.js: DETAIL_TABS verified");

// 2. isValidProductDetails
const validDetails = {
  id: 101,
  name: "Amoxicillin 500mg",
  stock_status: "In Stock",
  price: 150.0,
  schedule: "OTC",
  brand: "Cipla",
  category: "Antibiotics",
  strength: "500mg",
  form: "Capsule",
  pack_size: "10 capsules",
  description: "Broad spectrum antibiotic",
  image_url: "https://example.com/amox.jpg",
  storage_condition: "Store in cool dry place",
  description_uses: "Used to treat bacterial infections.",
  side_effects_warnings: "Nausea, rash.",
  dosage_information: "Take one capsule twice a day.",
  storage_care: "Keep away from children.",
  information_source: "Pharmacy Compendium",
  last_reviewed_at: "2026-10-15",
};

assert.equal(isValidProductDetails(validDetails, 101), true);
assert.equal(isValidProductDetails(validDetails, 999), false); // Mismatched ID
assert.equal(isValidProductDetails({ ...validDetails, stock_status: "Unknown" }), false);
assert.equal(isValidProductDetails({ ...validDetails, name: "" }), false);
assert.equal(isValidProductDetails(null), false);
console.log("✔ api.js: isValidProductDetails passed");

// 3. fetchProductDetails with mock fetch
globalThis.APP_CONFIG = { API_BASE_URL: "http://mock-api.local" };
globalThis.fetch = async (url) => {
  const urlObj = new URL(url);
  assert.equal(urlObj.pathname, "/products/101/details");
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(validDetails),
  };
};

const fetched = await fetchProductDetails(101);
assert.equal(fetched.name, "Amoxicillin 500mg");
assert.equal(fetched.stock_status, "In Stock");
console.log("✔ api.js: fetchProductDetails passed");

// 4. addProductToCart with mock fetch
let sentBody = null;
globalThis.fetch = async (url, options) => {
  sentBody = JSON.parse(options.body);
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ message: "Item added successfully." }),
  };
};

const cartResult = await addProductToCart(101, 3);
assert.equal(cartResult.success, true);
assert.equal(cartResult.message, "Item added successfully.");
assert.equal(sentBody.product_id, 101);
assert.equal(sentBody.quantity, 3);
console.log("✔ api.js: addProductToCart success passed");

// 5. addProductToCart 401 Unauthorized
globalThis.fetch = async () => ({
  ok: false,
  status: 401,
  text: async () => JSON.stringify({ detail: "Not authenticated" }),
});

const unauthResult = await addProductToCart(101, 1);
assert.equal(unauthResult.unauthorized, true);
console.log("✔ api.js: addProductToCart 401 handling passed");

// 6. UI: renderDetailTab with mock DOM
const mockTabsContainer = {
  querySelectorAll() {
    return [
      {
        dataset: { detailTab: "description_uses" },
        classList: { toggle(cls, active) { this.active = active; } },
        setAttribute(k, v) { this[k] = v; },
      },
      {
        dataset: { detailTab: "side_effects_warnings" },
        classList: { toggle(cls, active) { this.active = active; } },
        setAttribute(k, v) { this[k] = v; },
      },
    ];
  },
};

let tabContentChildren = null;
const mockContentContainer = {
  replaceChildren(fragment) {
    tabContentChildren = fragment;
  },
};

renderDetailTab("description_uses", validDetails, mockTabsContainer, mockContentContainer);
assert.ok(tabContentChildren !== null);
console.log("✔ ui.js: renderDetailTab passed");

// 7. UI: showLoginPrompt with mock element
const mockActionMsg = {
  children: [],
  className: "",
  classList: {
    add(cls) { mockActionMsg.className += ` ${cls}`; },
    remove() {},
  },
  replaceChildren(...nodes) {
    this.children = [...nodes];
  },
  append(...nodes) {
    this.children.push(...nodes);
  },
};

showLoginPrompt(mockActionMsg);
assert.ok(mockActionMsg.children.length > 0);
assert.ok(mockActionMsg.className.includes("is-error"));
console.log("✔ ui.js: showLoginPrompt passed");

// 8. Event: handleQuantityButtonClick boundary tests
const mockQuantityInput = { value: "1" };
handleQuantityButtonClick(1);
assert.equal(mockQuantityInput.value, "2");

handleQuantityButtonClick(50); // Clamp to max 20
assert.equal(mockQuantityInput.value, "20");

handleQuantityButtonClick(-100); // Clamp to min 1
assert.equal(mockQuantityInput.value, "1");
console.log("✔ event.js: handleQuantityButtonClick boundary passed");

console.log("\nALL PRODUCT DETAILS TESTS PASSED SUCCESSFULLY! 🎉");
