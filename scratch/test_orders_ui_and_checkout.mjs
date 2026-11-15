import assert from "assert";
import fs from "fs";
import path from "path";

// Mock minimal DOM for Node.js
class MockNode {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.eventListeners = {};
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === "string") {
        const textNode = new MockNode("#text");
        textNode.textContent = n;
        this.children.push(textNode);
      } else if (n) {
        this.children.push(n);
      }
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(evt, fn) {
    this.eventListeners[evt] = this.eventListeners[evt] || [];
    this.eventListeners[evt].push(fn);
  }
  querySelector(sel) {
    // Basic selector matching for mock testing
    if (sel.startsWith("#")) {
      const id = sel.slice(1);
      return this._find((n) => n.id === id);
    }
    return null;
  }
  _find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      if (child instanceof MockNode) {
        const found = child._find(predicate);
        if (found) return found;
      }
    }
    return null;
  }
}

globalThis.document = {
  createElement: (tag) => new MockNode(tag),
  createTextNode: (text) => {
    const node = new MockNode("#text");
    node.textContent = text;
    return node;
  },
  getElementById: (id) => {
    const node = new MockNode("div");
    node.id = id;
    return node;
  },
};

globalThis.window = {
  location: { href: "http://localhost:5500/pages/Checkout.html" },
  APP_CONFIG: { API_BASE_URL: "http://localhost:8000" },
};

console.log("=== RUNNING ORDERS UI TESTS ===");

const { renderStatusBadge, renderCartItem, renderOrderCard, populateOrderDialog } = await import(
  "../frontend/features/orders/ui.js"
);

// 1. Status Badge
const badge = renderStatusBadge("Processing");
assert.strictEqual(badge.className, "status status-processing");
assert.strictEqual(badge.textContent, "processing");
console.log("✔ renderStatusBadge passed");

// 2. Cart Item
let removeCalledWith = null;
const cartItem = renderCartItem(
  {
    product_id: 10,
    name: "Dolo 650",
    price: 30,
    quantity: 2,
    line_total: 60,
    pack_size: "15 tablets",
  },
  {
    onRemove: (id) => { removeCalledWith = id; },
  }
);
assert.strictEqual(cartItem.className, "item");
assert.strictEqual(cartItem.dataset.cartItem, "");
const priceEl = cartItem.children.find((c) => c.className === "price");
assert(priceEl.textContent.includes("60"));

const removeBtn = cartItem.children.find((c) => c.className === "remove-item");
assert.strictEqual(removeBtn.dataset.productId, "10");
removeBtn.eventListeners["click"][0]({ preventDefault: () => {} });
assert.strictEqual(removeCalledWith, 10);
console.log("✔ renderCartItem passed");

// 3. Order Card
let viewDetailsCalledWith = null;
const sampleOrder = {
  id: 101,
  order_number: "ORD-101",
  created_at: "2026-11-10T10:00:00Z",
  status: "delivered",
  total: 550,
  items: [
    { name: "Amoxicillin", quantity: 1, price: 150 },
    { name: "Paracetamol", quantity: 2, price: 200 },
  ],
};

const card = renderOrderCard(sampleOrder, {
  onViewDetails: (order) => { viewDetailsCalledWith = order; },
});
assert.strictEqual(card.className, "order-card");
const foot = card.children.find((c) => c.className === "order-foot");
const viewBtn = foot.children.find((c) => c.dataset.orderId === "101");
viewBtn.eventListeners["click"][0]({ preventDefault: () => {} });
assert.strictEqual(viewDetailsCalledWith.id, 101);
console.log("✔ renderOrderCard passed");

// 4. Populate Order Dialog
const mockDialog = new MockNode("dialog");
const titleNode = new MockNode("h3");
titleNode.id = "order-dialog-title";
const metaNode = new MockNode("div");
metaNode.id = "order-meta";
const itemsNode = new MockNode("div");
itemsNode.id = "order-items";
const totalNode = new MockNode("strong");
totalNode.id = "order-total";
mockDialog.append(titleNode, metaNode, itemsNode, totalNode);

populateOrderDialog(mockDialog, sampleOrder);
assert.strictEqual(titleNode.textContent, "Order #ORD-101");
assert.strictEqual(itemsNode.children.length, 2);
assert(totalNode.textContent.includes("550"));
console.log("✔ populateOrderDialog passed");

console.log("\n=== VERIFYING CHECKOUT.HTML ASSETS ===");
const checkoutPath = path.resolve("frontend/pages/Checkout.html");
assert(fs.existsSync(checkoutPath), "Checkout.html must exist");
const checkoutHtml = fs.readFileSync(checkoutPath, "utf-8");

// Verify CSS links
const cssHrefs = [...checkoutHtml.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((href) => !href.startsWith("http"));

for (const href of cssHrefs) {
  const resolved = path.resolve(path.dirname(checkoutPath), href);
  assert(fs.existsSync(resolved), `CSS missing: ${href} -> ${resolved}`);
  const stat = fs.statSync(resolved);
  assert(stat.size > 0, `CSS empty: ${href}`);
  console.log(`✔ Verified CSS: ${href} (${stat.size} bytes)`);
}

// Verify Scripts
const scriptSrcs = [...checkoutHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((src) => !src.startsWith("http"));

assert(scriptSrcs.includes("../features/orders/checkout.js"), "Must load features/orders/checkout.js");
assert(scriptSrcs.includes("../shared/utils.js"), "Must load shared/utils.js");
assert(scriptSrcs.includes("../shared/config.js"), "Must load shared/config.js");

for (const src of scriptSrcs) {
  const resolved = path.resolve(path.dirname(checkoutPath), src);
  assert(fs.existsSync(resolved), `Script missing: ${src} -> ${resolved}`);
  const stat = fs.statSync(resolved);
  assert(stat.size > 0, `Script empty: ${src}`);
  console.log(`✔ Verified Script: ${src} (${stat.size} bytes)`);
}

console.log("\nALL ORDERS UI & CHECKOUT ASSET CHECKS PASSED SUCCESSFULLY! 🎉");
