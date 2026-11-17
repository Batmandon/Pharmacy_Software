/**
 * Orders Feature: API Layer
 * Centralized endpoints and data processing for Cart, Checkout, and Customer Orders.
 */
import { readResponse, getAmount } from "../../shared/utils.js";

function getApiBaseUrl() {
  if (typeof window !== "undefined" && window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL;
  }
  return "";
}

/**
 * Fetch the current user's cart items and total.
 */
export async function fetchCart() {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/orders/items`, {
    credentials: "include",
  });
  const data = await readResponse(response);
  const items = Array.isArray(data.items) ? data.items : [];
  const total = getAmount(data.total);
  return {
    items,
    total: total !== null ? total : 0,
  };
}

/**
 * Remove an item from the cart by its product ID.
 */
export async function removeCartItem(productId) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(
    `${apiBaseUrl}/orders/items/${encodeURIComponent(productId)}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );
  return await readResponse(response);
}

/**
 * Place a new order with payment method and delivery address ID.
 */
export async function placeOrder(payload) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return await readResponse(response);
}

/**
 * Fetch saved delivery addresses for checkout.
 */
export async function fetchDeliveryAddresses() {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/addresses`, {
    credentials: "include",
  });
  const data = await readResponse(response);
  if (Array.isArray(data.items)) {
    return data.items;
  }
  if (Array.isArray(data)) {
    return data;
  }
  return [];
}

/**
 * Fetch customer orders history.
 */
export async function fetchCustomerOrders() {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/orders`, {
    credentials: "include",
  });
  const data = await readResponse(response);
  if (Array.isArray(data.items)) {
    return data.items;
  }
  if (Array.isArray(data)) {
    return data;
  }
  return [];
}

/**
 * Get readable order identifier.
 */
export function getOrderNumber(order) {
  if (!order) return "";
  if (order.order_number) return order.order_number;
  if (order.id) return order.id;
  return "";
}

/**
 * Calculate total amount for an order.
 */
export function getOrderTotal(order) {
  if (!order) return 0;
  if (order.total !== undefined && order.total !== null) {
    const totalAmount = getAmount(order.total);
    if (totalAmount !== null) {
      return totalAmount;
    }
  }

  const items = Array.isArray(order.items) ? order.items : [];
  let sum = 0;
  for (const item of items) {
    const itemPrice = getAmount(item.price);
    const itemQuantity = Number(item.quantity);
    if (itemPrice !== null && !Number.isNaN(itemQuantity)) {
      sum += itemPrice * itemQuantity;
    }
  }
  return sum;
}

/**
 * Validate order data structure.
 */
export function isValidOrder(order) {
  if (!order || typeof order !== "object") {
    return false;
  }
  const hasIdentifier = Boolean(order.id || order.order_number);
  return hasIdentifier;
}

/**
 * Validate cart item data structure.
 */
export function isValidCartItem(item) {
  if (!item || typeof item !== "object") {
    return false;
  }
  const hasName = typeof item.name === "string" && item.name.trim().length > 0;
  const hasProductId = item.product_id !== undefined && item.product_id !== null;
  return hasName && hasProductId;
}
