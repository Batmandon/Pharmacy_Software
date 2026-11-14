// ===================== CONFIG (change these to match your backend) =====================
const CONFIG = {
  API_BASE: window.APP_CONFIG.API_BASE_URL, // comes from config.js, which must load before this file
  LOGIN_PAGE: "login.html",
  MAX_ADDRESSES: 3,                    // the backend enforces this too
  DEFAULT_ADDRESS_KEY: "default_address_id", // the default address is kept in this browser only (not in the backend)
};

const PATHS = {
  profile: "/auth_routes/profile",     // GET, PUT
  addresses: "/addresses",             // GET, POST | PUT, DELETE /:id
  orders: "/account/orders",           // GET
  logout: "/auth_routes/logout",       // POST
};

// ===================== API LAYER =====================
async function request(method, path, body) {
  const res = await fetch(CONFIG.API_BASE + path, {
    method,
    credentials: "include", // sends the login cookie; remove if you use an Authorization header instead
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  // not logged in: go to the login page
  if (res.status === 401) {
    window.location.href = CONFIG.LOGIN_PAGE;
    const err = new Error("Please log in again.");
    err.unauthorized = true;
    throw err;
  }

  let data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    const message = data.message || (typeof data.detail === "string" ? data.detail : "") || "Something went wrong. Please try again.";
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

const toList = (data) => (Array.isArray(data) ? data : data.items || []);

// ===================== STATE =====================
const state = { profile: {}, addresses: [], orders: [] };
let editingAddressId = null; // null = adding a new address

// ===================== ELEMENTS =====================
const $ = (id) => document.getElementById(id);

const pageMsg = $("page-message");
const profileForm = $("profile-form");
const profileMsg = $("profile-message");
const profileInputs = [...profileForm.querySelectorAll("input")];
const addressDialog = $("address-dialog");
const addressForm = $("address-form");
const addressMsg = $("address-message");
const addressInputs = [...addressForm.querySelectorAll('input:not([type="checkbox"])')];
const orderDialog = $("order-dialog");
const confirmDialog = $("confirm-dialog");
const addressList = $("address-list");
const orderList = $("order-list");

// ===================== HELPERS =====================
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function formatDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "" : dateFmt.format(d);
}

const orderTotal = (o) =>
  o.total ?? (o.items || []).reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0);

const orderNumber = (o) => o.order_number ?? o.id;

function addressText(a) {
  if (!a) return "";
  if (typeof a === "string") return a;
  const place = [a.city, a.pincode].filter(Boolean).join(" - ");
  return [a.line, place].filter(Boolean).join(", ");
}

// tiny DOM builder: strings are added as text, so backend data can't inject HTML
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}
const icon = (cls) => el("i", { class: cls, "aria-hidden": "true" });

function showMessage(box, text, type) {
  box.textContent = text;
  box.className = `form-message ${type}`;
}
function clearMessage(box) {
  box.textContent = "";
  box.className = "form-message";
}
function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.textContent = label;
}

let toastTimer;
function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// resolves true if the user confirms, false if they cancel / press Esc / click outside
function confirmAction({ title, text, confirmLabel }) {
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = text;
  $("confirm-ok").textContent = confirmLabel;
  confirmDialog.returnValue = "";
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "confirm"), { once: true });
  });
}

