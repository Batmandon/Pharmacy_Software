/**
 * Dashboard Feature: Products & Inventory Controller
 * Manages admin products catalogue, batch panels, lookup dialogs, salts, and low-stock/expiry alerts.
 */
import {
  formatDateOnly,
  formatNumber,
  formatPrice,
  showToast,
  confirmAction,
  renderTableMessage,
} from "../../shared/utils.js";
import { request, DASHBOARD_PATHS, DASHBOARD_CONFIG, setAlertsStale } from "./api.js";
import { loadDashboardStats } from "./profile.js";

// Validation patterns matching backend schema rules
const SCHEDULES = ["OTC", "H", "H1", "X"];
const MONEY = /^\d+(\.\d{1,2})?$/;
const PERCENT = /^\d+(\.\d{1,2})?$/;

const productState = {
  page: 1,
  search: "",
  seq: 0,
};

const productCache = new Map();
const expanded = new Set();

const expiryCards = {
  expiring: { path: DASHBOARD_PATHS.expiring, params: { days: DASHBOARD_CONFIG.EXPIRY_DAYS }, page: 1, seq: 0 },
  expired: { path: DASHBOARD_PATHS.expired, params: {}, page: 1, seq: 0 },
};

const lookups = {
  categories: [],
  brands: [],
  suppliers: [],
  salts: [],
  strengths: new Map(),
};

const LOOKUP_LABELS = {
  categories: "category",
  brands: "brand",
  suppliers: "supplier",
  salts: "salt",
};

const NO_CHOICE_LABELS = {
  brands: "No brand",
  suppliers: "No supplier",
};

let productDialogState = { mode: "add", id: null, original: null };
let catalogKind = "categories";
let catalogResult = null;
let saltRowSeq = 0;
let searchDebounceTimer = null;

function toNumber(value) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return number;
  }
  return 0;
}

function getTodayIsoString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function calculateDaysLeft(dateString) {
  if (!dateString) return 0;
  const targetDate = new Date(`${dateString}T00:00:00Z`);
  const todayDate = new Date(`${getTodayIsoString()}T00:00:00Z`);
  return Math.round((targetDate - todayDate) / 86400000);
}

function cloneRow(templateId) {
  const template = document.getElementById(templateId);
  if (!template) {
    throw new Error(`Template #${templateId} not found`);
  }
  const row = template.content.firstElementChild.cloneNode(true);
  function cell(name) {
    return row.querySelector(`[data-f="${name}"]`);
  }
  return { row, cell };
}

function setStatusBadge(node, status) {
  if (!node) return;
  node.textContent = status;
  node.className = `status status-${status}`;
}

function updatePager(pager, page, size, total) {
  if (!pager || !pager.prev || !pager.next || !pager.info) return;
  const totalPages = Math.max(1, Math.ceil(total / size));
  pager.prev.disabled = page <= 1;
  pager.next.disabled = page >= totalPages;
  pager.info.textContent = total > 0 ? `Page ${page} of ${totalPages} \u00b7 ${formatNumber(total)} total` : "";
}

function sortByName(itemA, itemB) {
  return String(itemA.name).localeCompare(String(itemB.name), "en", { sensitivity: "base" });
}

function normalizeLookupList(responseResult) {
  const list = Array.isArray(responseResult.value) ? responseResult.value : [];
  return list.filter(function isValidItem(item) {
    return item && item.id && item.name;
  }).sort(sortByName);
}

// ===================== FORM VALIDATION HELPERS =====================

function setFieldError(input, message) {
  if (!input) return;
  input.classList.toggle("invalid", Boolean(message));
  const field = input.closest(".field") || input.closest(".select-add") || input.parentElement;
  if (!field) return;

  field.classList.toggle("invalid", Boolean(message));
  let hint = field.querySelector(".error, .field-error");
  if (!hint && message) {
    hint = document.createElement("small");
    hint.className = "error";
    field.append(hint);
  }
  if (hint) {
    hint.textContent = message || "";
    hint.hidden = !message;
  }
}

function clearFormErrors(form) {
  if (!form) return;
  form.querySelectorAll(".invalid").forEach(function removeInvalidClass(element) {
    element.classList.remove("invalid");
  });
  form.querySelectorAll(".error, .field-error").forEach(function clearErrorHint(element) {
    element.textContent = "";
  });
}

function applyFormErrors(form, errors) {
  if (!form) return;
  for (const [name, message] of Object.entries(errors)) {
    const input = form.elements[name] || form.querySelector(`[name="${name}"]`);
    if (input) {
      setFieldError(input, message);
    }
  }
}

function setDialogMessage(element, text) {
  if (!element) return;
  element.textContent = text || "";
  element.className = "form-message";
  if (text) {
    element.classList.add("error", "is-error");
  }
}

function checkLengthLimit(errors, values, fieldName, maxLength, fieldLabel) {
  const value = values[fieldName];
  if (value && value.length > maxLength) {
    errors[fieldName] = `${fieldLabel} can be at most ${maxLength} characters.`;
  }
}

export function validateProductForm(values) {
  const errors = {};

  if (!values.name) {
    errors.name = "Enter a product name.";
  }
  checkLengthLimit(errors, values, "name", 100, "Name");

  if (!values.category_id) {
    errors.category_id = "Pick a category.";
  }

  if (!values.form) {
    errors.form = "Pick a medicine form.";
  }

  if (!values.pack_size) {
    errors.pack_size = "Enter a pack size (e.g. 10 tablets).";
  }
  checkLengthLimit(errors, values, "pack_size", 50, "Pack size");

  if (!values.schedule || !SCHEDULES.includes(values.schedule)) {
    errors.schedule = "Pick a schedule.";
  }

  if (
    values.gst_percent === "" ||
    isNaN(Number(values.gst_percent)) ||
    Number(values.gst_percent) < 0 ||
    Number(values.gst_percent) > 99.99
  ) {
    errors.gst_percent = "Enter a GST percent between 0 and 99.99.";
  }

  if (values.hsn_code) {
    checkLengthLimit(errors, values, "hsn_code", 20, "HSN code");
  }

  if (values.storage_condition) {
    checkLengthLimit(errors, values, "storage_condition", 100, "Storage condition");
  }

  if (values.description) {
    checkLengthLimit(errors, values, "description", 1000, "Description");
  }

  if (values.side_effects) {
    checkLengthLimit(errors, values, "side_effects", 1000, "Side effects");
  }

  if (values.dosage_information) {
    checkLengthLimit(errors, values, "dosage_information", 1000, "Dosage information");
  }

  if (values.image_url) {
    try {
      const parsedUrl = new URL(values.image_url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.image_url = "Address must start with http:// or https://.";
      }
    } catch (urlError) {
      errors.image_url = "Enter a valid web address.";
    }
    checkLengthLimit(errors, values, "image_url", 200, "Image URL");
  }

  return errors;
}

