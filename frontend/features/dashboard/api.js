/**
 * Dashboard Feature: Admin API Client and Configuration
 * Provides centralized network requests, endpoints, and error handling for admin operations.
 */
import { readResponse, getErrorMessage } from "../../shared/utils.js";

export const DASHBOARD_CONFIG = {
  LOGIN_PAGE: "login.html",
  ACCOUNT_PAGE: "account.html",
  PAGE_SIZE: 20,
  RECENT_ORDERS: 10,
  SEARCH_DELAY: 350,
  ALERT_PAGE_SIZE: 5,
  EXPIRY_DAYS: 90,
};

export const DASHBOARD_PATHS = {
  profile: "/auth_routes/profile",
  logout: "/auth_routes/logout",
  dashboard: "/admin/dashboard",
  products: "/admin/products",
  productsWrite: "/admin/products",
  batches: "/admin/batches",
  categories: "/admin/categories",
  manufacturers: "/admin/manufacturers",
  brands: "/admin/brands",
  suppliers: "/admin/suppliers",
  salts: "/admin/salts",
  saltStrengths: "/admin/products/salt-strengths",
  catalogSuggest: "/admin/catalog/suggest",
  orders: "/admin/orders",
  stockAlerts: "/admin/batches/stock-alerts",
  expiring: "/admin/expiry/expiring",
  expired: "/admin/expiry/expired",
};

let alertsStale = false;

export function isAlertsStale() {
  return alertsStale;
}

export function setAlertsStale(stale) {
  alertsStale = Boolean(stale);
}

function getApiBaseUrl() {
  if (typeof window !== "undefined" && window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL;
  }
  return "";
}

function getBaseOrigin() {
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return "http://localhost:5500";
}

/**
 * Execute an authenticated request to backend admin endpoints.
 */
export async function request(method, path, options = {}) {
  const params = options.params || {};
  const body = options.body;
  const allowArray = Boolean(options.allowArray);

  const apiBaseUrl = getApiBaseUrl();
  const url = new URL(apiBaseUrl + path, getBaseOrigin());

  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    const fetchFn = typeof window !== "undefined" ? window.fetch : globalThis.fetch;
    response = await fetchFn(url, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options.signal,
    });
  } catch (networkError) {
    if (networkError.name === "AbortError") {
      throw networkError;
    }
    throw new Error("Cannot reach the server. Check your internet connection and try again.");
  }

  // Not logged in -> redirect to login. Logged in without admin rights -> redirect to account.
  if (response.status === 401 || response.status === 403) {
    if (typeof window !== "undefined") {
      window.location.href = response.status === 401 ? DASHBOARD_CONFIG.LOGIN_PAGE : DASHBOARD_CONFIG.ACCOUNT_PAGE;
    }
    const authError = new Error(
      response.status === 401 ? "Please log in again." : "You do not have access to this page."
    );
    authError.redirecting = true;
    throw authError;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    // Some endpoints may return empty bodies on success
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, response.status));
  }

  if (data === null || typeof data !== "object" || (Array.isArray(data) && !allowArray)) {
    throw new Error("The server sent an unexpected response.");
  }

  if (method !== "GET") {
    setAlertsStale(true);
  }

  return data;
}
