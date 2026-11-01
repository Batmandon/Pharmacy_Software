// ===================== CONFIG =====================
const CONFIG = {
  API_BASE: window.APP_CONFIG.API_BASE_URL, // comes from config.js, which must load before this file
  LOGIN_PAGE: "login.html",
  ACCOUNT_PAGE: "account.html",
  PAGE_SIZE: 20,
  RECENT_ORDERS: 10,   // rows in the "Recent orders" card on the overview
  SEARCH_DELAY: 350,   // ms to wait after typing before searching products
};

const PATHS = {
  profile: "/auth_routes/profile",   // GET   (used to check the user is an admin + show the name)
  logout: "/auth_routes/logout",     // POST
  dashboard: "/admin/dashboard",     // GET   today_orders, pending_orders, revenue, active_products, total_products
  products: "/admin/products",       // GET   ?search=&page=&page_size=
  productsWrite: "/products",        // POST {product, batch}  |  PUT /{id} {product}  |  DELETE /{id}
  batches: "/batches",               // POST  |  PATCH /{id}  |  DELETE /{id}
  orders: "/admin/orders",           // GET   ?status=&page=&page_size=   |   PATCH /{id}/status
};

// the order flow, same rules as the backend (it checks again, this only decides which options to show)
const STATUS_STEPS = ["pending", "confirmed", "processing", "shipped", "delivered"];

function nextStatuses(current) {
  const i = STATUS_STEPS.indexOf(current);
  if (i === -1 || current === "delivered") return []; // delivered and cancelled are final
  return [...STATUS_STEPS.slice(i + 1), "cancelled"];
}

// ===================== API LAYER =====================
// Returns the parsed JSON. Throws an Error with a message that is safe to show to the user.
// err.redirecting = true means we are already sending the user to another page.
async function request(method, path, { params, body } = {}) {
  const url = new URL(CONFIG.API_BASE + path);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== "" && value != null) url.searchParams.set(key, value);
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "include", // sends the login cookie
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new Error("Cannot reach the server. Check your internet connection and try again.");
  }

  // not logged in -> login page; logged in but not an admin -> account page
  if (res.status === 401 || res.status === 403) {
    window.location.href = res.status === 401 ? CONFIG.LOGIN_PAGE : CONFIG.ACCOUNT_PAGE;
    const err = new Error(res.status === 401 ? "Please log in again." : "You do not have access to this page.");
    err.redirecting = true;
    throw err;
  }

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) throw new Error(errorMessage(data, res.status));
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("The server sent an unexpected response.");
  return data;
}

function errorMessage(data, status) {
  const detail = data && data.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    // validation errors (422): show the readable part of each
    return detail.map((e) => String(e.msg || "").replace(/^Value error, /, "")).filter(Boolean).join(". ");
  }
  if (data && typeof data.message === "string") return data.message;
  if (status === 404) return "Not found.";
  if (status >= 500) return "Server error. Please try again in a moment.";
  return "Something went wrong. Please try again.";
}

// ===================== ELEMENTS =====================
const $ = (id) => document.getElementById(id);

const pageMsg = $("page-message");
const confirmDialog = $("confirm-dialog");

const views = ["overview", "orders", "products"];
const titles = { overview: "Overview", orders: "Orders", products: "Products" };

// ===================== HELPERS =====================
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");
const moneyWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }); // for big tiles
const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
});

const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toItems = (data) => (Array.isArray(data.items) ? data.items : []);
const PAYMENT_LABELS = { cod: "Cash on delivery", pickup: "Store pickup" };

function formatDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "" : dateFmt.format(d);
}
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

function showMessage(text, type = "error") {
  pageMsg.textContent = text;
  pageMsg.className = `form-message ${type}`;
}
function clearMessage() {
  pageMsg.textContent = "";
  pageMsg.className = "form-message";
}

let toastTimer;
function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

// resolves true if the admin confirms, false on cancel / Esc / click outside
function confirmAction({ title, text, confirmLabel }) {
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = text;
  confirmDialog.querySelector('button[value="confirm"]').textContent = confirmLabel;
  confirmDialog.returnValue = "";
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "confirm"), { once: true });
  });
}

// one full-width row inside a table body: "Loading...", "Could not load..."
function tableMessage(tbody, columns, text) {
  const td = document.createElement("td");
  td.colSpan = columns;
  td.className = "empty";
  td.textContent = text;
  const tr = document.createElement("tr");
  tr.append(td);
  tbody.replaceChildren(tr);
}

