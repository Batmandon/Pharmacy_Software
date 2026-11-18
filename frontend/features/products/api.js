/**
 * Product API Client and Data Validators
 * Handles data fetching and payload validation for featured products,
 * product details, and the catalog/search listing.
 */
import { getAmount, isValidAmount, readResponse } from "../../shared/utils.js";
export { getAmount, isValidAmount };

export const DETAIL_TABS = [
  ["description_uses", "Description & Uses"],
  ["side_effects_warnings", "Side Effects & Warnings"],
  ["dosage_information", "Dosage Information"],
  ["storage_care", "Storage & Care"],
];

function isOptionalText(value) {
  return value === null || value === undefined || typeof value === "string";
}

export function isValidProduct(product) {
  return (
    product !== null &&
    typeof product === "object" &&
    !Array.isArray(product) &&
    typeof product.name === "string" &&
    product.name.trim().length > 0 &&
    (product.category === null || product.category === undefined || typeof product.category === "string") &&
    (product.image_url === null || product.image_url === undefined || typeof product.image_url === "string") &&
    (product.mrp === null || product.mrp === undefined || getAmount(product.mrp) !== null) &&
    (product.selling_price === null || product.selling_price === undefined || getAmount(product.selling_price) !== null)
  );
}

export function isValidCatalogProduct(product) {
  const discount = product?.discount_percentage ?? product?.discount_percent ?? 0;
  const productId = Number(product?.id);
  return (
    product !== null &&
    typeof product === "object" &&
    !Array.isArray(product) &&
    Number.isInteger(productId) &&
    productId > 0 &&
    typeof product.name === "string" &&
    product.name.trim().length > 0 &&
    isOptionalText(product.brand) &&
    isOptionalText(product.strength) &&
    isOptionalText(product.pack_size) &&
    isOptionalText(product.category) &&
    isOptionalText(product.image_url) &&
    isOptionalText(product.form) &&
    isValidAmount(product.mrp) &&
    Number.isFinite(Number(discount)) &&
    Number(discount) >= 0 &&
    Number(discount) <= 100
  );
}

export function isValidProductDetails(product, expectedProductId) {
  const price = product?.price ?? product?.selling_price;
  return (
    product !== null &&
    typeof product === "object" &&
    !Array.isArray(product) &&
    (expectedProductId ? Number(product.id) === Number(expectedProductId) : Number.isInteger(Number(product.id))) &&
    typeof product.name === "string" &&
    product.name.trim().length > 0 &&
    ["In Stock", "Out of Stock"].includes(product.stock_status) &&
    (price === null || price === undefined || getAmount(price) !== null) &&
    isOptionalText(product.brand) &&
    isOptionalText(product.category) &&
    isOptionalText(product.strength) &&
    isOptionalText(product.form) &&
    isOptionalText(product.pack_size) &&
    isOptionalText(product.schedule) &&
    isOptionalText(product.description) &&
    isOptionalText(product.image_url) &&
    isOptionalText(product.storage_condition) &&
    DETAIL_TABS.every(([key]) => isOptionalText(product[key])) &&
    isOptionalText(product.information_source) &&
    isOptionalText(product.last_reviewed_at)
  );
}

export function validateProductsResponse(result, expectedLimit) {
  return (
    result !== null &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    Array.isArray(result.items) &&
    Number.isInteger(result.total) &&
    result.total >= 0 &&
    result.items.length <= expectedLimit &&
    result.total >= result.items.length &&
    (result.items.length > 0 || result.total === 0) &&
    result.items.every(isValidProduct)
  );
}

export function validateCatalogResponse(result, expectedPageSize, expectedPage) {
  return (
    result !== null &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    Array.isArray(result.items) &&
    Number.isInteger(result.total) &&
    result.total >= 0 &&
    (result.page === undefined || result.page === expectedPage) &&
    (result.page_size === undefined || result.page_size === expectedPageSize) &&
    result.items.length <= expectedPageSize &&
    result.items.every(isValidCatalogProduct)
  );
}

function getApiBaseUrl() {
  const config = typeof window !== "undefined" ? window.APP_CONFIG : globalThis.APP_CONFIG;
  return config?.API_BASE_URL;
}

function getBaseOrigin() {
  return typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://localhost:5500";
}

export async function fetchFeaturedProducts(limit = 4) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("The API URL is not configured.");
  }

  const endpoint = new URL(`${apiBaseUrl}/products`, getBaseOrigin());
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("page_size", String(limit));

  const fetchFn = typeof window !== "undefined" ? window.fetch : globalThis.fetch;
  const response = await fetchFn(endpoint);
  if (!response.ok) {
    throw new Error(`Featured products request failed (HTTP ${response.status}).`);
  }

  const result = await response.json();
  if (!validateProductsResponse(result, limit)) {
    throw new Error("The server returned an invalid featured products response.");
  }

  return result.items;
}

export async function fetchCatalogProducts({ name = "", page = 1, pageSize = 20 } = {}) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Product service is not configured.");
  }

  const cleanName = String(name || "").trim();
  const path = cleanName ? "/products/search" : "/products";
  const endpoint = new URL(`${apiBaseUrl}${path}`, getBaseOrigin());
  if (cleanName) {
    endpoint.searchParams.set("name", cleanName);
  }
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("page_size", String(pageSize));

  const fetchFn = typeof window !== "undefined" ? window.fetch : globalThis.fetch;
  const response = await fetchFn(endpoint);

  if (response.status === 404 && cleanName) {
    return { items: [], total: 0, page, page_size: pageSize, notFound: true };
  }

  if (!response.ok) {
    throw new Error(`Product request failed (HTTP ${response.status}).`);
  }

  const result = await response.json();
  if (!validateCatalogResponse(result, pageSize, page)) {
    throw new Error("The server returned an invalid product response.");
  }

  return result;
}

export async function fetchProductDetails(productId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Product service is not configured.");
  }

  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Product ID is missing or invalid.");
  }

  const endpoint = new URL(`${apiBaseUrl}/products/${id}`, getBaseOrigin());
  const fetchFn = typeof window !== "undefined" ? window.fetch : globalThis.fetch;
  const response = await fetchFn(endpoint);
  const product = await readResponse(response);

  if (!isValidProductDetails(product, id)) {
    throw new Error("The server returned invalid product details.");
  }

  return product;
}

export async function addProductToCart(productId, quantity = 1) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Cart service is not configured.");
  }

  const endpoint = new URL(`${apiBaseUrl}/orders/items`, getBaseOrigin());
  const fetchFn = typeof window !== "undefined" ? window.fetch : globalThis.fetch;

  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    allowUnauthorizedResponse: true,
    body: JSON.stringify({
      product_id: Number(productId),
      quantity: Number(quantity),
    }),
  });

  if (response.status === 401) {
    return { unauthorized: true };
  }

  const result = await readResponse(response);
  return { success: true, message: result.message || "Item added to your cart." };
}
