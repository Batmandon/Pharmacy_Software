window.APP_CONFIG = {
  API_BASE_URL: "http://127.0.0.1:8000",
};

const apiBaseUrl = new URL(window.APP_CONFIG.API_BASE_URL, window.location.href);
const refreshUrl = new URL("/auth_routes/refresh_token", apiBaseUrl);
const originalFetch = window.fetch.bind(window);
let refreshRequest = null;

function isApiRequest(url) {
  return url.origin === apiBaseUrl.origin && url.pathname.startsWith(apiBaseUrl.pathname);
}

function redirectToLogin() {
  if (!window.location.pathname.endsWith("/login.html")) {
    window.location.assign("login.html");
  }
}

window.fetch = async (input, init) => {
  const inputUrl = input instanceof Request ? input.url : input;
  const url = new URL(inputUrl, window.location.href);
  if (!isApiRequest(url)) {
    return originalFetch(input, init);
  }

  const { allowUnauthorizedResponse = false, ...requestInit } = init || {};
  const request = new Request(input, { ...requestInit, credentials: "include" });
  const response = await originalFetch(request.clone());
  if (response.status !== 401 || url.href === refreshUrl.href) {
    return response;
  }

  refreshRequest ??= originalFetch(refreshUrl, {
    method: "POST",
    credentials: "include",
  }).then((refreshResponse) => refreshResponse.ok).finally(() => {
    refreshRequest = null;
  });

  let refreshed;
  try {
    refreshed = await refreshRequest;
  } catch (error) {
    console.error("Session refresh request failed:", error);
    refreshed = false;
  }

  if (!refreshed) {
    if (!allowUnauthorizedResponse) {
      redirectToLogin();
    }
    return response;
  }

  const retryResponse = await originalFetch(request.clone());
  if (retryResponse.status === 401 && !allowUnauthorizedResponse) {
    redirectToLogin();
  }
  return retryResponse;
};