// clone a <template> and give back a function to fill its [data-f] cells by name
function cloneRow(templateId) {
  const row = $(templateId).content.firstElementChild.cloneNode(true);
  const cell = (name) => row.querySelector(`[data-f="${name}"]`);
  return { row, cell };
}

function setStatus(node, status) {
  node.textContent = status;
  node.className = `status status-${status}`;
}

function updatePager({ prev, next, info }, page, size, total) {
  const pages = Math.max(1, Math.ceil(total / size));
  prev.disabled = page <= 1;
  next.disabled = page >= pages;
  info.textContent = total ? `Page ${page} of ${pages} · ${count.format(total)} total` : "";
}

// ===================== VIEWS (sidebar) =====================
const loaded = { orders: false, products: false };

function showView(name, { updateHash = true } = {}) {
  if (!views.includes(name)) name = "overview";

  document.querySelectorAll(".nav-item[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  views.forEach((v) => { $(`view-${v}`).hidden = v !== name; });
  $("view-title").textContent = titles[name];
  if (updateHash) history.replaceState(null, "", `#${name}`);

  // orders and products load the first time they are opened
  if (name === "orders" && !loaded.orders) { loaded.orders = true; loadOrders(); }
  if (name === "products" && !loaded.products) { loaded.products = true; loadProducts(); }
}

// sidebar buttons
$("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn) showView(btn.dataset.view);
});

// links inside the page, like "View all orders"
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-view-link]");
  if (link) showView(link.dataset.viewLink);
});

window.addEventListener("hashchange", () => showView(location.hash.slice(1), { updateHash: false }));

// ===================== OVERVIEW: tiles =====================
function renderStats(d) {
  $("stat-today").textContent = count.format(toNumber(d.today_orders));
  $("stat-pending").textContent = count.format(toNumber(d.pending_orders));
  $("stat-revenue").textContent = moneyWhole.format(toNumber(d.revenue));
  $("stat-active-products").textContent = count.format(toNumber(d.active_products));
}

async function loadStats() {
  try {
    renderStats(await request("GET", PATHS.dashboard));
    clearMessage();
  } catch (err) {
    if (!err.redirecting) showMessage(`Could not load the summary. ${err.message}`);
  }
}

// ===================== OVERVIEW: recent orders =====================
async function loadRecent() {
  const body = $("recent-orders-body");
  try {
    const data = await request("GET", PATHS.orders, { params: { page: 1, page_size: CONFIG.RECENT_ORDERS } });
    const items = toItems(data);

    body.replaceChildren(...items.map((o) => {
      const { row, cell } = cloneRow("recent-order-row");
      cell("id").textContent = `#${o.id}`;
      cell("customer").textContent = o.customer || "";
      cell("date").textContent = formatDate(o.created_at);
      cell("total").textContent = money.format(toNumber(o.total));
      setStatus(cell("status"), String(o.status));
      return row;
    }));
    $("recent-orders-empty").hidden = items.length > 0;
  } catch (err) {
    if (!err.redirecting) tableMessage(body, 5, `Could not load orders. ${err.message}`);
  }
}

// ===================== ORDERS =====================
const orderState = { page: 1, status: "", seq: 0 };
const orderPager = { prev: $("order-prev"), next: $("order-next"), info: $("order-page-info") };

function orderRow(o) {
  const { row, cell } = cloneRow("order-row");
  const status = String(o.status);
  row.dataset.id = o.id; // the status dropdown reads the order id from here

  cell("id").textContent = `#${o.id}`;
  cell("customer").textContent = o.customer || "";
  cell("date").textContent = formatDate(o.created_at);
  cell("payment").textContent = PAYMENT_LABELS[o.payment_method] || o.payment_method || "";
  cell("total").textContent = money.format(toNumber(o.total));
  setStatus(cell("status"), status);

  const select = cell("next-status");
  const options = nextStatuses(status);
  select.append(new Option("Change...", ""));
  options.forEach((s) => select.append(new Option(cap(s), s)));
  select.disabled = options.length === 0;
  return row;
}

