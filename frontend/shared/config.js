/**
 * Frontend Configuration & Global Fetch Interceptor
 *
 * Responsibilities:
 * 1. Sets window.APP_CONFIG.API_BASE_URL (points to port 8000 locally, or /api when deployed).
 * 2. Wraps window.fetch to automatically:
 *    - Include credentials (cookies) with all backend API calls.
 *    - Automatically refresh expired session tokens when receiving HTTP 401.
 *    - Safely retry the failed request after a successful token refresh.
 *    - Redirect the user to login.html if authentication fails completely.
 */

// Step 1: Detect environment and define base API URL
const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.APP_CONFIG = {
  API_BASE_URL: isLocalhost ? `http://${window.location.hostname}:8000` : "/api",
};

const apiBaseUrl = new URL(window.APP_CONFIG.API_BASE_URL, window.location.href);
const refreshTokenUrl = new URL("/auth_routes/refresh_token", apiBaseUrl);
const originalFetch = window.fetch.bind(window);

// Tracks any active refresh promise to avoid duplicate concurrent refresh requests
let activeRefreshPromise = null;

// Helper: Check if a URL belongs to our backend API
function isBackendApiRequest(url) {
  return url.origin === apiBaseUrl.origin && url.pathname.startsWith(apiBaseUrl.pathname);
}

// Helper: Redirect user to the login page if not already there
function redirectToLoginPage() {
  const currentPath = window.location.pathname;
  if (!currentPath.endsWith("/login.html")) {
    window.location.assign("login.html");
  }
}

// Helper: Silently call backend to refresh the session token
async function attemptSessionRefresh() {
  // If a refresh is already in progress, reuse the existing promise
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async function () {
    try {
      const response = await originalFetch(refreshTokenUrl, {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch (error) {
      console.error("Session refresh request failed:", error);
      return false;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

// Step 2: Custom Fetch Interceptor
async function customFetch(input, options = {}) {
  const inputUrl = input instanceof Request ? input.url : input;
  const targetUrl = new URL(inputUrl, window.location.href);

  // If the request is for external resources or assets, use normal browser fetch
  if (!isBackendApiRequest(targetUrl)) {
    return originalFetch(input, options);
  }

  // Ensure cookies (JWT credentials) are included with backend API requests
  const allowUnauthorizedResponse = Boolean(options.allowUnauthorizedResponse);
  const requestOptions = {
    ...options,
    credentials: "include",
  };
  delete requestOptions.allowUnauthorizedResponse;

  const request = new Request(input, requestOptions);
  const response = await originalFetch(request.clone());

  // Return immediately if successful, or if not a 401, or if this is the refresh call itself
  if (response.status !== 401 || targetUrl.href === refreshTokenUrl.href) {
    return response;
  }

  // When HTTP 401 Unauthorized occurs, attempt to refresh the session token
  const refreshSuccessful = await attemptSessionRefresh();

  if (!refreshSuccessful) {
    if (!allowUnauthorizedResponse) {
      redirectToLoginPage();
    }
    return response;
  }

  // Session was successfully refreshed: retry the original request
  const retryResponse = await originalFetch(request.clone());

  if (retryResponse.status === 401 && !allowUnauthorizedResponse) {
    redirectToLoginPage();
  }

  return retryResponse;
}

// Activate interceptor
window.fetch = customFetch;
