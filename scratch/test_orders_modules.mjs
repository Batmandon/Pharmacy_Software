import assert from "assert";
import {
  getOrderNumber,
  getOrderTotal,
  isValidOrder,
  isValidCartItem,
  fetchCart,
  removeCartItem,
  placeOrder,
  fetchCustomerOrders,
  fetchDeliveryAddresses,
} from "../frontend/features/orders/api.js";

console.log("=== RUNNING ORDERS FEATURE API TESTS ===");

// 1. getOrderNumber
assert.strictEqual(getOrderNumber({ id: 42 }), 42);
assert.strictEqual(getOrderNumber({ order_number: "ORD-2026-001", id: 42 }), "ORD-2026-001");
assert.strictEqual(getOrderNumber(null), "");
console.log("✔ getOrderNumber passed");

// 2. getOrderTotal
assert.strictEqual(getOrderTotal({ total: 150 }), 150);
assert.strictEqual(getOrderTotal({ total: "249.99" }), 249.99);
const calculatedTotal = getOrderTotal({
  items: [
    { price: 20, quantity: 2 },
    { price: 15.5, quantity: 4 },
  ],
});
assert.strictEqual(calculatedTotal, 102); // 40 + 62
console.log("✔ getOrderTotal passed");

// 3. isValidOrder & isValidCartItem
assert.strictEqual(isValidOrder({ id: 10 }), true);
assert.strictEqual(isValidOrder({ order_number: "O-1" }), true);
assert.strictEqual(isValidOrder({}), false);
assert.strictEqual(isValidOrder(null), false);

assert.strictEqual(isValidCartItem({ name: "Aspirin", product_id: 1 }), true);
assert.strictEqual(isValidCartItem({ name: "", product_id: 1 }), false);
assert.strictEqual(isValidCartItem({ name: "Aspirin" }), false);
console.log("✔ isValidOrder and isValidCartItem passed");

// Mock global window and fetch
globalThis.window = {
  APP_CONFIG: { API_BASE_URL: "https://api.pharmacy.test" },
  location: { href: "https://pharmacy.test/pages/Checkout.html" },
};

// 4. Mock fetchCart
globalThis.fetch = async (url, options) => {
  if (url === "https://api.pharmacy.test/orders/items") {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        items: [
          { product_id: 1, name: "Paracetamol", price: 30, quantity: 2, line_total: 60 }
        ],
        total: 60
      }),
    };
  }
  if (url === "https://api.pharmacy.test/orders/items/1") {
    assert.strictEqual(options.method, "DELETE");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ message: "Item removed" }),
    };
  }
  if (url === "https://api.pharmacy.test/orders") {
    assert.strictEqual(options.method, "POST");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ order_id: "ORD-999", message: "Created" }),
    };
  }
  if (url === "https://api.pharmacy.test/account/orders") {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        items: [
          { id: 1, order_number: "ORD-1", total: 100, status: "pending" }
        ]
      }),
    };
  }
  if (url === "https://api.pharmacy.test/addresses") {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        items: [
          { id: 5, line: "Main St", city: "Lakhimpur", pincode: "262701", phone: "9876543210" }
        ]
      }),
    };
  }
  throw new Error(`Unexpected url: ${url}`);
};

const cartRes = await fetchCart();
assert.strictEqual(cartRes.items.length, 1);
assert.strictEqual(cartRes.total, 60);
console.log("✔ fetchCart passed");

const delRes = await removeCartItem(1);
assert.strictEqual(delRes.message, "Item removed");
console.log("✔ removeCartItem passed");

const orderRes = await placeOrder({ payment_method: "cod", address_id: 5 });
assert.strictEqual(orderRes.order_id, "ORD-999");
console.log("✔ placeOrder passed");

const custOrders = await fetchCustomerOrders();
assert.strictEqual(custOrders.length, 1);
assert.strictEqual(custOrders[0].order_number, "ORD-1");
console.log("✔ fetchCustomerOrders passed");

const addresses = await fetchDeliveryAddresses();
assert.strictEqual(addresses.length, 1);
assert.strictEqual(addresses[0].city, "Lakhimpur");
console.log("✔ fetchDeliveryAddresses passed");

console.log("\nALL ORDERS FEATURE API TESTS PASSED! 🎉");