async function loadOrders() {
  const seq = ++orderState.seq; // ignore answers that arrive late, after a newer request
  const body = $("order-body");
  tableMessage(body, 7, "Loading...");
  $("order-empty").hidden = true;

  try {
    const data = await request("GET", PATHS.orders, {
      params: { page: orderState.page, page_size: CONFIG.PAGE_SIZE, status: orderState.status },
    });
    if (seq !== orderState.seq) return;

    const items = toItems(data);
    body.replaceChildren(...items.map(orderRow));
    $("order-empty").hidden = items.length > 0;
    updatePager(orderPager, orderState.page, CONFIG.PAGE_SIZE, toNumber(data.total));
  } catch (err) {
    if (seq === orderState.seq && !err.redirecting) tableMessage(body, 7, `Could not load orders. ${err.message}`);
  }
}

$("order-status-filter").addEventListener("change", (e) => {
  orderState.status = e.target.value;
  orderState.page = 1;
  loadOrders();
});
$("order-prev").addEventListener("click", () => { orderState.page -= 1; loadOrders(); });
$("order-next").addEventListener("click", () => { orderState.page += 1; loadOrders(); });

// the "Change status" dropdown in every row (one listener on the table body)
$("order-body").addEventListener("change", async (e) => {
  const select = e.target.closest('select[data-f="next-status"]');
  if (!select || !select.value) return;

  const orderId = select.closest("tr").dataset.id;
  const next = select.value;

  if (next === "cancelled" || next === "delivered") {
    const ok = await confirmAction({
      title: next === "cancelled" ? `Cancel order #${orderId}?` : `Mark order #${orderId} as delivered?`,
      text: next === "cancelled"
        ? "The items go back into stock. This cannot be undone."
        : "A delivered order cannot be changed again.",
      confirmLabel: next === "cancelled" ? "Cancel order" : "Mark delivered",
    });
    if (!ok) { select.value = ""; return; }
  }

  select.disabled = true;
  try {
    await request("PATCH", `${PATHS.orders}/${orderId}/status`, { body: { status: next } });
    showToast(`Order #${orderId} is now ${next}`);
  } catch (err) {
    if (err.redirecting) return;
    showToast(err.message);
  }
  // success or failure, reload so the screen matches the database
  // (the tiles change too: pending count, revenue)
  await Promise.allSettled([loadOrders(), loadRecent(), loadStats()]);
});

// ===================== PRODUCTS =====================
const productState = { page: 1, search: "", seq: 0 };
const productPager = { prev: $("page-prev"), next: $("page-next"), info: $("page-info") };
const productCache = new Map(); // product id -> product from the list (it carries its batches)
const expanded = new Set();     // ids of the products whose batches are open

// "YYYY-MM-DD" for today in India, and days between today and a date
const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const daysLeft = (dateStr) =>
  Math.round((new Date(`${dateStr}T00:00:00Z`) - new Date(`${todayStr()}T00:00:00Z`)) / 86400000);
const dateOnlyFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDateOnly = (s) => (s ? dateOnlyFmt.format(new Date(`${s}T00:00:00Z`)) : "");

function productRow(p) {
  const { row, cell } = cloneRow("product-row");
  row.dataset.id = p.id;

  cell("name").textContent = p.name;
  cell("sub").textContent = [p.form, p.strength, p.pack_size].filter(Boolean).join(" · ");
  cell("category").textContent = p.category || "";
  cell("stock").textContent = count.format(toNumber(p.total_stock));
  setStatus(cell("status"), p.is_active ? "active" : "inactive");

  const batchCount = Array.isArray(p.batches) ? p.batches.length : 0;
  cell("batch-label").textContent = `Batches (${batchCount})`;
  row.querySelector('[data-action="toggle-batches"]').setAttribute("aria-expanded", String(expanded.has(p.id)));
  return row;
}

function batchRow(b) {
  const { row, cell } = cloneRow("batch-row");
  row.dataset.batchId = b.id;

  cell("batch_no").textContent = b.batch_no;
  cell("expiry").textContent = formatDateOnly(b.expiry_date);
  const left = daysLeft(b.expiry_date);
  if (left <= 90) {
    const tag = document.createElement("span");
    tag.className = `tag ${left < 0 ? "tag-expired" : "tag-soon"}`;
    tag.textContent = left < 0 ? "Expired" : `${left}d left`;
    cell("expiry").append(tag);
  }
  cell("quantity").textContent = count.format(toNumber(b.quantity));
  cell("mrp").textContent = b.mrp == null ? "–" : money.format(toNumber(b.mrp));
  cell("discount").textContent = `${toNumber(b.discount_percent)}%`;
  return row;
}

