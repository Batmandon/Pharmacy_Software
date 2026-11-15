import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

console.log("=== VERIFYING PRODUCT DETAIL PAGE ASSETS ===");

const htmlPath = path.resolve("frontend/pages/product_detail..html");
const html = fs.readFileSync(htmlPath, "utf-8");
const pageDir = path.dirname(htmlPath);

// 1. Verify CSS links
const cssRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g;
let match;
const foundCss = [];
while ((match = cssRegex.exec(html)) !== null) {
  const href = match[1];
  if (!href.startsWith("http")) {
    const fullPath = path.resolve(pageDir, href);
    assert.ok(fs.existsSync(fullPath), `CSS file missing: ${href} (resolved: ${fullPath})`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `CSS file empty: ${href}`);
    foundCss.push(href);
  }
}
console.log(`✔ Verified ${foundCss.length} CSS link(s):`, foundCss);

// 2. Verify Script src
const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["']/g;
const foundScripts = [];
while ((match = scriptRegex.exec(html)) !== null) {
  const src = match[1];
  if (!src.startsWith("http")) {
    const fullPath = path.resolve(pageDir, src);
    assert.ok(fs.existsSync(fullPath), `Script file missing: ${src} (resolved: ${fullPath})`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Script file empty: ${src}`);
    foundScripts.push(src);
  }
}
console.log(`✔ Verified ${foundScripts.length} script src(s):`, foundScripts);

console.log("\nALL PDP ASSET VERIFICATIONS PASSED SUCCESSFULLY! 🎉");
