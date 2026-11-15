import assert from "assert";
import fs from "fs";
import path from "path";

// Mock localStorage for Node environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => (mockStorage.has(key) ? mockStorage.get(key) : null),
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
};

console.log("=== RUNNING ACCOUNT FEATURE API TESTS ===");

const {
  fetchProfile,
  updateProfile,
  logoutUser,
  fetchAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getSavedDefaultAddressId,
  setSavedDefaultAddressId,
  getDefaultAddress,
} = await import("../frontend/features/account/api.js");

// 1. Storage Helpers
setSavedDefaultAddressId(10);
assert.strictEqual(getSavedDefaultAddressId(), "10");

const sampleAddresses = [
  { id: 1, line: "Street 1", city: "Delhi", pincode: "110001" },
  { id: 10, line: "Street 10", city: "Lucknow", pincode: "226001" },
];
assert.strictEqual(getDefaultAddress(sampleAddresses).id, 10);
setSavedDefaultAddressId(null);
assert.strictEqual(getDefaultAddress(sampleAddresses).id, 1);
assert.strictEqual(getDefaultAddress([]), null);
console.log("✔ default address helpers passed");

// Mock global window and fetch
globalThis.window = {
  APP_CONFIG: { API_BASE_URL: "https://api.pharmacy.test" },
  location: { assign: () => {}, replace: () => {} },
};

globalThis.fetch = async (url, options = {}) => {
  if (url === "https://api.pharmacy.test/auth_routes/profile") {
    if (options.method === "PUT") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ message: "Profile updated" }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        first_name: "Taukeer",
        last_name: "Ahmad",
        email: "taukeer@example.com",
        phone: "9876543210",
        role: "customer"
      }),
    };
  }
  if (url === "https://api.pharmacy.test/auth_routes/logout") {
    assert.strictEqual(options.method, "POST");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ message: "Logged out" }),
    };
  }
  if (url === "https://api.pharmacy.test/addresses") {
    if (options.method === "POST") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          address: { id: 99, line: "New Lane", city: "Lakhimpur", pincode: "262701", phone: "9876543210" }
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        items: [
          { id: 1, line: "Main St", city: "Lakhimpur", pincode: "262701", phone: "9876543210" }
        ]
      }),
    };
  }
  if (url === "https://api.pharmacy.test/addresses/99") {
    if (options.method === "PUT") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          address: { id: 99, line: "Updated Lane", city: "Lakhimpur", pincode: "262701", phone: "9876543210" }
        }),
      };
    }
    if (options.method === "DELETE") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ message: "Address deleted" }),
      };
    }
  }
  throw new Error(`Unexpected url: ${url}`);
};

const profile = await fetchProfile();
assert.strictEqual(profile.first_name, "Taukeer");
console.log("✔ fetchProfile passed");

const updateProfRes = await updateProfile({ first_name: "Taukeer" });
assert.strictEqual(updateProfRes.message, "Profile updated");
console.log("✔ updateProfile passed");

const logoutRes = await logoutUser();
assert.strictEqual(logoutRes.message, "Logged out");
console.log("✔ logoutUser passed");

const addressList = await fetchAddresses();
assert.strictEqual(addressList.length, 1);
console.log("✔ fetchAddresses passed");

const createdAddr = await createAddress({ line: "New Lane", city: "Lakhimpur", pincode: "262701", phone: "9876543210" });
assert.strictEqual(createdAddr.id, 99);
console.log("✔ createAddress passed");

const updatedAddr = await updateAddress(99, { line: "Updated Lane" });
assert.strictEqual(updatedAddr.line, "Updated Lane");
console.log("✔ updateAddress passed");

const delAddrRes = await deleteAddress(99);
assert.strictEqual(delAddrRes.message, "Address deleted");
console.log("✔ deleteAddress passed");

console.log("\n=== RUNNING ACCOUNT FEATURE UI TESTS ===");

const {
  validateField,
  renderAddressCard,
  renderOverviewAddress,
  renderOverviewOrder,
  updateHeroBanner,
} = await import("../frontend/features/account/ui.js");

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

// 2. Field Validation
assert.strictEqual(validateField("first_name", "Taukeer"), "");
assert.strictEqual(validateField("first_name", ""), "First name is required.");
assert.strictEqual(validateField("first_name", "123!"), "Use letters only (max 20).");

assert.strictEqual(validateField("phone", "9876543210"), "");
assert.strictEqual(validateField("phone", "12345"), "Enter a valid 10-digit mobile number.");

assert.strictEqual(validateField("pincode", "262701"), "");
assert.strictEqual(validateField("pincode", "abc"), "Enter a valid 6-digit pincode.");

assert.strictEqual(validateField("email", "test@test.com"), "");
assert.strictEqual(validateField("email", "invalid"), "Enter a valid email address.");