// the extra row under a product that lists its batches
function batchPanel(p) {
  const { row, cell } = cloneRow("batch-panel");
  const batches = Array.isArray(p.batches) ? p.batches : [];
  row.dataset.productId = p.id;
  cell("batch-body").replaceChildren(...batches.map(batchRow));
  cell("batch-empty").hidden = batches.length > 0;
  return row;
}

async function loadProducts() {
  const seq = ++productState.seq;
  const body = $("product-body");
  tableMessage(body, 5, "Loading...");
  $("product-empty").hidden = true;

  try {
    const data = await request("GET", PATHS.products, {
      params: { search: productState.search, page: productState.page, page_size: CONFIG.PAGE_SIZE },
    });
    if (seq !== productState.seq) return;

    const items = toItems(data);
    productCache.clear();
    items.forEach((p) => productCache.set(p.id, p));

    // products whose batches were open stay open after a reload
    body.replaceChildren(...items.flatMap((p) => (expanded.has(p.id) ? [productRow(p), batchPanel(p)] : [productRow(p)])));
    $("product-empty").hidden = items.length > 0;
    updatePager(productPager, productState.page, CONFIG.PAGE_SIZE, toNumber(data.total));
  } catch (err) {
    if (seq === productState.seq && !err.redirecting) tableMessage(body, 5, `Could not load products. ${err.message}`);
  }
}

// search: wait until the admin stops typing, then go back to page 1
let searchTimer;
$("product-search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    productState.search = e.target.value.trim();
    productState.page = 1;
    loadProducts();
  }, CONFIG.SEARCH_DELAY);
});
$("page-prev").addEventListener("click", () => { productState.page -= 1; loadProducts(); });
$("page-next").addEventListener("click", () => { productState.page += 1; loadProducts(); });

// ---------- form helpers (shared by the product and batch dialogs) ----------
const PRODUCT_FIELDS = [
  "name", "category", "manufacturer", "strength", "form", "pack_size",
  "schedule", "gst_percent", "hsn_code", "storage_condition", "description", "image_url",
];
const BATCH_FIELDS = [
  "batch_no", "quantity", "mfg_date", "expiry_date", "purchase_price",
  "mrp", "discount_percent", "supplier_id", "rack_location",
];
const MONEY = /^\d{1,8}(\.\d{1,2})?$/;       // up to 8 digits, 2 decimals (the database column allows that)
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;

const readValues = (form, names) => Object.fromEntries(names.map((n) => [n, form.elements[n].value.trim()]));

function setFieldError(input, msg) {
  const field = input.closest(".field");
  if (!field) return;
  const holder = field.querySelector(".error");
  if (holder) holder.textContent = msg;
  field.classList.toggle("invalid", Boolean(msg));
}
function clearErrors(form) {
  form.querySelectorAll(".field").forEach((f) => {
    f.classList.remove("invalid");
    const holder = f.querySelector(".error");
    if (holder) holder.textContent = "";
  });
  form.querySelectorAll(".salt-row .invalid").forEach((i) => i.classList.remove("invalid"));
}
function applyErrors(form, errors) {
  for (const [name, msg] of Object.entries(errors)) setFieldError(form.elements[name], msg);
}
function dialogMessage(box, text) {
  box.textContent = text;
  box.className = text ? "form-message error" : "form-message";
}

// same rules as the backend models (the backend checks again)
function tooLong(errors, values, name, max, label) {
  if (values[name].length > max) errors[name] = `${label} can be at most ${max} characters.`;
}

function validateProduct(v) {
  const e = {};
  if (!v.name) e.name = "Name is required."; else tooLong(e, v, "name", 20, "Name");
  if (!v.category) e.category = "Category is required."; else tooLong(e, v, "category", 30, "Category");
  if (!v.manufacturer) e.manufacturer = "Manufacturer is required."; else tooLong(e, v, "manufacturer", 100, "Manufacturer");
  tooLong(e, v, "strength", 20, "Strength");
  if (!v.form) e.form = "Select a form.";
  tooLong(e, v, "pack_size", 20, "Pack size");
  if (!v.schedule) e.schedule = "Select a schedule.";
  if (v.gst_percent === "") e.gst_percent = "GST % is required.";
  else if (!(Number(v.gst_percent) >= 0 && Number(v.gst_percent) <= 99.99)) e.gst_percent = "Enter a value from 0 to 99.99.";
  tooLong(e, v, "hsn_code", 20, "HSN code");
  tooLong(e, v, "storage_condition", 100, "Storage condition");
  tooLong(e, v, "description", 500, "Description");
  tooLong(e, v, "image_url", 200, "Image URL");
  return e;
}