export function validateBatchForm(values) {
  const errors = {};

  if (!values.batch_no) {
    errors.batch_no = "Enter a batch number.";
  }
  checkLengthLimit(errors, values, "batch_no", 100, "Batch number");

  if (values.quantity === "" || !/^\d+$/.test(values.quantity)) {
    errors.quantity = "Enter a valid whole number (e.g. 0, 10, 100).";
  }

  const today = getTodayIsoString();
  if (values.mfg_date && values.mfg_date > today) {
    errors.mfg_date = "Manufacture date cannot be in the future.";
  }

  if (!values.expiry_date) {
    errors.expiry_date = "Enter an expiry date.";
  } else if (values.expiry_date <= today) {
    errors.expiry_date = "Expiry date must be in the future.";
  } else if (values.mfg_date && values.expiry_date <= values.mfg_date) {
    errors.expiry_date = "Expiry date must be after the manufacture date.";
  }

  if (values.mrp && (!MONEY.test(values.mrp) || Number(values.mrp) < 0)) {
    errors.mrp = "Enter a valid MRP (e.g. 50 or 49.99).";
  }
  if (values.purchase_price && (!MONEY.test(values.purchase_price) || Number(values.purchase_price) < 0)) {
    errors.purchase_price = "Enter a valid purchase price.";
  }
  if (values.purchase_price && values.mrp && Number(values.purchase_price) > Number(values.mrp)) {
    errors.purchase_price = "Purchase price cannot be more than MRP.";
  }

  if (
    values.discount_percent &&
    (!PERCENT.test(values.discount_percent) || Number(values.discount_percent) < 0 || Number(values.discount_percent) > 100)
  ) {
    errors.discount_percent = "Enter a percentage value from 0 to 100.";
  }

  if (values.supplier_id && !/^[1-9]\d*$/.test(values.supplier_id)) {
    errors.supplier_id = "Enter a valid supplier ID.";
  }
  checkLengthLimit(errors, values, "rack_location", 100, "Rack location");

  return errors;
}

function buildBatchPayload(values) {
  return {
    batch_no: values.batch_no,
    quantity: Number(values.quantity),
    mfg_date: values.mfg_date || null,
    expiry_date: values.expiry_date,
    purchase_price: values.purchase_price !== "" && values.purchase_price != null ? Number(values.purchase_price) : null,
    mrp: values.mrp !== "" && values.mrp != null ? Number(values.mrp) : null,
    discount_percent: values.discount_percent !== "" && values.discount_percent != null ? Number(values.discount_percent) : 0,
    supplier_id: values.supplier_id && Number(values.supplier_id) > 0 ? Number(values.supplier_id) : null,
    rack_location: values.rack_location || null,
  };
}

function batchToValues(batch) {
  if (!batch) return {};
  return {
    batch_no: batch.batch_no ?? "",
    quantity: String(batch.quantity ?? ""),
    mfg_date: batch.mfg_date ? String(batch.mfg_date).slice(0, 10) : "",
    expiry_date: batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : "",
    purchase_price: batch.purchase_price != null ? String(batch.purchase_price) : "",
    mrp: batch.mrp != null ? String(batch.mrp) : "",
    discount_percent: batch.discount_percent != null ? String(batch.discount_percent) : "0",
    supplier_id: batch.supplier_id != null ? String(batch.supplier_id) : "",
    rack_location: batch.rack_location ?? "",
  };
}

// ===================== LOOKUPS & SALTS =====================

function createOptionWithValue(value) {
  const option = document.createElement("option");
  option.value = value;
  return option;
}

function populateSelectDropdown(selectElement, items, label, placeholder = `Select ${label}`) {
  if (!selectElement) return;
  selectElement.replaceChildren(
    new Option(placeholder, ""),
    ...items.map(function toOption(item) {
      return new Option(item.name, String(item.id));
    })
  );
}

function findSaltByName(name) {
  const cleanName = String(name || "").trim().toLowerCase();
  return lookups.salts.find(function match(salt) {
    return salt.name.toLowerCase() === cleanName;
  });
}

function refreshSaltDatalist() {
  const saltOptionsEl = document.getElementById("salt-options");
  if (saltOptionsEl) {
    saltOptionsEl.replaceChildren(
      ...lookups.salts.map(function mapSalt(salt) {
        return createOptionWithValue(salt.name);
      })
    );
  }
}

function updateStrengthSuggestions(saltRow) {
  const saltNameInput = saltRow.querySelector('[data-f="salt-name"]');
  const strengthDatalist = saltRow.querySelector('[data-f="strength-options"]');
  if (!saltNameInput || !strengthDatalist) return;

  const matchedSalt = findSaltByName(saltNameInput.value);
  const usedStrengths = (matchedSalt && lookups.strengths.get(matchedSalt.id)) || [];
  strengthDatalist.replaceChildren(...usedStrengths.map(createOptionWithValue));
}

export function addSaltRow(salt = { name: "", strength: "" }) {
  const saltListEl = document.getElementById("salt-list");
  if (!saltListEl) return;

  const { row, cell } = cloneRow("salt-row");
  const nameInput = cell("salt-name");
  const strengthInput = cell("salt-strength");
  const strengthDatalist = cell("strength-options");

  if (nameInput) nameInput.value = salt.name ?? "";
  if (strengthInput) strengthInput.value = salt.strength ?? "";

  const listId = `strengths-${++saltRowSeq}`;
  if (strengthDatalist) strengthDatalist.id = listId;
  if (strengthInput) strengthInput.setAttribute("list", listId);

  saltListEl.append(row);
  updateStrengthSuggestions(row);
}

export function readSalts() {
  const saltListEl = document.getElementById("salt-list");
  let errorMessage = "";
  const salts = [];
  const seenSaltIds = new Set();

  if (!saltListEl) {
    return { salts, error: errorMessage };
  }

  saltListEl.querySelectorAll(".salt-row").forEach(function processRow(row) {
    const nameInput = row.querySelector('[data-f="salt-name"]');
    const strengthInput = row.querySelector('[data-f="salt-strength"]');
    const name = nameInput ? nameInput.value.trim() : "";
    const strength = strengthInput ? strengthInput.value.trim() : "";

    if (!name && !strength) return;

    if (!name) {
      if (!errorMessage) errorMessage = "Every salt needs a name.";
      if (nameInput) nameInput.classList.add("invalid");
      return;
    }

    const salt = findSaltByName(name);
    if (!salt || !salt.id || String(salt.id).startsWith("temp_") || isNaN(Number(salt.id))) {
      if (!errorMessage) {
        errorMessage = `"${name}" is not registered in the database. Please pick an existing salt or click + to add it.`;
      }
      if (nameInput) nameInput.classList.add("invalid");
      return;
    }

    const saltId = Number(salt.id);
    if (!Number.isInteger(saltId) || saltId <= 0) {
      if (!errorMessage) errorMessage = `Invalid salt ID for "${name}".`;
      if (nameInput) nameInput.classList.add("invalid");
      return;
    }

    if (strength.length > 100) {
      if (!errorMessage) errorMessage = "Salt strength can be at most 100 characters.";
      if (strengthInput) strengthInput.classList.add("invalid");
    }

    if (seenSaltIds.has(saltId)) {
      if (!errorMessage) errorMessage = "The same salt is added more than once.";
      if (nameInput) nameInput.classList.add("invalid");
    }

    seenSaltIds.add(saltId);
    salts.push({ salt_id: saltId, strength });
  });

  if (salts.length === 0 && !errorMessage) {
    errorMessage = "Add at least one salt.";
  }

  return { salts, error: errorMessage };
}

