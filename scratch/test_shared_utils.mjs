import assert from "node:assert/strict";
import * as sharedUtils from "../frontend/shared/utils.js";

console.log("=== RUNNING SHARED UTILS TESTS ===");

// 1. escapeHtml
assert.equal(sharedUtils.escapeHtml("<tag>&'\""), "&lt;tag&gt;&amp;&#39;&quot;");
assert.equal(sharedUtils.escapeHtml(null), "");
assert.equal(sharedUtils.escapeHtml(undefined), "");
console.log("✔ escapeHtml passed");

// 2. getAmount & isValidAmount
assert.equal(sharedUtils.getAmount(120), 120);
assert.equal(sharedUtils.getAmount("50.25"), 50.25);
assert.equal(sharedUtils.getAmount(-1), null);
assert.equal(sharedUtils.getAmount("abc"), null);
assert.equal(sharedUtils.isValidAmount(120), true);
assert.equal(sharedUtils.isValidAmount(null), true);
assert.equal(sharedUtils.isValidAmount(-1), false);
console.log("✔ getAmount and isValidAmount passed");

// 3. formatPrice
const price = sharedUtils.formatPrice(450.5);
assert.ok(price.includes("450.50") || price.includes("451"));
assert.equal(sharedUtils.formatPrice("invalid"), null);
console.log("✔ formatPrice passed");

// 4. getImageUrl
assert.equal(sharedUtils.getImageUrl("https://example.com/item.png"), "https://example.com/item.png");
assert.equal(sharedUtils.getImageUrl("javascript:alert(1)"), "");
assert.equal(sharedUtils.getImageUrl(""), "");
console.log("✔ getImageUrl passed");

// 5. formatDate
const formattedDate = sharedUtils.formatDate("2026-11-15T10:00:00Z");
assert.ok(formattedDate.length > 0);
assert.equal(sharedUtils.formatDate("invalid-date"), "");
console.log("✔ formatDate passed");

// 6. addressText
assert.equal(
  sharedUtils.addressText({ line: "123 Main St", city: "Lucknow", pincode: "226001" }),
  "123 Main St, Lucknow - 226001"
);
assert.equal(sharedUtils.addressText(null), "");
assert.equal(sharedUtils.addressText("Plain address text"), "Plain address text");
console.log("✔ addressText passed");

// 7. getErrorMessage
assert.equal(sharedUtils.getErrorMessage({ detail: "User not found" }, 404), "User not found");
assert.equal(sharedUtils.getErrorMessage({ detail: [{ msg: "Password too short" }, { msg: "Email required" }] }, 422), "Password too short Email required");
assert.equal(sharedUtils.getErrorMessage({ error: "Unauthorized" }, 401), "Unauthorized");
console.log("✔ getErrorMessage passed");

// 8. readResponse
const mockOkResponse = {
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ success: true, count: 5 }),
};
const parsedOk = await sharedUtils.readResponse(mockOkResponse);
assert.equal(parsedOk.count, 5);

const mockErrResponse = {
  ok: false,
  status: 400,
  text: async () => JSON.stringify({ detail: "Bad request payload" }),
};
await assert.rejects(
  async () => await sharedUtils.readResponse(mockErrResponse),
  /Bad request payload/
);
console.log("✔ readResponse passed");

// 9. showMessage & clearMessage
const mockMsgEl = { textContent: "", className: "", hidden: true };
sharedUtils.showMessage(mockMsgEl, "Success message", "success");
assert.equal(mockMsgEl.textContent, "Success message");
assert.equal(mockMsgEl.hidden, false);

sharedUtils.clearMessage(mockMsgEl);
assert.equal(mockMsgEl.textContent, "");
assert.equal(mockMsgEl.hidden, true);
console.log("✔ showMessage and clearMessage passed");

console.log("\nALL SHARED UTILITY TESTS PASSED! 🎉");