// ===================== VALIDATION (keep the same as your backend rules) =====================
const rules = {
  first_name: (v) => !v ? "First name is required." : !/^[A-Za-z\s.'-]{1,20}$/.test(v) ? "Use letters only (max 20)." : "",
  last_name: (v) => !v ? "Last name is required." : !/^[A-Za-z\s.'-]{1,20}$/.test(v) ? "Use letters only (max 20)." : "",
  phone: (v) => !v ? "Mobile number is required." : !/^[6-9]\d{9}$/.test(v) ? "Enter a valid 10-digit mobile number." : "",
  email: (v) => !v ? "Email is required." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Enter a valid email address." : "",
  line: (v) => !v ? "Address is required." : v.length < 5 ? "Address is too short." : v.length > 300 ? "Address is too long (max 300)." : "",
  city: (v) => !v ? "City is required." : !/^[A-Za-z\s.'-]{2,100}$/.test(v) ? "Enter a valid city name (letters only, 2-100)." : "",
  pincode: (v) => !v ? "Pincode is required." : !/^[1-9]\d{5}$/.test(v) ? "Enter a valid 6-digit pincode." : "",
};

function setError(input, msg) {
  const holder = input.closest(".field");
  if (holder) holder.querySelector(".error").textContent = msg;
  input.classList.toggle("invalid", Boolean(msg));
}

// checks every input (no short-circuit) so all errors show at once
function validateInputs(inputs) {
  let ok = true;
  inputs.forEach((input) => {
    const rule = rules[input.name];
    if (!rule) return;
    const msg = rule(input.value.trim());
    setError(input, msg);
    if (msg) ok = false;
  });
  return ok;
}

// live validation + digits-only for phone and pincode (one listener for every form)
document.addEventListener("input", (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || !input.form) return;
  if (input.name === "phone" || input.name === "pincode") input.value = input.value.replace(/\D/g, "");
  if (input.classList.contains("invalid")) validateInputs([input]);
});

// ===================== TABS =====================
const tabButtons = [...document.querySelectorAll(".tab")];

function showTab(name, { updateHash = true } = {}) {
  if (!$(`panel-${name}`)) name = "profile";
  tabButtons.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== `panel-${name}`; });
  if (updateHash) history.replaceState(null, "", `#${name}`);
}

$("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) showTab(tab.dataset.tab);
});
window.addEventListener("hashchange", () => showTab(location.hash.slice(1), { updateHash: false }));

// "Manage" / "View all" links in the profile overview jump to another tab
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) showTab(go.dataset.goto);
});

// ===================== PROFILE =====================
function renderProfile() {
  profileInputs.forEach((i) => { i.value = state.profile[i.name] ?? ""; });

  // top banner: avatar initials, greeting, contact line
  const first = String(state.profile.first_name ?? "");
  const last = String(state.profile.last_name ?? "");
  $("avatar").textContent = ((first[0] || "") + (last[0] || "")).toUpperCase() || "?";
  $("hero-name").textContent = first ? `Hello, ${first}!` : "Welcome!";
  $("hero-sub").textContent =
    [state.profile.email, state.profile.phone].filter(Boolean).join("  •  ") || "Manage your profile, addresses and orders.";
}

// banner numbers
function updateStats() {
  const active = state.orders.filter((o) => ["pending", "processing"].includes(String(o.status).toLowerCase())).length;
  $("stat-orders").textContent = state.orders.length;
  $("stat-active").textContent = active;
  $("stat-addresses").textContent = state.addresses.length;
}

// "Default address" and "Latest order" cards under the profile form
function renderOverview() {
  const def = getDefaultAddress();
  $("overview-address").replaceChildren(...(def
    ? [
        el("p", { class: "strong", text: def.line }),
        el("p", { class: "sub", text: `${def.city} - ${def.pincode}` }),
        el("p", { class: "sub", text: def.phone }),
      ]
    : [el("p", { class: "muted", text: "No address saved yet." })]));

  const latest = state.orders[0]; // backend sends the newest order first
  $("overview-order").replaceChildren(...(latest
    ? [
        el("p", { class: "strong", text: `Order #${orderNumber(latest)}` }),
        el("p", { class: "sub", text: `${formatDate(latest.created_at)} • ${money.format(orderTotal(latest))}` }),
        statusBadge(String(latest.status || "pending").toLowerCase()),
      ]
    : [el("p", { class: "muted", text: "No orders yet." })]));
}

function setProfileEditing(on) {
  profileForm.classList.toggle("is-readonly", !on);
  profileInputs.forEach((i) => { i.readOnly = !on || i.name === "email"; }); // email is never editable
  $("profile-actions").hidden = !on;
  $("edit-profile-btn").hidden = on;
  if (on) profileInputs[0].focus();
}