export async function loadLookups(force = false) {
  if (
    !force &&
    lookups.categories.length > 0 &&
    lookups.salts.length > 0
  ) {
    return;
  }
  const [cats, brands, suppliers, salts, strengths] = await Promise.allSettled([
    request("GET", DASHBOARD_PATHS.categories, { allowArray: true }),
    request("GET", DASHBOARD_PATHS.brands, { allowArray: true }),
    request("GET", DASHBOARD_PATHS.suppliers, { allowArray: true }),
    request("GET", DASHBOARD_PATHS.salts, { allowArray: true }),
    request("GET", DASHBOARD_PATHS.saltStrengths),
  ]);

  for (const result of [cats, brands, suppliers, salts]) {
    if (result.status === "rejected") {
      throw result.reason;
    }
  }

  lookups.categories = normalizeLookupList(cats);
  lookups.brands = normalizeLookupList(brands);
  lookups.suppliers = normalizeLookupList(suppliers);
  lookups.salts = normalizeLookupList(salts);

  const strengthItems = strengths.status === "fulfilled" && Array.isArray(strengths.value.items)
    ? strengths.value.items
    : [];

  lookups.strengths = new Map(
    strengthItems.map(function mapStrength(item) {
      return [item.salt_id, item.strengths || []];
    })
  );
}

export async function loadSuppliers(force = false) {
  if (!force && lookups.suppliers.length > 0) {
    return;
  }
  const supplierResult = await request("GET", DASHBOARD_PATHS.suppliers, { allowArray: true });
  lookups.suppliers = normalizeLookupList({ value: supplierResult });
}

// ===================== DYNAMIC LOOKUP DIALOG =====================

export function askNewItem(kind, prefill = "") {
  catalogKind = kind;
  catalogResult = null;

  const catalogDialog = document.getElementById("catalog-dialog");
  const catalogForm = document.getElementById("catalog-form");
  const catalogName = document.getElementById("catalog-name");
  const catalogTitle = document.getElementById("catalog-title");
  const catalogExtra = document.getElementById("catalog-extra");
  const catalogPhone = document.getElementById("catalog-phone");
  const catalogGstin = document.getElementById("catalog-gstin");
  const catalogMsg = document.getElementById("catalog-message");

  if (!catalogDialog || !catalogForm || !catalogName) {
    return Promise.resolve(null);
  }

  if (catalogTitle) catalogTitle.textContent = `New ${LOOKUP_LABELS[kind] || kind}`;
  catalogName.value = prefill;

  if (catalogExtra) catalogExtra.hidden = kind !== "suppliers";
  if (catalogPhone) catalogPhone.value = "";
  if (catalogGstin) catalogGstin.value = "";

  clearFormErrors(catalogForm);
  setDialogMessage(catalogMsg, "");

  if (typeof catalogDialog.showModal === "function") {
    catalogDialog.showModal();
    catalogName.focus();
  }

  return new Promise(function awaitDialogClose(resolve) {
    catalogDialog.addEventListener(
      "close",
      function handleClose() {
        resolve(catalogResult);
      },
      { once: true }
    );
  });
}

// ===================== TABLE RENDERING (PRODUCTS & BATCHES) =====================

export function renderProductRow(product) {
  const { row, cell } = cloneRow("product-row");
  row.dataset.id = String(product.id);

  const nameCell = cell("name");
  if (nameCell) nameCell.textContent = product.name;

  const subCell = cell("sub");
  if (subCell) {
    subCell.textContent = [product.form, product.strength, product.pack_size].filter(Boolean).join(" \u00b7 ");
  }

  const img = cell("img");
  if (img && /^https?:\/\//i.test(product.image_url || "")) {
    img.addEventListener(
      "load",
      function onImgLoad() {
        img.classList.add("loaded");
      },
      { once: true }
    );
    img.addEventListener(
      "error",
      function onImgError() {
        img.removeAttribute("src");
      },
      { once: true }
    );
    img.src = product.image_url;
  }

  const categoryCell = cell("category");
  if (categoryCell) categoryCell.textContent = product.category || "";

  const stockCell = cell("stock");
  if (stockCell) stockCell.textContent = formatNumber(toNumber(product.total_stock));

  setStatusBadge(cell("status"), product.is_active ? "active" : "inactive");

  const batchCount = Array.isArray(product.batches) ? product.batches.length : 0;
  const batchLabel = cell("batch-label");
  if (batchLabel) batchLabel.textContent = `Batches (${batchCount})`;

  const toggleBatchesBtn = row.querySelector('[data-action="toggle-batches"]');
  if (toggleBatchesBtn) {
    toggleBatchesBtn.setAttribute("aria-expanded", String(expanded.has(product.id)));
  }

  return row;
}

export function renderBatchRow(batch) {
  const { row, cell } = cloneRow("batch-row");
  row.dataset.batchId = String(batch.id);

  const batchNoCell = cell("batch_no");
  if (batchNoCell) batchNoCell.textContent = batch.batch_no;

  const expiryCell = cell("expiry");
  if (expiryCell) {
    expiryCell.textContent = formatDateOnly(batch.expiry_date);
    const leftDays = calculateDaysLeft(batch.expiry_date);
    if (leftDays <= 90) {
      const tag = document.createElement("span");
      tag.className = `tag ${leftDays < 0 ? "tag-expired" : "tag-soon"}`;
      tag.textContent = leftDays < 0 ? "Expired" : `${leftDays}d left`;
      expiryCell.append(tag);
    }
  }

  const qtyCell = cell("quantity");
  if (qtyCell) qtyCell.textContent = formatNumber(toNumber(batch.quantity));

  const mrpCell = cell("mrp");
  if (mrpCell) {
    mrpCell.textContent = batch.mrp == null ? "â€“" : formatPrice(toNumber(batch.mrp)) || `â‚¹${batch.mrp}`;
  }

  const discountCell = cell("discount");
  if (discountCell) discountCell.textContent = `${toNumber(batch.discount_percent)}%`;

  return row;
}

export function renderBatchPanel(product) {
  const { row, cell } = cloneRow("batch-panel");
  const batches = Array.isArray(product.batches) ? product.batches : [];
  row.dataset.productId = String(product.id);

  const batchBody = cell("batch-body");
  if (batchBody) {
    batchBody.replaceChildren(...batches.map(renderBatchRow));
  }

  const batchEmpty = cell("batch-empty");
  if (batchEmpty) {
    batchEmpty.hidden = batches.length > 0;
  }

  return row;
}

export async function loadProducts() {
  const currentSeq = ++productState.seq;
  const body = document.getElementById("product-body");
  const emptyEl = document.getElementById("product-empty");
  const pager = {
    prev: document.getElementById("page-prev"),
    next: document.getElementById("page-next"),
    info: document.getElementById("page-info"),
  };

  if (!body) return;
  renderTableMessage(body, 5, "Loading...");
  if (emptyEl) emptyEl.hidden = true;

  try {
    const data = await request("GET", DASHBOARD_PATHS.products, {
      params: {
        search: productState.search,
        page: productState.page,
        page_size: DASHBOARD_CONFIG.PAGE_SIZE,
      },
    });

    if (currentSeq !== productState.seq) {
      return;
    }

    const items = Array.isArray(data.items) ? data.items : [];
    productCache.clear();
    for (const item of items) {
      productCache.set(item.id, item);
    }

    const rows = [];
    for (const item of items) {
      rows.push(renderProductRow(item));
      if (expanded.has(item.id)) {
        rows.push(renderBatchPanel(item));
      }
    }
    body.replaceChildren(...rows);

    if (emptyEl) {
      emptyEl.hidden = items.length > 0;
    }
    updatePager(pager, productState.page, DASHBOARD_CONFIG.PAGE_SIZE, toNumber(data.total));
  } catch (error) {
    if (currentSeq === productState.seq && !error.redirecting) {
      renderTableMessage(body, 5, `Could not load products. ${error.message}`);
    }
  }
}

