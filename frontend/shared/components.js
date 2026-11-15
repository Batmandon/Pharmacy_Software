/**
 * Shared Component Loader
 * Dynamically loads shared HTML fragments (navbar, footer) into placeholder divs.
 * Also handles the global navbar search form submission.
 */

async function loadComponent(name, placeholderId) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) {
    return;
  }

  try {
    let response = await fetch(`../shared/${name}.html`);
    if (!response.ok) {
      response = await fetch(`../components/${name}.html`);
    }
    if (!response.ok) {
      throw new Error(`Could not load ${name} component (HTTP ${response.status}).`);
    }

    placeholder.innerHTML = await response.text();
  } catch (error) {
    placeholder.textContent = `The ${name} could not be loaded. Refresh the page or check the web server.`;
    placeholder.setAttribute("role", "alert");
    console.error(`Failed to load the ${name} component:`, error);
  }
}

// Global search submit handler
document.addEventListener("submit", function handleGlobalSearch(event) {
  if (!(event.target instanceof HTMLFormElement) || !event.target.matches(".nav-search")) {
    return;
  }

  event.preventDefault();
  const input = event.target.querySelector(".search-input");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const resultsUrl = new URL("searchproduct.html", window.location.href);
  const name = input.value.trim();
  if (name) {
    resultsUrl.searchParams.set("name", name);
  }
  resultsUrl.searchParams.set("page", "1");
  window.location.assign(resultsUrl);
});

// Auto-load common shared components
loadComponent("navbar", "navbar-placeholder");
loadComponent("footer", "footer-placeholder");
