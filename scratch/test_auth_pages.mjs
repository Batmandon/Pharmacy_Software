import fs from "fs";
import path from "path";
import assert from "assert";

const repoRoot = process.cwd();

console.log("=== Verifying Auth HTML Pages Asset Paths ===");
const pagesToVerify = [
  { htmlFile: "frontend/pages/login.html", expectedFeatureScript: "frontend/features/auth/login.js" },
  { htmlFile: "frontend/pages/register.html", expectedFeatureScript: "frontend/features/auth/register.js" },
];

for (const { htmlFile, expectedFeatureScript } of pagesToVerify) {
  const filePath = path.join(repoRoot, htmlFile);
  assert(fs.existsSync(filePath), `HTML page missing: ${htmlFile}`);
  const htmlContent = fs.readFileSync(filePath, "utf-8");

  // Check CSS links
  const cssMatches = [...htmlContent.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)];
  for (const match of cssMatches) {
    const cssHref = match[1];
    if (cssHref.startsWith("http")) continue; // Skip CDN
    const resolvedPath = path.resolve(path.dirname(filePath), cssHref);
    assert(fs.existsSync(resolvedPath), `CSS file not found for ${htmlFile}: ${cssHref} -> ${resolvedPath}`);
    const stat = fs.statSync(resolvedPath);
    assert(stat.size > 0, `CSS file empty: ${resolvedPath}`);
    console.log(`[PASS] ${htmlFile} CSS: ${cssHref} (${stat.size} bytes)`);
  }

  // Check script tags
  const scriptMatches = [...htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/g)];
  for (const match of scriptMatches) {
    const scriptSrc = match[1];
    if (scriptSrc.startsWith("http")) continue;
    const resolvedPath = path.resolve(path.dirname(filePath), scriptSrc);
    assert(fs.existsSync(resolvedPath), `Script file not found for ${htmlFile}: ${scriptSrc} -> ${resolvedPath}`);
    const stat = fs.statSync(resolvedPath);
    assert(stat.size > 0, `Script file empty: ${resolvedPath}`);
    console.log(`[PASS] ${htmlFile} Script: ${scriptSrc} (${stat.size} bytes)`);
  }

  // Ensure expected feature script is explicitly present
  const expectedRelative = path.relative(path.dirname(filePath), path.join(repoRoot, expectedFeatureScript)).replace(/\\/g, "/");
  assert(
    htmlContent.includes(expectedRelative),
    `Feature script ${expectedRelative} not referenced in ${htmlFile}`
  );
  console.log(`[PASS] ${htmlFile} correctly references ${expectedRelative}`);
}

console.log("\n=== Verifying Shared Utils import and Error Handling ===");
import { showMessage, clearMessage, getErrorMessage } from "../frontend/shared/utils.js";

// Test getErrorMessage formatting
assert.strictEqual(getErrorMessage({ detail: "Invalid password" }, 400), "Invalid password");
assert.strictEqual(getErrorMessage({ detail: [{ msg: "First error" }, { msg: "Second error" }] }, 422), "First error Second error");
assert.strictEqual(getErrorMessage({ error: "Unauthorized" }, 401), "Unauthorized");
assert.strictEqual(getErrorMessage(null, 500), "Request failed (HTTP 500). Please try again.");

// Test showMessage & clearMessage with mock element
const mockMsgEl = {
  textContent: "",
  className: "",
  hidden: true,
};
showMessage(mockMsgEl, "Test message", "error");
assert.strictEqual(mockMsgEl.textContent, "Test message");
assert.strictEqual(mockMsgEl.className, "form-message is-error error");
assert.strictEqual(mockMsgEl.hidden, false);

clearMessage(mockMsgEl);
assert.strictEqual(mockMsgEl.textContent, "");
assert.strictEqual(mockMsgEl.className, "form-message");
assert.strictEqual(mockMsgEl.hidden, true);

console.log("[PASS] All utils logic assertions passed!");
console.log("\nAll Auth module & page checks passed successfully!");