// ===================== OVERVIEW ALERTS (LOW STOCK & EXPIRY) =====================

export function renderLowStockRow(alertItem) {
  const { row, cell } = cloneRow("lowstock-row");
  row.dataset.name = alertItem.name;

  const nameBtn = cell("name");
  if (nameBtn) nameBtn.textContent = alertItem.name;

  const formCell = cell("form");
  if (formCell) formCell.textContent = alertItem.form || "";

  const stockCell = cell("stock");
  if (stockCell) {
    const currentStock = toNumber(alertItem.current_stock);
    stockCell.textContent = formatNumber(currentStock);
    if (currentStock === 0) {
      stockCell.classList.add("text-danger");
    }
  }

  const thresholdCell = cell("threshold");
  if (thresholdCell) thresholdCell.textContent = formatNumber(toNumber(alertItem.alert_threshold));

  return row;
}

export async function loadLowStock() {
  const body = document.getElementById("lowstock-body");
  const emptyEl = document.getElementById("lowstock-empty");
  const countEl = document.getElementById("lowstock-count");
  if (!body) return;

  try {
    const data = await request("GET", DASHBOARD_PATHS.stockAlerts, { allowArray: true });
    const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);

    body.replaceChildren(...items.map(renderLowStockRow));
    if (emptyEl) emptyEl.hidden = items.length > 0;
    if (countEl) {
      countEl.textContent = items.length
        ? `${formatNumber(items.length)} ${items.length === 1 ? "product" : "products"}`
        : "";
    }
  } catch (error) {
    if (countEl) countEl.textContent = "";
    if (!error.redirecting) {
      renderTableMessage(body, 3, `Could not load stock alerts. ${error.message}`);
    }
  }
}

function getExpiryTagInfo(batch) {
  const days = toNumber(batch.days_left);
  const text = days < 0 ? `${-days}d ago` : (days === 0 ? "Today" : `${days}d left`);
  const validKinds = ["expired", "critical", "warning", "soon"];
  const kind = validKinds.includes(batch.status) ? batch.status : "soon";
  return { text, className: `tag tag-${kind}` };
}

export function renderExpiryRow(batch) {
  const { row, cell } = cloneRow("expiry-row");
  row.dataset.name = batch.name;

  const nameBtn = cell("name");
  if (nameBtn) nameBtn.textContent = batch.name;

  const batchCell = cell("batch");
  if (batchCell) batchCell.textContent = `Batch ${batch.batch_no}`;

  const dateCell = cell("date");
  if (dateCell) dateCell.textContent = formatDateOnly(batch.expiry_date);

  const tagCell = cell("tag");
  if (tagCell) {
    const tagInfo = getExpiryTagInfo(batch);
    tagCell.textContent = tagInfo.text;
    tagCell.className = tagInfo.className;
  }

  const qtyCell = cell("quantity");
  if (qtyCell) qtyCell.textContent = formatNumber(toNumber(batch.quantity));

  return row;
}

export async function loadExpiry(kind) {
  const card = expiryCards[kind];
  if (!card) return;

  const currentSeq = ++card.seq;
  const body = document.getElementById(`${kind}-body`);
  const emptyEl = document.getElementById(`${kind}-empty`);
  const countEl = document.getElementById(`${kind}-count`);
  const pager = {
    prev: document.getElementById(`${kind}-prev`),
    next: document.getElementById(`${kind}-next`),
    info: document.getElementById(`${kind}-page-info`),
  };

  if (!body) return;

  try {
    const data = await request("GET", card.path, {
      params: { ...card.params, page: card.page, page_size: DASHBOARD_CONFIG.ALERT_PAGE_SIZE },
    });

    if (currentSeq !== card.seq) return;

    const items = Array.isArray(data.items) ? data.items : [];
    const total = toNumber(data.total);

    if (card.page > 1 && items.length === 0 && total > 0) {
      card.page = Math.max(1, Math.ceil(total / DASHBOARD_CONFIG.ALERT_PAGE_SIZE));
      await loadExpiry(kind);
      return;
    }

    body.replaceChildren(...items.map(renderExpiryRow));
    if (emptyEl) emptyEl.hidden = items.length > 0;
    if (countEl) {
      countEl.textContent = total
        ? `${formatNumber(total)} ${total === 1 ? "batch" : "batches"}`
        : "";
    }
    updatePager(pager, card.page, DASHBOARD_CONFIG.ALERT_PAGE_SIZE, total);
  } catch (error) {
    if (currentSeq === card.seq && !error.redirecting) {
      if (countEl) countEl.textContent = "";
      renderTableMessage(body, 3, `Could not load ${kind} batches. ${error.message}`);
    }
  }
}

export function loadAlerts() {
  loadLowStock();
  loadExpiry("expiring");
  loadExpiry("expired");
}

// ===================== PRODUCT DIALOG (ADD & EDIT) =====================

export async function openProductDialog(mode, product = null) {
  productDialogState = { mode, id: product ? product.id : null, original: product };

  const dialog = document.getElementById("product-dialog");
  const form = document.getElementById("product-form");
  const title = document.getElementById("product-dialog-title");
  const message = document.getElementById("product-message");
  const saveBtn = document.getElementById("product-save");
  const batchFieldset = document.getElementById("batch-fieldset");
  const batchLegend = document.getElementById("batch-legend");

  if (!dialog || !form) return;

  title.textContent = mode === "add" ? "Add product" : "Edit product";
  if (saveBtn) saveBtn.textContent = mode === "add" ? "Add product" : "Save changes";

  clearFormErrors(form);
  setDialogMessage(message, "");
  form.reset();
  hideCatalogSuggestions();

  const saltListEl = document.getElementById("salt-list");
  if (saltListEl) saltListEl.replaceChildren();

  const isAddMode = mode === "add";
  if (batchFieldset) {
    batchFieldset.hidden = !isAddMode;
    batchFieldset.disabled = !isAddMode;
  }
  if (batchLegend) {
    batchLegend.textContent = "Initial batch";
  }

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }

  function fillProductForm() {
    populateSelectDropdown(form.elements["category_id"], lookups.categories, LOOKUP_LABELS.categories);
    populateSelectDropdown(form.elements["brand_id"], lookups.brands, LOOKUP_LABELS.brands, NO_CHOICE_LABELS.brands);
    populateSelectDropdown(form.elements["supplier_id"], lookups.suppliers, LOOKUP_LABELS.suppliers, NO_CHOICE_LABELS.suppliers);
    refreshSaltDatalist();

    if (mode === "edit" && product) {
      const fields = [
        "name", "category_id", "brand_id", "form", "hsn_code",
        "pack_size", "storage_condition", "schedule", "gst_percent", "description",
        "side_effects", "dosage_information", "image_url",
      ];
      for (const field of fields) {
        if (form.elements[field]) {
          form.elements[field].value = product[field] != null ? String(product[field]) : "";
        }
      }

      // Name-based fallback matching if IDs are not present
      if (form.elements["category_id"] && !form.elements["category_id"].value && product.category) {
        const match = lookups.categories.find(c => c.name.toLowerCase() === String(product.category).toLowerCase());
        if (match) form.elements["category_id"].value = String(match.id);
      }
      if (form.elements["brand_id"] && !form.elements["brand_id"].value && product.brand) {
        const match = lookups.brands.find(b => b.name.toLowerCase() === String(product.brand).toLowerCase());
        if (match) form.elements["brand_id"].value = String(match.id);
      }

      if (form.elements["is_active"]) {
        form.elements["is_active"].checked = Boolean(product.is_active);
      }

      if (saltListEl) saltListEl.replaceChildren();
      const salts = Array.isArray(product.salts) && product.salts.length ? product.salts : [{ name: "", strength: "" }];
      salts.forEach(addSaltRow);
    } else {
      if (form.elements["is_active"]) form.elements["is_active"].checked = true;
      if (form.elements["form"]) form.elements["form"].value = "Tablet";
      if (form.elements["storage_condition"]) form.elements["storage_condition"].value = "Store in a cool, dry place";
      if (form.elements["schedule"]) form.elements["schedule"].value = "OTC";
      if (form.elements["gst_percent"]) form.elements["gst_percent"].value = "12";
      if (saltListEl) saltListEl.replaceChildren();
      addSaltRow();
    }
  }

  // Pre-fill immediately if lookups are already loaded in frontend memory
  if (lookups.categories.length > 0) {
    fillProductForm();
  } else {
    try {
      await loadLookups();
      fillProductForm();
    } catch (error) {
      if (!error.redirecting) {
        setDialogMessage(message, `Could not load form options. ${error.message}`);
      }
    }
  }
}