$("edit-profile-btn").addEventListener("click", () => {
  clearMessage(profileMsg);
  setProfileEditing(true);
});

$("cancel-profile-btn").addEventListener("click", () => {
  renderProfile(); // put the saved values back
  profileInputs.forEach((i) => setError(i, ""));
  clearMessage(profileMsg);
  setProfileEditing(false);
});

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage(profileMsg);

  // email is read-only: it is not validated and not sent (the backend rejects extra fields)
  const editableInputs = profileInputs.filter((i) => i.name !== "email");

  if (!validateInputs(editableInputs)) {
    showMessage(profileMsg, "Please fix the highlighted fields.", "error");
    return;
  }

  const body = Object.fromEntries(editableInputs.map((i) => [i.name, i.value.trim()]));
  const btn = $("save-profile-btn");
  setBusy(btn, true, "Saving...");

  try {
    await request("PUT", PATHS.profile, body);
    state.profile = { ...state.profile, ...body };
    renderProfile();
    setProfileEditing(false);
    showToast("Profile updated");
  } catch (err) {
    if (!err.unauthorized) showMessage(profileMsg, err.message, "error");
  } finally {
    setBusy(btn, false, "Save changes");
  }
});

// ===================== ADDRESSES =====================

// The default address is a frontend-only choice: only its id is kept in this browser.
// If nothing is saved (or that address was deleted), the first address is the default.
// Your checkout page can read the same localStorage key (CONFIG.DEFAULT_ADDRESS_KEY) to pre-select it.
function getSavedDefaultId() {
  try { return localStorage.getItem(CONFIG.DEFAULT_ADDRESS_KEY); } catch (_) { return null; }
}
function setSavedDefaultId(id) {
  try { localStorage.setItem(CONFIG.DEFAULT_ADDRESS_KEY, String(id)); } catch (_) {}
}
function getDefaultAddress() {
  const saved = getSavedDefaultId();
  return state.addresses.find((a) => String(a.id) === saved) || state.addresses[0] || null;
}
const isDefault = (a) => getDefaultAddress()?.id === a.id;

function actionBtn(action, id, label, iconCls, danger = false) {
  return el("button", { type: "button", class: `link-btn${danger ? " danger" : ""}`, dataset: { action, id } },
    icon(iconCls), ` ${label}`);
}

function addressCard(a) {
  const def = isDefault(a);
  return el("article", { class: `address-card${def ? " is-default" : ""}` },
    def ? el("span", { class: "badge-default" }, icon("fa-solid fa-circle-check"), " Default") : null,
    el("p", { class: "addr-line", text: a.line }),
    el("p", { class: "addr-sub", text: `${a.city} - ${a.pincode}` }),
    el("p", { class: "addr-phone" }, icon("fa-solid fa-phone"), ` ${a.phone}`),
    el("div", { class: "card-actions" },
      def ? null : actionBtn("default", a.id, "Set as default", "fa-regular fa-circle-check"),
      actionBtn("edit", a.id, "Edit", "fa-solid fa-pen"),
      actionBtn("delete", a.id, "Delete", "fa-solid fa-trash", true),
    ),
  );
}

function renderAddresses() {
  const sorted = [...state.addresses].sort((a, b) => Number(isDefault(b)) - Number(isDefault(a))); // default first
  const canAdd = sorted.length < CONFIG.MAX_ADDRESSES;
  const addTile = el("button", { type: "button", class: "address-add", dataset: { action: "add" } },
    icon("fa-solid fa-plus"), el("span", { text: "Add new address" }));

  addressList.replaceChildren(...sorted.map(addressCard), ...(sorted.length && canAdd ? [addTile] : []));
  $("add-address-btn").hidden = !canAdd; // max reached: no way to open the add form
  $("address-empty").hidden = sorted.length > 0;
  updateStats();
  renderOverview();
}