function validateBatch(v) {
  const e = {};
  if (!v.batch_no) e.batch_no = "Batch number is required."; else tooLong(e, v, "batch_no", 100, "Batch number");
  if (!/^\d+$/.test(v.quantity)) e.quantity = "Enter a whole number, 0 or more.";
  if (!v.expiry_date) e.expiry_date = "Expiry date is required.";
  else if (v.mfg_date && v.mfg_date >= v.expiry_date) e.expiry_date = "Expiry must be after the manufacturing date.";
  if (v.purchase_price && !MONEY.test(v.purchase_price)) e.purchase_price = "Enter an amount like 25 or 25.50.";
  if (v.mrp && !MONEY.test(v.mrp)) e.mrp = "Enter an amount like 30 or 30.50.";
  if (!e.purchase_price && !e.mrp && v.purchase_price && v.mrp && Number(v.purchase_price) > Number(v.mrp)) {
    e.purchase_price = "Purchase price cannot be more than MRP.";
  }
  if (v.discount_percent && (!PERCENT.test(v.discount_percent) || Number(v.discount_percent) > 100)) {
    e.discount_percent = "Enter a value from 0 to 100.";
  }
  if (v.supplier_id && !/^[1-9]\d*$/.test(v.supplier_id)) e.supplier_id = "Enter a valid supplier ID.";
  tooLong(e, v, "rack_location", 100, "Rack location");
  return e;
}

// the batch part of the request body (empty optional fields become null)
function batchPayload(v) {
  return {
    batch_no: v.batch_no,
    quantity: Number(v.quantity),
    mfg_date: v.mfg_date || null,
    expiry_date: v.expiry_date,
    purchase_price: v.purchase_price || null,
    mrp: v.mrp || null,
    discount_percent: v.discount_percent || "0",
    supplier_id: v.supplier_id ? Number(v.supplier_id) : null,
    rack_location: v.rack_location || null,
  };
}

// ---------- product dialog (add + edit) ----------
const productDialog = $("product-dialog");
const productForm = $("product-form");
const productMsg = $("product-message");
const saltList = $("salt-list");
let productDialogState = { mode: "add", id: null, original: null };

function addSaltRow(salt = { name: "", strength: "" }) {
  const { row, cell } = cloneRow("salt-row");
  cell("salt-name").value = salt.name ?? "";
  cell("salt-strength").value = salt.strength ?? "";
  saltList.append(row);
}

// reads the salt rows. Empty rows are skipped; returns the salts and one error message (or "")
function readSalts() {
  let error = "";
  const salts = [];
  const seen = new Set();
  saltList.querySelectorAll(".salt-row").forEach((row) => {
    const nameInput = row.querySelector('[data-f="salt-name"]');
    const strengthInput = row.querySelector('[data-f="salt-strength"]');
    const name = nameInput.value.trim();
    const strength = strengthInput.value.trim();
    if (!name && !strength) return;

    if (!name) { error ||= "Every salt needs a name."; nameInput.classList.add("invalid"); return; }
    if (strength.length > 20) { error ||= "Salt strength can be at most 20 characters."; strengthInput.classList.add("invalid"); }
    if (seen.has(name.toLowerCase())) { error ||= "The same salt is added more than once."; nameInput.classList.add("invalid"); }
    seen.add(name.toLowerCase());
    salts.push({ name, strength });
  });
  if (!salts.length && !error) error = "Add at least one salt.";
  return { salts, error };
}

function openProductDialog(mode, product = null) {
  productDialogState = { mode, id: product ? product.id : null, original: product };
  $("product-dialog-title").textContent = mode === "add" ? "Add product" : `Edit ${product.name}`;
  $("product-save").textContent = mode === "add" ? "Save product" : "Save changes";

  productForm.reset();
  clearErrors(productForm);
  dialogMessage(productMsg, "");
  saltList.replaceChildren();

  if (product) {
    PRODUCT_FIELDS.forEach((n) => { productForm.elements[n].value = product[n] ?? ""; });
    (product.salts || []).forEach(addSaltRow);
  }
  if (!saltList.children.length) addSaltRow();

  // a new product is saved together with its first batch; editing a product does not touch batches
  $("batch-fieldset").hidden = mode === "edit";
  productDialog.showModal();
}

