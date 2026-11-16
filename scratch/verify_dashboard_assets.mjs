/**
 * DOM and Asset Verification for dashboard.html
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dashboardHtmlPath = path.resolve("frontend/pages/dashboard.html");
const html = fs.readFileSync(dashboardHtmlPath, "utf-8");

console.log("Verifying frontend/pages/dashboard.html scripts and elements...");

// 1. Verify scripts
assert.ok(
  html.includes('<script src="../shared/config.js"></script>'),
  "config.js script tag missing"
);
assert.ok(
  html.includes('<script type="module" src="../shared/utils.js"></script>'),
  "utils.js module script tag missing"
);
assert.ok(
  html.includes('<script type="module" src="../features/dashboard/dashboard.js"></script>'),
  "dashboard.js module script tag missing"
);
assert.ok(
  !html.includes('assets/js/dashboard.js'),
  "Legacy dashboard.js should not be referenced"
);
console.log("✓ Script tags verified correctly!");

// 2. Verify templates
const requiredTemplates = [
  "recent-order-row",
  "order-row",
  "lowstock-row",
  "expiry-row",
  "product-row",
  "batch-panel",
  "batch-row",
  "salt-row",
];

for (const tmpl of requiredTemplates) {
  assert.ok(
    html.includes(`id="${tmpl}"`),
    `Template #${tmpl} is missing from dashboard.html`
  );
}
console.log("✓ All 8 templates verified!");

// 3. Verify key IDs
const requiredIds = [
  // Header / Profile / Navigation
  "admin-name",
  "logout-btn",
  "nav",
  "view-title",
  "page-message",
  "view-overview",
  "view-products",
  "view-orders",
  "toast",

  // Overview Tiles
  "stat-today",
  "stat-pending",
  "stat-revenue",
  "stat-active-products",

  // Overview Tables & Alerts
  "recent-orders-body",
  "recent-orders-empty",
  "lowstock-body",
  "lowstock-count",
  "lowstock-empty",
  "expiring-body",
  "expiring-count",
  "expiring-empty",
  "expired-body",
  "expired-count",
  "expired-empty",

  // Products
  "product-body",
  "product-empty",
  "product-search",
  "add-product-btn",
  "page-prev",
  "page-next",
  "page-info",

  // Orders
  "order-body",
  "order-empty",
  "order-status-filter",
  "order-prev",
  "order-next",
  "order-page-info",

  // Modals
  "confirm-dialog",
  "product-dialog",
  "batch-dialog",
  "catalog-dialog",
  "order-dialog",
];

for (const id of requiredIds) {
  assert.ok(
    html.includes(`id="${id}"`),
    `Element #${id} is missing from dashboard.html`
  );
}
console.log(`✓ All ${requiredIds.length} key DOM element IDs verified!`);

// 4. Verify feature files exist
const featureFiles = [
  "frontend/features/dashboard/api.js",
  "frontend/features/dashboard/profile.js",
  "frontend/features/dashboard/products.js",
  "frontend/features/dashboard/orders.js",
  "frontend/features/dashboard/dashboard.js",
  "frontend/shared/utils.js",
];

for (const file of featureFiles) {
  assert.ok(fs.existsSync(path.resolve(file)), `Feature file ${file} does not exist`);
}
console.log("✓ All feature and shared files verified on disk!");

// 5. Verify legacy file was deleted
assert.ok(
  !fs.existsSync(path.resolve("frontend/assets/js/dashboard.js")),
  "Legacy frontend/assets/js/dashboard.js should be deleted"
);
console.log("✓ Legacy monolithic dashboard.js confirmed deleted!");

console.log("\n✨ DASHBOARD ASSETS AND INTEGRITY VERIFIED 100%! ✨\n");