function openAddressDialog(addr = null) {
  if (!addr && state.addresses.length >= CONFIG.MAX_ADDRESSES) {
    showToast(`You can save up to ${CONFIG.MAX_ADDRESSES} addresses. Delete one to add a new one.`);
    return;
  }
  editingAddressId = addr ? addr.id : null;
  $("address-dialog-title").textContent = addr ? "Edit Address" : "Add New Address";

  addressInputs.forEach((i) => { setError(i, ""); i.value = addr ? (addr[i.name] ?? "") : ""; });
  clearMessage(addressMsg);

  // the first address is always the default; a default address can't be un-set (pick another one instead)
  const defaultBox = $("is_default");
  const mustBeDefault = addr ? isDefault(addr) : state.addresses.length === 0;
  defaultBox.checked = mustBeDefault;
  defaultBox.disabled = mustBeDefault;

  addressDialog.showModal();
}

$("add-address-btn").addEventListener("click", () => openAddressDialog());

addressForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage(addressMsg);

  if (!validateInputs(addressInputs)) {
    showMessage(addressMsg, "Please fix the highlighted fields.", "error");
    return;
  }

  const body = Object.fromEntries(addressInputs.map((i) => [i.name, i.value.trim()]));
  const makeDefaultToo = $("is_default").checked; // frontend only: never sent to the backend

  const btn = $("address-save");
  setBusy(btn, true, "Saving...");

  try {
    let savedId = editingAddressId;

    if (editingAddressId == null) {
      const data = await request("POST", PATHS.addresses, body);
      savedId = data.address.id;
      state.addresses.push(data.address);
    } else {
      const data = await request("PUT", `${PATHS.addresses}/${editingAddressId}`, body);
      state.addresses = state.addresses.map((a) => (a.id === editingAddressId ? data.address : a));
    }

    // only one default address at a time, remembered in this browser
    if (makeDefaultToo) setSavedDefaultId(savedId);

    renderAddresses();
    addressDialog.close();
    showToast(editingAddressId == null ? "Address added" : "Address updated");
  } catch (err) {
    if (!err.unauthorized) showMessage(addressMsg, err.message, "error");
  } finally {
    setBusy(btn, false, "Save address");
  }
});

function makeDefault(addr) {
  setSavedDefaultId(addr.id); // frontend only, no request to the backend
  renderAddresses();
  showToast("Default address updated");
}

async function removeAddress(addr) {
  if (isDefault(addr) && state.addresses.length > 1) {
    showToast("Set another address as default before deleting this one.");
    return;
  }

  const ok = await confirmAction({
    title: "Delete this address?",
    text: "It will be removed from your account and won't be available at checkout.",
    confirmLabel: "Delete",
  });
  if (!ok) return;

  try {
    await request("DELETE", `${PATHS.addresses}/${addr.id}`);
    state.addresses = state.addresses.filter((a) => a.id !== addr.id);
    renderAddresses();
    showToast("Address deleted");
  } catch (err) {
    if (!err.unauthorized) showToast(err.message);
  }
}

// one listener handles Set as default / Edit / Delete on every address card
addressList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "add") { openAddressDialog(); return; }
  const addr = state.addresses.find((a) => String(a.id) === btn.dataset.id);
  if (!addr) return;

  if (btn.dataset.action === "edit") openAddressDialog(addr);
  else if (btn.dataset.action === "default") makeDefault(addr);
  else if (btn.dataset.action === "delete") removeAddress(addr);
});

// ===================== ORDERS =====================
function statusBadge(status) {
  return el("span", { class: `status status-${status}`, text: status });
}

