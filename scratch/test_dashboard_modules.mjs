/**
 * Unit Test Suite for Dashboard Feature Modules and Deduplicated Utilities
 */
import assert from "node:assert/strict";

// Global browser mocks for Node environment
globalThis.window = {
  location: {
    origin: "http://localhost:5500",
    href: "http://localhost:5500/pages/dashboard.html",
    hash: "#overview",
    assign() {},
    replace() {},
  },
  APP_CONFIG: {
    API_BASE_URL: "http://localhost:8000",
  },
};

globalThis.document = {
  getElementById(id) {
    return {
      id,
      textContent: "",
      className: "",
      hidden: false,
      disabled: false,
      value: "",
      dataset: {},
      elements: {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      replaceChildren() {},
      append() {},
      remove() {},
      addEventListener() {},
      closest() { return null; },
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false; },
      },
    };
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {},
};

// 1. Test Shared Utilities
import {
  formatDateOnly,
  formatNumber,
  formatPrice,
  addressText,
  renderTableMessage,
} from "../frontend/shared/utils.js";

console.log("Testing shared utilities...");
assert.equal(formatDateOnly("2026-11-25"), "25 Nov 2026");
assert.equal(formatDateOnly(null), "");
assert.equal(formatNumber(1500), "1,500");
assert.equal(formatNumber("0"), "0");
assert.ok(formatPrice(120.5).includes("120.50"));
assert.equal(addressText({ line: "123 Main St", city: "Mumbai", pincode: "400001" }), "123 Main St, Mumbai - 400001");
console.log("âœ“ Shared utilities passed!");

// 2. Test Dashboard API Module
import {
  DASHBOARD_CONFIG,
  DASHBOARD_PATHS,
  isAlertsStale,
  setAlertsStale,
} from "../frontend/features/dashboard/api.js";

console.log("Testing dashboard API module...");
assert.equal(DASHBOARD_CONFIG.PAGE_SIZE, 20);
assert.equal(DASHBOARD_PATHS.dashboard, "/admin/dashboard");
assert.equal(DASHBOARD_PATHS.orders, "/admin/orders");
assert.equal(isAlertsStale(), false);
setAlertsStale(true);
assert.equal(isAlertsStale(), true);
setAlertsStale(false);
console.log("âœ“ Dashboard API module passed!");

// 3. Test Dashboard Orders Module (nextStatuses & logic)
import {
  STATUS_STEPS,
  nextStatuses,
} from "../frontend/features/dashboard/orders.js";

console.log("Testing orders module...");
assert.deepEqual(STATUS_STEPS, ["pending", "confirmed", "processing", "shipped", "delivered"]);
assert.deepEqual(nextStatuses("pending"), ["confirmed", "processing", "shipped", "delivered", "cancelled"]);
assert.deepEqual(nextStatuses("shipped"), ["delivered", "cancelled"]);
assert.deepEqual(nextStatuses("delivered"), []);
assert.deepEqual(nextStatuses("unknown"), []);
console.log("âœ“ Orders module status flow passed!");

// 4. Test Dashboard Products Module (Validation logic)
import {
  validateProductForm,
  validateBatchForm,
} from "../frontend/features/dashboard/products.js";

console.log("Testing products module form validations...");

// Valid product
const validProduct = {
  name: "Paracetamol 500mg",
  category_id: "1",
  manufacturer_id: "2",
  brand_id: "",
  hsn_code: "300490",
  pack_size: "10 tablets",
  storage_condition: "room_temperature",
  schedule: "none",
  gst_rate: "12",
  image_url: "https://example.com/item.png",
};
const validProductErrors = validateProductForm(validProduct);
assert.deepEqual(validProductErrors, {});

// Invalid product missing required fields
const invalidProduct = {
  name: "",
  category_id: "",
  manufacturer_id: "",
  pack_size: "",
  storage_condition: "invalid_condition",
  schedule: "invalid_schedule",
  gst_rate: "99",
  image_url: "not-a-url",
};
const invalidProductErrors = validateProductForm(invalidProduct);
assert.ok(invalidProductErrors.name);
assert.ok(invalidProductErrors.category_id);
assert.ok(invalidProductErrors.manufacturer_id);
assert.ok(invalidProductErrors.pack_size);
assert.ok(invalidProductErrors.storage_condition);
assert.ok(invalidProductErrors.schedule);
assert.ok(invalidProductErrors.gst_rate);
assert.ok(invalidProductErrors.image_url);

// Valid batch
const validBatch = {
  batch_no: "BATCH-2026-A",
  quantity: "100",
  mfg_date: "2026-01-01",
  expiry_date: "2027-12-31",
  mrp: "50.00",
  purchase_price: "35.00",
  discount_percent: "10",
  supplier_id: "5",
  rack_location: "RACK-A1",
};
const validBatchErrors = validateBatchForm(validBatch);
assert.deepEqual(validBatchErrors, {});

// Invalid batch
const invalidBatch = {
  batch_no: "",
  quantity: "0",
  mfg_date: "2028-01-01", // future
  expiry_date: "2025-01-01", // past
  mrp: "50.00",
  purchase_price: "60.00", // purchase price > mrp
  discount_percent: "150",
};
const invalidBatchErrors = validateBatchForm(invalidBatch);
assert.ok(invalidBatchErrors.batch_no);
assert.ok(invalidBatchErrors.quantity);
assert.ok(invalidBatchErrors.mfg_date);
assert.ok(invalidBatchErrors.expiry_date);
assert.ok(invalidBatchErrors.purchase_price);
assert.ok(invalidBatchErrors.discount_percent);
console.log("âœ“ Products and batches validation passed!");

// 5. Test Dashboard Coordinator Module
import {
  showView,
} from "../frontend/features/dashboard/dashboard.js";

console.log("Testing dashboard main coordinator...");
assert.equal(typeof showView, "function");
console.log("âœ“ Dashboard main coordinator passed!");

console.log("\nâœ¨ ALL 5 TEST SUITES PASSED SUCCESSFULLY! âœ¨\n");