$("add-product-btn").addEventListener("click", () => openProductDialog("add"));
$("add-salt-btn").addEventListener("click", () => addSaltRow());
saltList.addEventListener("click", (e) => {
  if (!e.target.closest('[data-action="remove-salt"]')) return;
  e.target.closest(".salt-row").remove();
  if (!saltList.children.length) addSaltRow(); // always keep one row to type in
});

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { mode, id, original } = productDialogState;
  clearErrors(productForm);
  dialogMessage(productMsg, "");

  const values = readValues(productForm, PRODUCT_FIELDS);
  const { salts, error: saltError } = readSalts();
  const batchValues = mode === "add" ? readValues(productForm, BATCH_FIELDS) : null;

  const errors = { ...validateProduct(values), ...(batchValues ? validateBatch(batchValues) : {}) };
  applyErrors(productForm, errors);
  $("salts-error").textContent = saltError;
  if (Object.keys(errors).length || saltError) {
    dialogMessage(productMsg, "Please fix the highlighted fields.");
    return;
  }

  const product = { ...values, gst_percent: Number(values.gst_percent), salts };
  const btn = $("product-save");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    if (mode === "add") {
      await request("POST", PATHS.productsWrite, { body: { product, batch: batchPayload(batchValues) } });
      showToast("Product added");
    } else {
      // send only what changed
      const changes = {};
      PRODUCT_FIELDS.forEach((n) => {
        const before = n === "gst_percent" ? Number(original[n]) : (original[n] ?? "");
        if (product[n] !== before) changes[n] = product[n];
      });
      const savedSalts = (original.salts || []).map((s) => ({ name: s.name, strength: s.strength ?? "" }));
      if (JSON.stringify(salts) !== JSON.stringify(savedSalts)) changes.salts = salts;

      if (!Object.keys(changes).length) {
        productDialog.close();
        showToast("No changes to save");
        return;
      }
      await request("PUT", `${PATHS.productsWrite}/${id}`, { body: { product: changes } });
      showToast("Product updated");
    }
    productDialog.close();
    await Promise.allSettled([loadProducts(), loadStats()]);
  } catch (err) {
    if (!err.redirecting) dialogMessage(productMsg, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

async function editProduct(id) {
  try {
    // the list does not carry salts or HSN / GST / description, so ask for the full product
    openProductDialog("edit", await request("GET", `${PATHS.products}/${id}`));
  } catch (err) {
    if (!err.redirecting) showToast(err.message);
  }
}

async function deleteProduct(id) {
  const p = productCache.get(id);
  const ok = await confirmAction({
    title: `Delete ${p ? p.name : "this product"}?`,
    text: "This cannot be undone. A product that has batches or order history cannot be deleted.",
    confirmLabel: "Delete",
  });
  if (!ok) return;

  try {
    await request("DELETE", `${PATHS.productsWrite}/${id}`);
    expanded.delete(id);
    showToast("Product deleted");
    await Promise.allSettled([loadProducts(), loadStats()]);
  } catch (err) {
    if (!err.redirecting) showToast(err.message);
  }
}

// ---------- batch dialog (add a batch to a product / edit one batch) ----------
const batchDialog = $("batch-dialog");
const batchForm = $("batch-form");
const batchMsg = $("batch-message");
let batchDialogState = { mode: "add", productId: null, batch: null };

const batchToValues = (b) =>
  Object.fromEntries(BATCH_FIELDS.map((n) => [n, b[n] == null ? "" : String(b[n])]));

function openBatchDialog(mode, productId, batch = null) {
  batchDialogState = { mode, productId, batch };
  const product = productCache.get(productId);
  $("batch-dialog-title").textContent =
    mode === "add" ? `Add batch${product ? ` · ${product.name}` : ""}` : `Edit batch ${batch.batch_no}`;
  $("batch-save").textContent = mode === "add" ? "Save batch" : "Save changes";

  batchForm.reset();
  clearErrors(batchForm);
  dialogMessage(batchMsg, "");
  if (batch) {
    const values = batchToValues(batch);
    BATCH_FIELDS.forEach((n) => { batchForm.elements[n].value = values[n]; });
  }
  batchDialog.showModal();
}

batchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { mode, productId, batch } = batchDialogState;
  clearErrors(batchForm);
  dialogMessage(batchMsg, "");

  const values = readValues(batchForm, BATCH_FIELDS);
  const errors = validateBatch(values);
  applyErrors(batchForm, errors);
  if (Object.keys(errors).length) {
    dialogMessage(batchMsg, "Please fix the highlighted fields.");
    return;
  }

  const payload = batchPayload(values);
  const btn = $("batch-save");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    if (mode === "add") {
      await request("POST", PATHS.batches, { body: { product_id: productId, ...payload } });
      showToast("Batch added");
    } else {
      // send only what changed (money fields are compared as numbers: "30" equals "30.00")
      const before = batchPayload(batchToValues(batch));
      const same = (k) => {
        const money = ["purchase_price", "mrp", "discount_percent"].includes(k);
        const norm = (v) => (money && v != null ? Number(v) : v);
        return norm(payload[k]) === norm(before[k]);
      };
      const changes = Object.fromEntries(Object.keys(payload).filter((k) => !same(k)).map((k) => [k, payload[k]]));

      if (!Object.keys(changes).length) {
        batchDialog.close();
        showToast("No changes to save");
        return;
      }
      await request("PATCH", `${PATHS.batches}/${batch.id}`, { body: changes });
      showToast("Batch updated");
    }
    batchDialog.close();
    expanded.add(productId); // keep this product's batches open after the reload
    await Promise.allSettled([loadProducts(), loadStats()]);
  } catch (err) {
    if (!err.redirecting) dialogMessage(batchMsg, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

async function deleteBatch(productId, batchId) {
  const batch = (productCache.get(productId)?.batches || []).find((b) => b.id === batchId);
  const ok = await confirmAction({
    title: `Delete batch ${batch ? batch.batch_no : ""}?`,
    text: "Its stock is removed from the shop. A batch that was already sold in an order cannot be deleted; set its quantity to 0 instead.",
    confirmLabel: "Delete",
  });
  if (!ok) return;

  try {
    await request("DELETE", `${PATHS.batches}/${batchId}`);
    showToast("Batch deleted");
    await Promise.allSettled([loadProducts(), loadStats()]);
  } catch (err) {
    if (!err.redirecting) showToast(err.message);
  }
}

// ---------- clicks in the products table (one listener for every button) ----------
$("product-body").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  // buttons inside the batches list of a product
  const panel = btn.closest(".batch-panel");
  if (panel) {
    const productId = Number(panel.dataset.productId);
    const batchId = Number(btn.closest("tr").dataset.batchId);
    if (action === "add-batch") openBatchDialog("add", productId);
    else if (action === "edit-batch") {
      const batch = (productCache.get(productId)?.batches || []).find((b) => b.id === batchId);
      if (batch) openBatchDialog("edit", productId, batch);
    } else if (action === "delete-batch") deleteBatch(productId, batchId);
    return;
  }

  // buttons on a product row
  const row = btn.closest("tr");
  const id = Number(row.dataset.id);
  if (action === "toggle-batches") {
    const open = !expanded.has(id);
    if (open) { expanded.add(id); row.after(batchPanel(productCache.get(id))); }
    else { expanded.delete(id); row.nextElementSibling?.classList.contains("batch-panel") && row.nextElementSibling.remove(); }
    btn.setAttribute("aria-expanded", String(open));
  } else if (action === "edit") editProduct(id);
  else if (action === "delete") deleteProduct(id);
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
    text: "You will need to log in again to open the dashboard.",
    confirmLabel: "Logout",
  });
  if (!ok) return;

  try {
    await request("POST", PATHS.logout);
    window.location.href = CONFIG.LOGIN_PAGE;
  } catch (err) {
    if (!err.redirecting) showToast(err.message);
  }
});

// ===================== INITIAL LOAD =====================
async function init() {
  // 1) who is this? Only admins stay on this page.
  let profile;
  try {
    profile = await request("GET", PATHS.profile);
  } catch (err) {
    if (!err.redirecting) showMessage(`Could not load the dashboard. ${err.message}`);
    return;
  }
  if (profile.role !== "admin") { window.location.replace(CONFIG.ACCOUNT_PAGE); return; }
  $("admin-name").textContent = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  // 2) the overview always loads; orders / products load when their view opens
  showView(location.hash.slice(1) || "overview", { updateHash: false });
  loadStats();
  loadRecent();
}

init();