export async function editProduct(productId) {
  const cachedProduct = productCache.get(productId);
  if (!cachedProduct) {
    showToast("Product details not available.");
    return;
  }
  openProductDialog("edit", cachedProduct);
}

export async function deleteProduct(productId) {
  const cachedProduct = productCache.get(productId);
  const productName = cachedProduct ? cachedProduct.name : "";

  const confirmed = await confirmAction({
    title: `Delete ${productName}?`,
    text: "This removes the product, its batches, and inventory records. Existing completed orders will not be lost.",
    confirmLabel: "Delete product",
  });

  if (!confirmed) return;

  try {
    await request("DELETE", `${DASHBOARD_PATHS.productsWrite}/${productId}`);
    showToast("Product deleted");
    await Promise.allSettled([loadProducts(), loadDashboardStats()]);
  } catch (error) {
    if (!error.redirecting) {
      showToast(error.message || "Failed to delete product.");
    }
  }
}

// ===================== BATCH DIALOG (ADD & EDIT) =====================

export async function openBatchDialog(mode, productId, batch = null) {
  const dialog = document.getElementById("batch-dialog");
  const form = document.getElementById("batch-form");
  const title = document.getElementById("batch-dialog-title");
  const message = document.getElementById("batch-message");
  const saveBtn = document.getElementById("batch-save");

  if (!dialog || !form) return;

  dialog.dataset.mode = mode;
  dialog.dataset.productId = String(productId);
  dialog.dataset.batchId = batch ? String(batch.id) : "";

  title.textContent = mode === "add" ? "Add batch" : `Edit batch ${batch.batch_no}`;
  if (saveBtn) saveBtn.textContent = mode === "add" ? "Add batch" : "Save changes";

  clearFormErrors(form);
  setDialogMessage(message, "");
  form.reset();
  hideCatalogSuggestions();

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }

  // Pre-fill directly from frontend cached batch data (no network request needed!)
  if (mode === "edit" && batch) {
    const batchValues = batchToValues(batch);
    for (const [key, value] of Object.entries(batchValues)) {
      if (form.elements[key]) {
        form.elements[key].value = value;
      }
    }
  }

  const supplierSelect = document.getElementById("bd-supplier");
  if (lookups.suppliers.length > 0) {
    populateSelectDropdown(supplierSelect, lookups.suppliers, LOOKUP_LABELS.suppliers, NO_CHOICE_LABELS.suppliers);
    if (mode === "edit" && batch && batch.supplier_id != null && form.elements["supplier_id"]) {
      form.elements["supplier_id"].value = String(batch.supplier_id);
    }
  } else {
    try {
      await loadSuppliers();
      populateSelectDropdown(supplierSelect, lookups.suppliers, LOOKUP_LABELS.suppliers, NO_CHOICE_LABELS.suppliers);
      if (mode === "edit" && batch && batch.supplier_id != null && form.elements["supplier_id"]) {
        form.elements["supplier_id"].value = String(batch.supplier_id);
      }
    } catch (error) {
      if (!error.redirecting) {
        setDialogMessage(message, `Could not load suppliers. ${error.message}`);
      }
    }
  }
}

export async function deleteBatch(productId, batchId) {
  const product = productCache.get(productId);
  const batches = product && Array.isArray(product.batches) ? product.batches : [];
  const batch = batches.find(function matchBatch(item) {
    return item.id === batchId;
  });

  const confirmed = await confirmAction({
    title: `Delete batch ${batch ? batch.batch_no : ""}?`,
    text: "Its stock is removed from the shop. A batch that was already sold in an order cannot be deleted; set its quantity to 0 instead.",
    confirmLabel: "Delete",
  });

  if (!confirmed) return;

  try {
    await request("DELETE", `${DASHBOARD_PATHS.batches}/${batchId}`);
    showToast("Batch deleted");
    await Promise.allSettled([loadProducts(), loadDashboardStats()]);
  } catch (error) {
    if (!error.redirecting) {
      showToast(error.message || "Failed to delete batch.");
    }
  }
}

// ===================== CATALOG AUTOCOMPLETE & PRE-FILL =====================
const catalogCache = new Map();
let catalogDebounceTimer = null;
let catalogAbortController = null;

export function hideCatalogSuggestions() {
  const suggestionsEl = document.getElementById("p-name-suggestions");
  if (suggestionsEl) {
    suggestionsEl.hidden = true;
    suggestionsEl.replaceChildren();
  }
}