console.log("✔ validateField passed");

// 3. Address Card Rendering
let editAddrClicked = null;
let defaultAddrClicked = null;
let deleteAddrClicked = null;

const renderedAddrCard = renderAddressCard(
  { id: 1, line: "Mohalla Avas", city: "Behjam", pincode: "262701", phone: "9876543210" },
  {
    isDefault: false,
    onEdit: (addr) => { editAddrClicked = addr; },
    onSetDefault: (addr) => { defaultAddrClicked = addr; },
    onDelete: (addr) => { deleteAddrClicked = addr; },
  }
);
assert.strictEqual(renderedAddrCard.className, "address-card");
const actionsDiv = renderedAddrCard.children.find((c) => c.className === "card-actions");
assert(actionsDiv, "Card actions should be present");

const defBtn = actionsDiv.children.find((c) => c.dataset.action === "default");
defBtn.eventListeners["click"][0]();
assert.strictEqual(defaultAddrClicked.id, 1);

const editBtn = actionsDiv.children.find((c) => c.dataset.action === "edit");
editBtn.eventListeners["click"][0]();
assert.strictEqual(editAddrClicked.id, 1);

const delBtn = actionsDiv.children.find((c) => c.dataset.action === "delete");
delBtn.eventListeners["click"][0]();
assert.strictEqual(deleteAddrClicked.id, 1);
console.log("✔ renderAddressCard passed");

// 4. Overview Cards
const overviewAddrContainer = new MockNode("div");
renderOverviewAddress(overviewAddrContainer, { line: "Behjam", city: "Lakhimpur", pincode: "262701", phone: "9876543210" });
assert.strictEqual(overviewAddrContainer.children[0].textContent, "Behjam");

const overviewOrderContainer = new MockNode("div");
renderOverviewOrder(overviewOrderContainer, { id: 55, order_number: "ORD-55", created_at: "2026-11-10", total: 300, status: "delivered" });
assert(overviewOrderContainer.children[0].textContent.includes("ORD-55"));
console.log("✔ renderOverviewAddress and renderOverviewOrder passed");

// 5. Hero Banner
updateHeroBanner({ first_name: "Taukeer", last_name: "Ahmad" }, { orderCount: 5, activeOrderCount: 1, addressCount: 2 });
console.log("✔ updateHeroBanner passed");

// 6. Sub-controllers: profile.js and address.js
const { renderProfileForm, initProfileController } = await import("../frontend/features/account/profile.js");
assert(typeof renderProfileForm === "function", "renderProfileForm must be exported");
assert(typeof initProfileController === "function", "initProfileController must be exported");
console.log("✔ profile.js exports verified");

const { renderAddressesList, initAddressController } = await import("../frontend/features/account/address.js");
assert(typeof renderAddressesList === "function", "renderAddressesList must be exported");
assert(typeof initAddressController === "function", "initAddressController must be exported");
console.log("✔ address.js exports verified");

console.log("\n=== VERIFYING ACCOUNT.HTML ASSETS ===");
const accountPagePath = path.resolve("frontend/pages/account.html");
assert(fs.existsSync(accountPagePath), "account.html must exist");
const accountHtml = fs.readFileSync(accountPagePath, "utf-8");

// Verify CSS links
const cssHrefs = [...accountHtml.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((href) => !href.startsWith("http"));

for (const href of cssHrefs) {
  const resolved = path.resolve(path.dirname(accountPagePath), href);
  assert(fs.existsSync(resolved), `CSS missing: ${href} -> ${resolved}`);
  const stat = fs.statSync(resolved);
  assert(stat.size > 0, `CSS empty: ${href}`);
  console.log(`✔ Verified CSS: ${href} (${stat.size} bytes)`);
}

// Verify Scripts
const scriptSrcs = [...accountHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((src) => !src.startsWith("http"));

assert(scriptSrcs.includes("../features/account/account.js"), "Must load features/account/account.js");
assert(scriptSrcs.includes("../shared/utils.js"), "Must load shared/utils.js");
assert(scriptSrcs.includes("../shared/config.js"), "Must load shared/config.js");
assert(scriptSrcs.includes("../shared/components.js"), "Must load shared/components.js");

for (const src of scriptSrcs) {
  const resolved = path.resolve(path.dirname(accountPagePath), src);
  assert(fs.existsSync(resolved), `Script missing: ${src} -> ${resolved}`);
  const stat = fs.statSync(resolved);
  assert(stat.size > 0, `Script empty: ${src}`);
  console.log(`✔ Verified Script: ${src} (${stat.size} bytes)`);
}

console.log("\nALL ACCOUNT FEATURE TESTS PASSED SUCCESSFULLY! 🎉");