function orderCard(o) {
  const status = String(o.status || "pending").toLowerCase();
  const summary = (o.items || []).map((i) => `${i.name} × ${i.quantity}`).join(", ");

  return el("article", { class: "order-card" },
    el("div", { class: "order-top" },
      el("div", {},
        el("p", { class: "order-no", text: `Order #${orderNumber(o)}` }),
        el("p", { class: "order-date", text: `Placed on ${formatDate(o.created_at)}` }),
      ),
      statusBadge(status),
    ),
    el("p", { class: "order-summary", text: summary }),
    el("div", { class: "order-foot" },
      el("span", { class: "order-total-line" }, "Total", el("strong", { text: money.format(orderTotal(o)) })),
      el("button", { type: "button", class: "btn btn-outline btn-sm", dataset: { orderId: o.id } }, "View details"),
    ),
  );
}

function renderOrders() {
  orderList.replaceChildren(...state.orders.map(orderCard));
  $("order-empty").hidden = state.orders.length > 0;
  updateStats();
  renderOverview();
}

function openOrderDialog(o) {
  const status = String(o.status || "pending").toLowerCase();
  $("order-dialog-title").textContent = `Order #${orderNumber(o)}`;

  const metaRow = (label, value) =>
    el("div", { class: "meta-row" }, el("span", { class: "meta-label", text: label }),
      value instanceof Node ? value : el("span", { class: "meta-value", text: value }));

  $("order-meta").replaceChildren(
    metaRow("Placed on", formatDate(o.created_at)),
    metaRow("Status", statusBadge(status)),
    ...(addressText(o.address) ? [metaRow("Delivery address", addressText(o.address))] : []),
  );

  $("order-items").replaceChildren(...(o.items || []).map((i) =>
    el("div", { class: "item-row" },
      el("div", {},
        el("p", { class: "item-name", text: i.name }),
        el("p", { class: "item-sub", text: `${i.quantity} × ${money.format(i.price)}` }),
      ),
      el("strong", { text: money.format(Number(i.price) * Number(i.quantity)) }),
    ),
  ));

  $("order-total").textContent = money.format(orderTotal(o));
  orderDialog.showModal();
}

// one listener handles "View details" on every order card
orderList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-order-id]");
  if (!btn) return;
  const order = state.orders.find((o) => String(o.id) === btn.dataset.orderId);
  if (order) openOrderDialog(order);
});

// ===================== DIALOG CLOSING =====================
document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) { closer.closest("dialog").close(); return; }
  if (e.target instanceof HTMLDialogElement) e.target.close(); // click on the dark backdrop
});

// ===================== LOGOUT =====================
$("logout-btn").addEventListener("click", async () => {
  const ok = await confirmAction({
    title: "Log out?",
    text: "You will need to log in again to see your orders and addresses.",
    confirmLabel: "Logout",
  });
  if (!ok) return;

  try {
    await request("POST", PATHS.logout);
    // if you keep a token in localStorage, remove it here: localStorage.removeItem("token");
    window.location.href = CONFIG.LOGIN_PAGE;
  } catch (err) {
    if (!err.unauthorized) showToast(err.message);
  }
});

// ===================== INITIAL LOAD =====================
async function init() {
  showTab(location.hash.slice(1) || "profile", { updateHash: false });

  // 1) profile first: decides which page this user belongs on
  let profile;
  try {
    profile = await request("GET", PATHS.profile);
  } catch (err) {
    if (!err.unauthorized) showMessage(profileMsg, "Could not load your profile.", "error");
    return;
  }
  if (profile.role === "admin") { window.location.replace("dashboard.html"); return; }
  state.profile = profile;
  renderProfile();

  // 2) customer only: addresses and orders
  const [addresses, orders] = await Promise.allSettled([
    request("GET", PATHS.addresses),
    request("GET", PATHS.orders),
  ]);
  if ([addresses, orders].some((r) => r.status === "rejected" && r.reason.unauthorized)) return;

  const failed = (list, text) => list.replaceChildren(el("p", { class: "muted", text }));

  if (addresses.status === "fulfilled") { state.addresses = toList(addresses.value); renderAddresses(); }
  else failed(addressList, "Could not load your addresses. Please refresh the page.");

  if (orders.status === "fulfilled") { state.orders = toList(orders.value); renderOrders(); }
  else failed(orderList, "Could not load your orders. Please refresh the page.");
}

init();
