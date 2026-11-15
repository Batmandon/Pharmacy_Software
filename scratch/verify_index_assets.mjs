import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

console.log("=== VERIFYING FRONTEND INDEX ASSETS ===");

const htmlPath = path.resolve("frontend/pages/index.html");
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

// 2. Verify Image src
const imgRegex = /<img\s+[^>]*src=["']([^"']+)["']/g;
const foundImages = [];
while ((match = imgRegex.exec(html)) !== null) {
  const src = match[1];
  if (!src.startsWith("http")) {
    const fullPath = path.resolve(pageDir, src);
    assert.ok(fs.existsSync(fullPath), `Image file missing: ${src} (resolved: ${fullPath})`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Image file empty: ${src}`);
    foundImages.push(src);
  }
}
console.log(`✔ Verified ${foundImages.length} image src(s):`, foundImages);

// 3. Verify Script src
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

// 4. Verify shared templates
const navbarPath = path.resolve("frontend/shared/navbar.html");
const footerPath = path.resolve("frontend/shared/footer.html");
assert.ok(fs.existsSync(navbarPath), "navbar.html missing in frontend/shared");
assert.ok(fs.existsSync(footerPath), "footer.html missing in frontend/shared");
console.log("✔ Verified shared navbar.html and footer.html exist");

console.log("\nALL ASSET VERIFICATIONS PASSED SUCCESSFULLY! 🎉");
