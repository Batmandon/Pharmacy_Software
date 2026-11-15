/**
 * Reusable Product Card Components
 * Provides HTML markup generators for products on Home, Catalog, and Search pages.
 */
import {
  escapeHtml,
  getSafeImageUrl,
  formatPrice,
  getAmount,
} from "../../shared/utils.js";

// Compact card used on the Home Page (Featured Products)
export function renderProductCard(product) {
  if (!product || typeof product !== "object") {
    return "";
  }

  const name = escapeHtml(String(product.name || "").trim());
  const category = escapeHtml(String(product.category || "Health Product").trim());
  const imageUrl = getSafeImageUrl(product.image_url);
  const sellingPrice = getAmount(product.selling_price ?? product.price);
  const mrp = getAmount(product.mrp);
  const productId = Number(product.id);
  const hasValidId = Number.isSafeInteger(productId) && productId > 0;
  const detailUrl = hasValidId ? `product_detail..html?id=${productId}` : "#";

  const priceMarkup = sellingPrice === null
    ? '<span class="product-price">Price unavailable</span>'
    : `<span class="product-price">${formatPrice(sellingPrice)}</span>
       ${mrp !== null ? `<span class="product-mrp">${formatPrice(mrp)}</span>` : ""}`;

  return `<article class="product-card" data-product-id="${hasValidId ? productId : ""}">
    <div class="product-img-box">
      ${imageUrl
        ? `<a href="${detailUrl}"><img src="${escapeHtml(imageUrl)}" alt="${name}" loading="lazy"></a>`
        : `<a href="${detailUrl}"><i class="fa-solid fa-pills" aria-hidden="true"></i></a>`}
    </div>
    <div class="product-details">
      <span class="product-category">${category}</span>
      <h3 class="product-name"><a href="${detailUrl}">${name}</a></h3>
      <div class="product-price-row">${priceMarkup}</div>
    </div>
  </article>`;
}

// Full card used in Catalog (product.html) and Search (searchproduct.html)
export function renderCatalogCard(product) {
  if (!product || typeof product !== "object") {
    return "";
  }

  const productId = Number(product.id);
  const mrp = Number(product.mrp);
  const discount = Number(product.discount_percentage ?? product.discount_percent ?? 0);
  const hasPrice = product.mrp !== null && product.mrp !== undefined && Number.isFinite(mrp);
  const sellingPrice = hasPrice
    ? Math.round((mrp * (100 - discount) / 100 + Number.EPSILON) * 100) / 100
    : null;
  const savings = hasPrice ? mrp - sellingPrice : null;

  const name = escapeHtml(product.name || "Unnamed product");
  const strength = escapeHtml(product.strength || "");
  const category = escapeHtml(product.category || "Uncategorized");
  const brand = escapeHtml(product.brand || "Brand not listed");
  const manufacturer = escapeHtml(product.manufacturer || "");
  const salt = escapeHtml(product.salt || "");
  const description = escapeHtml(product.description || "");
  const packDetails = [product.form, product.pack_size].filter(Boolean).map(escapeHtml).join(" · ");
  const imageUrl = getSafeImageUrl(product.image_url);

  const discountBadge = discount > 0 ? `<span class="badge-off">${escapeHtml(discount)}% OFF</span>` : "";
  const prescriptionBadge = product.requires_prescription ? '<span class="badge-rx">Not for online sale</span>' : "";

  const priceDetails = hasPrice
    ? `<div class="price-row">
          <span class="price">${formatPrice(sellingPrice)}</span>
          ${discount > 0 ? `<span class="mrp">${formatPrice(mrp)}</span>` : ""}
          ${discount > 0 && savings > 0 ? `<span class="save">Save ${formatPrice(savings)}</span>` : ""}
        </div>`
    : '<p class="price-unavailable">Price unavailable</p>';

  const detailUrl = `product_detail..html?id=${productId}`;

  return `<article class="card product-card" data-product-id="${productId}">
    <div class="card-img product-img-box">
      ${imageUrl
        ? `<a href="${detailUrl}"><img src="${escapeHtml(imageUrl)}" alt="${name}" loading="lazy"></a>`
        : `<a href="${detailUrl}"><div class="product-image-placeholder" aria-hidden="true"><i class="fa-solid fa-pills"></i></div></a>`}
      ${discountBadge}
      ${prescriptionBadge}
    </div>
    <div class="card-body product-details">
      <span class="cat product-category">${category}</span>
      <h2 class="name product-name"><a class="product-detail-link" href="${detailUrl}">${name}</a></h2>
      ${strength ? `<span class="strength product-pack">${strength}</span>` : ""}
      <span class="product-detail product-brand"><strong>Brand:</strong> ${brand}</span>
      ${manufacturer ? `<span class="product-detail"><strong>Manufacturer:</strong> ${manufacturer}</span>` : ""}
      ${salt ? `<span class="product-detail"><strong>Salt:</strong> ${salt}</span>` : ""}
      ${packDetails ? `<span class="pack"><i class="fa-solid fa-box"></i> ${packDetails}</span>` : ""}
      ${description ? `<p class="product-description">${description}</p>` : ""}
      <span class="stock in">In stock</span>
      ${priceDetails}
      ${product.requires_prescription
        ? ""
        : '<button class="btn-cart" type="button"><i class="fa-solid fa-cart-plus"></i> Add to Cart</button>'}
      ${product.requires_prescription ? "" : '<p class="cart-message" role="status" aria-live="polite" hidden></p>'}
    </div>
  </article>`;
}

export const renderFeaturedProduct = renderProductCard;