export async function applyCatalogSuggestion(item) {
  const form = document.getElementById("product-form");
  if (!form || !item) return;

  // Fill text and select fields
  if (form.elements["name"]) form.elements["name"].value = item.name || "";
  if (item.form && form.elements["form"]) {
    const cleanForm = String(item.form).trim().toLowerCase();
    const matchOption = Array.from(form.elements["form"].options).find(
      (opt) => opt.value.toLowerCase() === cleanForm || opt.value.toLowerCase() === cleanForm.replace(/s$/, "")
    );
    if (matchOption) {
      form.elements["form"].value = matchOption.value;
    } else {
      form.elements["form"].value = item.form;
    }
  }
  if (item.pack_size && form.elements["pack_size"]) form.elements["pack_size"].value = item.pack_size;
  if (item.image_url && form.elements["image_url"]) form.elements["image_url"].value = item.image_url;
  if (form.elements["description"]) {
    form.elements["description"].value = item.uses || item.description || "";
  }
  if (form.elements["side_effects"]) {
    form.elements["side_effects"].value = item.side_effects || "";
  }
  if (form.elements["dosage_information"]) {
    form.elements["dosage_information"].value = item.dosage_information || "";
  }
  if (form.elements["storage_condition"]) {
    form.elements["storage_condition"].value = item.storage_condition || "Store in a cool, dry place";
  }

  // Match Brand from lookups
  if (form.elements["brand_id"]) {
    if (item.brand) {
      const cleanBrand = String(item.brand).trim();
      let match = lookups.brands.find(
        (b) => b.name.toLowerCase() === cleanBrand.toLowerCase()
      );
      if (!match && cleanBrand) {
        try {
          const res = await request("POST", DASHBOARD_PATHS.brands, { body: { name: cleanBrand } });
          if (res && res.id) {
            match = res;
            lookups.brands.push(res);
            lookups.brands.sort(sortByName);
            form.elements["brand_id"].append(new Option(res.name, String(res.id)));
          }
        } catch {
          match = lookups.brands.find(
            (b) => b.name.toLowerCase() === cleanBrand.toLowerCase()
          );
        }
      }
      if (match) {
        form.elements["brand_id"].value = String(match.id);
      } else {
        form.elements["brand_id"].value = "";
      }
    } else {
      form.elements["brand_id"].value = "";
    }
    setFieldError(form.elements["brand_id"], "");
  }

  // Pre-fill Salts
  const saltListEl = document.getElementById("salt-list");
  if (saltListEl) {
    saltListEl.replaceChildren();
    const rawSalts = Array.isArray(item.salts) ? item.salts : (item.salts ? [item.salts] : []);
    if (rawSalts.length > 0) {
      for (const s of rawSalts) {
        let saltName = "";
        let saltStrength = "";
        if (typeof s === "string") {
          const m = s.match(/^([^(]+)(?:\((.*)\))?$/);
          saltName = m ? m[1].trim() : s.trim();
          saltStrength = m && m[2] ? m[2].trim() : "";
        } else if (s && typeof s === "object") {
          saltName = (s.name || s.salt || s.salt_name || "").toString().trim();
          saltStrength = (s.strength || "").toString().trim();
        }
        if (saltName) {
          let salt = findSaltByName(saltName);
          if (!salt) {
            try {
              const res = await request("POST", DASHBOARD_PATHS.salts, { body: { name: saltName } });
              if (res && res.id) {
                salt = res;
                lookups.salts.push(res);
                lookups.salts.sort(sortByName);
                refreshSaltDatalist();
              }
            } catch {
              salt = findSaltByName(saltName);
            }
          }
          addSaltRow({ name: saltName, strength: saltStrength });
        }
      }
    } else {
      addSaltRow();
    }
  }

  // Clear any existing errors for auto-filled fields
  clearFormErrors(form);
  hideCatalogSuggestions();
}

function renderCatalogSuggestions(items, suggestionsEl) {
  if (!suggestionsEl) return;
  if (!Array.isArray(items) || items.length === 0) {
    suggestionsEl.hidden = true;
    suggestionsEl.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "catalog-suggestion-item";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");

    // Line 1: Name and Form badge
    const nameRow = document.createElement("div");
    nameRow.className = "catalog-suggestion-name-row";

    const nameEl = document.createElement("span");
    nameEl.className = "catalog-suggestion-name";
    nameEl.textContent = item.name;
    nameRow.append(nameEl);

    if (item.form) {
      const badge = document.createElement("span");
      badge.className = "catalog-suggestion-badge";
      badge.textContent = item.form;
      nameRow.append(badge);
    }
    row.append(nameRow);

    // Line 2: Salts / Composition
    let saltsText = "";
    if (Array.isArray(item.salts) && item.salts.length > 0) {
      saltsText = item.salts
        .map((s) => {
          if (typeof s === "string") return s;
          const n = s.name || s.salt || s.salt_name || "";
          const str = s.strength ? ` ${s.strength}` : "";
          return `${n}${str}`.trim();
        })
        .filter(Boolean)
        .join(" + ");
    } else if (typeof item.salts === "string") {
      saltsText = item.salts;
    }

    if (saltsText) {
      const saltsEl = document.createElement("div");
      saltsEl.className = "catalog-suggestion-salts";

      const icon = document.createElement("i");
      icon.className = "fa-solid fa-flask";
      icon.setAttribute("aria-hidden", "true");

      const textSpan = document.createElement("span");
      textSpan.textContent = saltsText;

      saltsEl.append(icon, textSpan);
      row.append(saltsEl);
    }

    // Line 3: Brand & Pack size
    const metaEl = document.createElement("div");
    metaEl.className = "catalog-suggestion-meta";

    if (item.brand) {
      const brandSpan = document.createElement("span");
      const brandIcon = document.createElement("i");
      brandIcon.className = "fa-solid fa-tag";
      brandIcon.setAttribute("aria-hidden", "true");
      brandSpan.append(brandIcon, document.createTextNode(` Brand: ${item.brand}`));
      metaEl.append(brandSpan);
    }

    if (item.pack_size) {
      const packSpan = document.createElement("span");
      packSpan.textContent = `· ${item.pack_size}`;
      metaEl.append(packSpan);
    }

    if (metaEl.childNodes.length > 0) {
      row.append(metaEl);
    }

    row.addEventListener("mousedown", (e) => {
      e.preventDefault(); // Prevent input blur before click finishes
      applyCatalogSuggestion(item);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        applyCatalogSuggestion(item);
      }
    });

    fragment.append(row);
  }

  suggestionsEl.replaceChildren(fragment);
  suggestionsEl.hidden = false;
}

export function setupCatalogAutocomplete() {
  const nameInput = document.getElementById("p-name");
  const suggestionsEl = document.getElementById("p-name-suggestions");
  if (!nameInput || !suggestionsEl) return;

  nameInput.addEventListener("input", function handleNameInput(event) {
    // Only provide live suggestions in 'add' mode
    if (productDialogState.mode !== "add") {
      hideCatalogSuggestions();
      return;
    }

    const query = event.target.value.trim();
    clearTimeout(catalogDebounceTimer);

    if (query.length < 2) {
      hideCatalogSuggestions();
      return;
    }

    const lowerQuery = query.toLowerCase();
    if (catalogCache.has(lowerQuery)) {
      renderCatalogSuggestions(catalogCache.get(lowerQuery), suggestionsEl);
      return;
    }

    catalogDebounceTimer = setTimeout(async function executeCatalogSearch() {
      if (catalogAbortController) {
        catalogAbortController.abort();
      }
      catalogAbortController = new AbortController();

      try {
        const path = `${DASHBOARD_PATHS.catalogSuggest}/${encodeURIComponent(query)}`;
        const items = await request("GET", path, {
          signal: catalogAbortController.signal,
          allowArray: true,
        });
        catalogCache.set(lowerQuery, items || []);
        renderCatalogSuggestions(items || [], suggestionsEl);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch catalog suggestions:", err);
        }
      }
    }, 300);
  });

  nameInput.addEventListener("keydown", function handleNameKeydown(event) {
    if (event.key === "Escape") {
      hideCatalogSuggestions();
    }
  });

  document.addEventListener("click", function handleOutsideClick(event) {
    if (!nameInput.contains(event.target) && !suggestionsEl.contains(event.target)) {
      hideCatalogSuggestions();
    }
  });
}

// ===================== INITIALIZE PRODUCTS FEATURE =====================

