/**
 * Account Feature: API Layer
 * Endpoints and storage helpers for user profile, authentication checks, and address management.
 */
import { readResponse } from "../../shared/utils.js";

const DEFAULT_ADDRESS_KEY = "default_address_id";
const LOGIN_PAGE = "login.html";

function getApiBaseUrl() {
  if (typeof window !== "undefined" && window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL;
  }
  return "";
}

/**
 * Handle unauthenticated (401) responses by redirecting to login.
 */
function handleUnauthorizedRedirect() {
  if (typeof window !== "undefined") {
    window.location.assign(LOGIN_PAGE);
  }
  const error = new Error("Please log in again.");
  error.unauthorized = true;
  throw error;
}

/**
 * Fetch the authenticated user's profile information.
 */
export async function fetchProfile() {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/auth_routes/profile`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    handleUnauthorizedRedirect();
  }

  return await readResponse(response);
}

/**
 * Update the user's editable profile information (first_name, last_name, phone).
 */
export async function updateProfile(profileData) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/auth_routes/profile`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(profileData),
  });

  if (response.status === 401) {
    handleUnauthorizedRedirect();
  }

  return await readResponse(response);
}

/**
 * Log out the user.
 */
export async function logoutUser() {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/auth_routes/logout`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    handleUnauthorizedRedirect();
  }

  return await readResponse(response);
}

/**
 * Fetch all saved addresses for the current user.
 */
export async function fetchAddresses() {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/addresses`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    handleUnauthorizedRedirect();
  }

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
 * Create a new address for the user.
 */
export async function createAddress(addressData) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/addresses`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(addressData),
  });

  if (response.status === 401) {
    handleUnauthorizedRedirect();
  }

  const data = await readResponse(response);
  if (data && data.address) {
    return data.address;
  }
  return data;
}

/**
 * Update an existing address by its ID.
 */
export async function updateAddress(addressId, addressData) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/addresses/${encodeURIComponent(addressId)}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(addressData),
  });

  if (response.status === 401) {
    handleUnauthorizedRedirect();
  }

  const data = await readResponse(response);
  if (data && data.address) {
    return data.address;
  }
  return data;
}

/**
 * Delete an address by its ID.
 */
export async function deleteAddress(addressId) {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/addresses/${encodeURIComponent(addressId)}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    handleUnauthorizedRedirect();
  }

  return await readResponse(response);
}

/**
 * Read the default address ID stored in local browser storage.
 */
export function getSavedDefaultAddressId() {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(DEFAULT_ADDRESS_KEY);
  } catch (error) {
    console.warn("Could not read default address ID from localStorage:", error);
    return null;
  }
}

/**
 * Save the default address ID in local browser storage.
 */
export function setSavedDefaultAddressId(id) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    if (id !== null && id !== undefined) {
      localStorage.setItem(DEFAULT_ADDRESS_KEY, String(id));
    } else {
      localStorage.removeItem(DEFAULT_ADDRESS_KEY);
    }
  } catch (error) {
    console.warn("Could not save default address ID to localStorage:", error);
  }
}

/**
 * Determine the default address from a list of addresses.
 */
export function getDefaultAddress(addresses) {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return null;
  }
  const savedId = getSavedDefaultAddressId();
  if (savedId) {
    const matched = addresses.find(function matchAddress(addr) {
      return String(addr.id) === String(savedId);
    });
    if (matched) {
      return matched;
    }
  }
  return addresses[0];
}
