import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

console.log("=== VERIFYING CATALOG & SEARCH PAGES ASSETS ===");

const pages = [
  "frontend/pages/product.html",
  "frontend/pages/searchproduct.html",
];

pages.forEach((pageRel) => {
  const htmlPath = path.resolve(pageRel);
  const html = fs.readFileSync(htmlPath, "utf-8");
  const pageDir = path.dirname(htmlPath);

  // Check CSS
  const cssRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g;
  let match;
  while ((match = cssRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href.startsWith("http")) {
      const fullPath = path.resolve(pageDir, href);
      assert.ok(fs.existsSync(fullPath), `${pageRel} missing CSS: ${href}`);
      assert.ok(fs.statSync(fullPath).size > 0, `${pageRel} empty CSS: ${href}`);
    }
  }

  // Check Scripts
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["']/g;
  while ((match = scriptRegex.exec(html)) !== null) {
    const src = match[1];
    if (!src.startsWith("http")) {
      const fullPath = path.resolve(pageDir, src);
      assert.ok(fs.existsSync(fullPath), `${pageRel} missing Script: ${src}`);
      assert.ok(fs.statSync(fullPath).size > 0, `${pageRel} empty Script: ${src}`);
    }
  }

  console.log(`✔ Verified assets for ${pageRel}`);
});

console.log("\nALL CATALOG & SEARCH PAGE ASSETS VERIFIED SUCCESSFULLY! 🎉");