export function initProducts() {
  // Pre-load lookups into frontend memory on initialization so edit/add open instantly
  loadLookups().catch(() => {});
  setupCatalogAutocomplete();

  const addProductBtn = document.getElementById("add-product-btn");
  if (addProductBtn) {
    addProductBtn.addEventListener("click", function handleAddProduct() {
      openProductDialog("add");
    });
  }

  const addSaltBtn = document.getElementById("add-salt-btn");
  if (addSaltBtn) {
    addSaltBtn.addEventListener("click", function handleAddSalt() {
      addSaltRow();
    });
  }

  // Salt row delegation (+ and remove)
  const saltListEl = document.getElementById("salt-list");
  if (saltListEl) {
    saltListEl.addEventListener("click", function handleSaltRowClick(event) {
      const removeBtn = event.target.closest('[data-action="remove-salt"]');
      if (removeBtn) {
        const row = removeBtn.closest(".salt-row");
        if (row) row.remove();
      }
    });

    saltListEl.addEventListener("input", function handleSaltInput(event) {
      if (event.target.matches('[data-f="salt-name"]')) {
        const row = event.target.closest(".salt-row");
        if (row) updateStrengthSuggestions(row);
      }
    });
  }

  // Search input debounce
  const searchInput = document.getElementById("product-search");
  if (searchInput) {
    searchInput.addEventListener("input", function handleSearchInput(event) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function performSearch() {
        productState.search = event.target.value.trim();
        productState.page = 1;
        loadProducts();
      }, DASHBOARD_CONFIG.SEARCH_DELAY);
    });
  }

  // Products pagination buttons
  const prevBtn = document.getElementById("page-prev");
  if (prevBtn) {
    prevBtn.addEventListener("click", function handleProductPrev() {
      productState.page -= 1;
      loadProducts();
    });
  }

  const nextBtn = document.getElementById("page-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", function handleProductNext() {
      productState.page += 1;
      loadProducts();
    });
  }

  // Product table click handlers (batches toggle, edit, delete, add batch)
  const productBodyEl = document.getElementById("product-body");
  if (productBodyEl) {
    productBodyEl.addEventListener("click", function handleTableClick(event) {
      const actionBtn = event.target.closest("[data-action]");
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;

      const panel = actionBtn.closest(".batch-panel");
      if (panel) {
        const productId = Number(panel.dataset.productId);
        const batchRowEl = actionBtn.closest("tr");
        const batchId = batchRowEl ? Number(batchRowEl.dataset.batchId) : null;

        if (action === "add-batch") {
          openBatchDialog("add", productId);
        } else if (action === "edit-batch" && batchId) {
          const product = productCache.get(productId);
          const batch = (product?.batches || []).find(function match(b) {
            return b.id === batchId;
          });
          if (batch) openBatchDialog("edit", productId, batch);
        } else if (action === "delete-batch" && batchId) {
          deleteBatch(productId, batchId);
        }
        return;
      }

      const row = actionBtn.closest("tr");
      const productId = row ? Number(row.dataset.id) : null;
      if (!productId) return;

      if (action === "toggle-batches") {
        const isOpen = !expanded.has(productId);
        if (isOpen) {
          expanded.add(productId);
          row.after(renderBatchPanel(productCache.get(productId)));
        } else {
          expanded.delete(productId);
          if (row.nextElementSibling && row.nextElementSibling.classList.contains("batch-panel")) {
            row.nextElementSibling.remove();
          }
        }
        actionBtn.setAttribute("aria-expanded", String(isOpen));
      } else if (action === "edit") {
        editProduct(productId);
      } else if (action === "delete") {
        deleteProduct(productId);
      }
    });
  }

  // Expiry cards pagination
  for (const kind of ["expiring", "expired"]) {
    const cardPrev = document.getElementById(`${kind}-prev`);
    if (cardPrev) {
      cardPrev.addEventListener("click", function handleExpiryPrev() {
        expiryCards[kind].page -= 1;
        loadExpiry(kind);
      });
    }

    const cardNext = document.getElementById(`${kind}-next`);
    if (cardNext) {
      cardNext.addEventListener("click", function handleExpiryNext() {
        expiryCards[kind].page += 1;
        loadExpiry(kind);
      });
    }
  }

  // Handle + buttons inside product dialog and batch dialog
  async function handlePlusClick(event) {
    const plusBtn = event.target.closest("[data-new], [data-action='new-salt']");
    if (!plusBtn) return;

    if (plusBtn.dataset.new) {
      const kind = plusBtn.dataset.new;
      const select = plusBtn.closest(".select-add").querySelector("select");
      const created = await askNewItem(kind);
      if (!created) return;

      populateSelectDropdown(select, lookups[kind], LOOKUP_LABELS[kind], NO_CHOICE_LABELS[kind]);
      select.value = String(created.id);
      setFieldError(select, "");
    } else {
      const row = plusBtn.closest(".salt-row");
      const nameInput = row.querySelector('[data-f="salt-name"]');
      const created = await askNewItem("salts", nameInput ? nameInput.value.trim() : "");
      if (!created) return;

      refreshSaltDatalist();
      if (nameInput) {
        nameInput.value = created.name;
        nameInput.classList.remove("invalid");
      }
      updateStrengthSuggestions(row);
    }
  }

  const productFormEl = document.getElementById("product-form");
  if (productFormEl) {
    productFormEl.addEventListener("click", handlePlusClick);

    productFormEl.addEventListener("submit", async function handleProductSubmit(event) {
      event.preventDefault();
      const messageEl = document.getElementById("product-message");
      const saveBtn = document.getElementById("product-save");
      const dialogEl = document.getElementById("product-dialog");

      clearFormErrors(productFormEl);
      setDialogMessage(messageEl, "");

      const formData = new FormData(productFormEl);
      const productValues = {
        name: (formData.get("name") || "").toString().trim(),
        category_id: (formData.get("category_id") || "").toString(),
        brand_id: (formData.get("brand_id") || "").toString(),
        form: (formData.get("form") || "").toString().trim(),
        pack_size: (formData.get("pack_size") || "").toString().trim(),
        schedule: (formData.get("schedule") || "").toString().trim(),
        gst_percent: (formData.get("gst_percent") || "").toString().trim(),
        hsn_code: (formData.get("hsn_code") || "").toString().trim(),
        storage_condition: (formData.get("storage_condition") || "").toString().trim(),
        description: (formData.get("description") || "").toString().trim(),
        side_effects: (formData.get("side_effects") || "").toString().trim(),
        dosage_information: (formData.get("dosage_information") || "").toString().trim(),
        image_url: (formData.get("image_url") || "").toString().trim(),
      };

      const productErrors = validateProductForm(productValues);
      const { salts, error: saltError } = readSalts();

      let batchValues = null;
      let batchErrors = {};
      if (productDialogState.mode === "add") {
        batchValues = {
          batch_no: (formData.get("batch_no") || formData.get("b_no") || "").toString().trim(),
          quantity: (formData.get("quantity") || formData.get("b_qty") || "").toString().trim(),
          mfg_date: (formData.get("mfg_date") || formData.get("b_mfg") || "").toString(),
          expiry_date: (formData.get("expiry_date") || formData.get("b_exp") || "").toString(),
          purchase_price: (formData.get("purchase_price") || formData.get("b_purchase") || "").toString().trim(),
          mrp: (formData.get("mrp") || formData.get("b_mrp") || "").toString().trim(),
          discount_percent: (formData.get("discount_percent") || formData.get("b_discount") || "").toString().trim(),
          supplier_id: (formData.get("supplier_id") || formData.get("b_supplier") || "").toString(),
          rack_location: (formData.get("rack_location") || formData.get("b_rack") || "").toString().trim(),
        };
        batchErrors = validateBatchForm(batchValues);
      }

      const allErrors = { ...productErrors, ...batchErrors };
      if (Object.keys(allErrors).length > 0 || saltError) {
        applyFormErrors(productFormEl, allErrors);
        const errorText = saltError || "Please fix the highlighted fields.";
        setDialogMessage(messageEl, errorText);
        return;
      }

      const payload = {
        name: productValues.name,
        category_id: Number(productValues.category_id),
        brand_id: productValues.brand_id && Number(productValues.brand_id) > 0 ? Number(productValues.brand_id) : null,
        form: productValues.form,
        pack_size: productValues.pack_size,
        schedule: productValues.schedule,
        gst_percent: Number(productValues.gst_percent),
        hsn_code: productValues.hsn_code || null,
        storage_condition: productValues.storage_condition || null,
        description: productValues.description || null,
        side_effects: productValues.side_effects || null,
        dosage_information: productValues.dosage_information || null,
        image_url: productValues.image_url || null,
        salts,
      };

      const defaultSaveLabel = saveBtn ? saveBtn.textContent : "Save";
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
      }

      try {
        if (productDialogState.mode === "add") {
          await request("POST", DASHBOARD_PATHS.productsWrite, {
            body: { product: payload, batch: buildBatchPayload(batchValues) },
          });
          showToast("Product added");
        } else {
          await request("PUT", `${DASHBOARD_PATHS.productsWrite}/${productDialogState.id}`, {
            body: { product: payload },
          });
          showToast("Product updated");
        }

        if (dialogEl) dialogEl.close();
        await Promise.allSettled([loadProducts(), loadDashboardStats()]);
      } catch (error) {
        if (!error.redirecting) {
          setDialogMessage(messageEl, error.message || "Could not save product.");
        }
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = defaultSaveLabel;
        }
      }
    });
  }

  // Batch Form Submit
  const batchFormEl = document.getElementById("batch-form");
  if (batchFormEl) {
    batchFormEl.addEventListener("click", handlePlusClick);

    batchFormEl.addEventListener("submit", async function handleBatchSubmit(event) {
      event.preventDefault();
      const batchDialogEl = document.getElementById("batch-dialog");
      const messageEl = document.getElementById("batch-message");
      const saveBtn = document.getElementById("batch-save");

      clearFormErrors(batchFormEl);
      setDialogMessage(messageEl, "");

      const formData = new FormData(batchFormEl);
      const values = {
        batch_no: (formData.get("batch_no") || "").toString().trim(),
        quantity: (formData.get("quantity") || "").toString().trim(),
        mfg_date: (formData.get("mfg_date") || "").toString(),
        expiry_date: (formData.get("expiry_date") || "").toString(),
        purchase_price: (formData.get("purchase_price") || "").toString().trim(),
        mrp: (formData.get("mrp") || "").toString().trim(),
        discount_percent: (formData.get("discount_percent") || "").toString().trim(),
        supplier_id: (formData.get("supplier_id") || "").toString(),
        rack_location: (formData.get("rack_location") || "").toString().trim(),
      };

      const errors = validateBatchForm(values);
      if (Object.keys(errors).length > 0) {
        applyFormErrors(batchFormEl, errors);
        setDialogMessage(messageEl, "Please fix the highlighted fields.");
        return;
      }

      const mode = batchDialogEl.dataset.mode;
      const productId = Number(batchDialogEl.dataset.productId);
      const batchId = Number(batchDialogEl.dataset.batchId);
      const payload = buildBatchPayload(values);

      const defaultSaveLabel = saveBtn ? saveBtn.textContent : "Save";
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
      }

      try {
        if (mode === "add") {
          await request("POST", DASHBOARD_PATHS.batches, {
            body: { product_id: productId, ...payload },
          });
          showToast("Batch added");
        } else {
          const product = productCache.get(productId);
          const currentBatch = (product?.batches || []).find(function match(b) {
            return b.id === batchId;
          });
          const originalValues = buildBatchPayload(batchToValues(currentBatch));

          const changes = {};
          for (const [key, val] of Object.entries(payload)) {
            const isMoney = ["purchase_price", "mrp", "discount_percent"].includes(key);
            const normalizedCurrent = isMoney && val != null ? Number(val) : val;
            const normalizedOriginal = isMoney && originalValues[key] != null ? Number(originalValues[key]) : originalValues[key];
            if (normalizedCurrent !== normalizedOriginal) {
              changes[key] = val;
            }
          }

          if (Object.keys(changes).length === 0) {
            if (batchDialogEl) batchDialogEl.close();
            showToast("No changes to save");
            return;
          }

          await request("PATCH", `${DASHBOARD_PATHS.batches}/${batchId}`, { body: changes });
          showToast("Batch updated");
        }

        if (batchDialogEl) batchDialogEl.close();
        expanded.add(productId);
        await Promise.allSettled([loadProducts(), loadDashboardStats()]);
      } catch (error) {
        if (!error.redirecting) {
          setDialogMessage(messageEl, error.message || "Could not save batch.");
        }
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = defaultSaveLabel;
        }
      }
    });
  }

  // Catalog Form Submit (Categories, Brands, Suppliers, Salts)
  const catalogFormEl = document.getElementById("catalog-form");
  if (catalogFormEl) {
    catalogFormEl.addEventListener("submit", async function handleCatalogSubmit(event) {
      event.preventDefault();
      const catalogDialogEl = document.getElementById("catalog-dialog");
      const catalogNameEl = document.getElementById("catalog-name");
      const catalogMsgEl = document.getElementById("catalog-message");
      const saveBtn = document.getElementById("catalog-save");

      const name = catalogNameEl ? catalogNameEl.value.trim() : "";
      clearFormErrors(catalogFormEl);
      setDialogMessage(catalogMsgEl, "");

      if (!name) {
        setFieldError(catalogNameEl, "Enter a name.");
        return;
      }
      if (name.length > 100) {
        setFieldError(catalogNameEl, "Name can be at most 100 characters.");
        return;
      }

      const body = { name };
      if (catalogKind === "suppliers") {
        const phone = (document.getElementById("catalog-phone")?.value || "").trim();
        const gstin = (document.getElementById("catalog-gstin")?.value || "").trim().toUpperCase();
        let isInvalid = false;
        if (!/^\+?\d[\d\s-]{5,18}$/.test(phone)) {
          setFieldError(document.getElementById("catalog-phone"), "Enter a valid phone number.");
          isInvalid = true;
        }
        if (!/^[0-9A-Z]{15}$/.test(gstin)) {
          setFieldError(document.getElementById("catalog-gstin"), "GSTIN must be 15 letters and digits.");
          isInvalid = true;
        }
        if (isInvalid) return;
        body.phone = phone;
        body.gstin = gstin;
      }

      if (saveBtn) saveBtn.disabled = true;

      try {
        const created = await request("POST", DASHBOARD_PATHS[catalogKind], { body });
        lookups[catalogKind] = [...lookups[catalogKind], created].sort(sortByName);
        catalogResult = created;
        if (catalogDialogEl) catalogDialogEl.close();
      } catch (error) {
        if (error.redirecting) return;
        const clashMessage = /already exists/i.test(error.message) && catalogKind !== "suppliers"
          ? `This ${LOOKUP_LABELS[catalogKind]} already exists. Pick it from the list.`
          : error.message;
        setDialogMessage(catalogMsgEl, clashMessage);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }
}
