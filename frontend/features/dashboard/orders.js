/**
 * Dashboard Feature: Orders Controller
 * Handles admin orders list, pagination, order status transitions, recent orders overview, and order detail modal.
 */
import {
  addressText,
  formatDate,
  formatPrice,
  formatNumber,
  showToast,
  confirmAction,
  renderTableMessage,
} from "../../shared/utils.js";
import { request, DASHBOARD_PATHS, DASHBOARD_CONFIG } from "./api.js";
import { loadDashboardStats } from "./profile.js";

export const STATUS_STEPS = ["pending", "confirmed", "processing", "shipped", "delivered"];

const PAYMENT_LABELS = {
  cod: "Cash on delivery",
  pickup: "Store pickup",
};

const orderState = {
  page: 1,
  status: "",
  seq: 0,
};

let orderDetailSeq = 0;

function toNumber(value) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return number;
  }
  return 0;
}

function capitalize(text) {
  const str = String(text || "");
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
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

/**
 * Compute the allowed subsequent statuses for an order.
 */
export function nextStatuses(current) {
  const index = STATUS_STEPS.indexOf(current);
  if (index === -1 || current === "delivered") {
    return [];
  }
  return [...STATUS_STEPS.slice(index + 1), "cancelled"];
}

/**
 * Render a single row for the main orders table.
 */
export function renderOrderRow(order) {
  const { row, cell } = cloneRow("order-row");
  row.dataset.id = String(order.id);

  const idBtn = cell("id");
  if (idBtn) {
    idBtn.textContent = `#${order.id}`;
  }

  const customerCell = cell("customer");
  if (customerCell) {
    customerCell.textContent = order.customer || "";
  }

  const dateCell = cell("date");
  if (dateCell) {
    dateCell.textContent = formatDate(order.created_at);
  }

  const paymentCell = cell("payment");
  if (paymentCell) {
    paymentCell.textContent = PAYMENT_LABELS[order.payment_method] || order.payment_method || "";
  }

  const totalCell = cell("total");
  if (totalCell) {
    totalCell.textContent = formatPrice(toNumber(order.total)) || `â‚¹${toNumber(order.total)}`;
  }

  const status = String(order.status || "");
  setStatusBadge(cell("status"), status);

  const select = cell("next-status");
  if (select) {
    const options = nextStatuses(status);
    select.replaceChildren(new Option("Change...", ""));
    for (const opt of options) {
      select.append(new Option(capitalize(opt), opt));
    }
    select.disabled = options.length === 0;
  }

  return row;
}

/**
 * Render a single row for the recent orders table on overview.
 */
export function renderRecentOrderRow(order) {
  const { row, cell } = cloneRow("recent-order-row");
  row.dataset.id = String(order.id);

  const idBtn = cell("id");
  if (idBtn) {
    idBtn.textContent = `#${order.id}`;
  }

  const customerCell = cell("customer");
  if (customerCell) {
    customerCell.textContent = order.customer || "";
  }

  const dateCell = cell("date");
  if (dateCell) {
    dateCell.textContent = formatDate(order.created_at);
  }

  const totalCell = cell("total");
  if (totalCell) {
    totalCell.textContent = formatPrice(toNumber(order.total)) || `â‚¹${toNumber(order.total)}`;
  }

  setStatusBadge(cell("status"), String(order.status || ""));
  return row;
}

/**
 * Fetch and display the recent orders card on the overview view.
 */
export async function loadRecentOrders() {
  const body = document.getElementById("recent-orders-body");
  const emptyEl = document.getElementById("recent-orders-empty");
  if (!body) return;

  try {
    const data = await request("GET", DASHBOARD_PATHS.orders, {
      params: { page: 1, page_size: DASHBOARD_CONFIG.RECENT_ORDERS },
    });
    const items = Array.isArray(data.items) ? data.items : [];

    body.replaceChildren(...items.map(renderRecentOrderRow));
    if (emptyEl) {
      emptyEl.hidden = items.length > 0;
    }
  } catch (error) {
    if (!error.redirecting) {
      renderTableMessage(body, 5, `Could not load orders. ${error.message}`);
    }
  }
}

/**
 * Fetch and display the paginated admin orders table.
 */
export async function loadOrders() {
  const currentSeq = ++orderState.seq;
  const body = document.getElementById("order-body");
  const emptyEl = document.getElementById("order-empty");
  const pager = {
    prev: document.getElementById("order-prev"),
    next: document.getElementById("order-next"),
    info: document.getElementById("order-page-info"),
  };

  if (!body) return;
  renderTableMessage(body, 7, "Loading...");
  if (emptyEl) emptyEl.hidden = true;

  try {
    const data = await request("GET", DASHBOARD_PATHS.orders, {
      params: {
        page: orderState.page,
        page_size: DASHBOARD_CONFIG.PAGE_SIZE,
        status: orderState.status,
      },
    });

    if (currentSeq !== orderState.seq) {
      return;
    }

    const items = Array.isArray(data.items) ? data.items : [];
    body.replaceChildren(...items.map(renderOrderRow));

    if (emptyEl) {
      emptyEl.hidden = items.length > 0;
    }
    updatePager(pager, orderState.page, DASHBOARD_CONFIG.PAGE_SIZE, toNumber(data.total));
  } catch (error) {
    if (currentSeq === orderState.seq && !error.redirecting) {
      renderTableMessage(body, 7, `Could not load orders. ${error.message}`);
    }
  }
}

/**
 * Render a single line item in the order detail modal.
 */
function renderItemRow(item) {
  const tr = document.createElement("tr");

  const nameTd = document.createElement("td");
  const titleDiv = document.createElement("div");
  titleDiv.className = "cell-name";
  titleDiv.textContent = item.name || "";
  const subDiv = document.createElement("div");
  subDiv.className = "cell-sub";
  subDiv.textContent = [item.strength, item.pack_size].filter(Boolean).join(" \u00b7 ");
  nameTd.append(titleDiv, subDiv);

  const batchTd = document.createElement("td");
  batchTd.textContent = item.batch_no || "";

  const qtyTd = document.createElement("td");
  qtyTd.className = "num";
  qtyTd.textContent = formatNumber(toNumber(item.quantity));

  const unitPriceTd = document.createElement("td");
  unitPriceTd.className = "num";
  unitPriceTd.textContent = formatPrice(toNumber(item.unit_price)) || `â‚¹${toNumber(item.unit_price)}`;

  const lineTotalTd = document.createElement("td");
  lineTotalTd.className = "num";
  lineTotalTd.textContent = formatPrice(toNumber(item.line_total)) || `â‚¹${toNumber(item.line_total)}`;

  tr.append(nameTd, batchTd, qtyTd, unitPriceTd, lineTotalTd);
  return tr;
}

/**
 * Open and populate the order detail modal for a specific order ID.
 */
export async function openOrderDetail(orderId) {
  const currentSeq = ++orderDetailSeq;
  const orderDialog = document.getElementById("order-dialog");
  const titleEl = document.getElementById("order-dialog-title");
  const detailEl = document.getElementById("order-detail");
  const loadingEl = document.getElementById("od-loading");
  const messageEl = document.getElementById("order-message");

  if (!orderDialog) return;

  if (titleEl) titleEl.textContent = `Order #${orderId}`;
  if (detailEl) detailEl.hidden = true;
  if (loadingEl) loadingEl.hidden = false;
  if (messageEl) {
    messageEl.className = "form-message";
    messageEl.textContent = "";
  }

  if (!orderDialog.open && typeof orderDialog.showModal === "function") {
    orderDialog.showModal();
  }

  try {
    const order = await request("GET", `${DASHBOARD_PATHS.orders}/${orderId}`);
    if (currentSeq !== orderDetailSeq) return;

    setStatusBadge(document.getElementById("od-status"), String(order.status || ""));

    const customerEl = document.getElementById("od-customer");
    if (customerEl) customerEl.textContent = order.customer || "â€“";

    const phoneEl = document.getElementById("od-phone");
    if (phoneEl) {
      const phoneValue = order.customer_phone || (order.address && order.address.phone) || "â€“";
      phoneEl.textContent = phoneValue;
    }

    const emailEl = document.getElementById("od-email");
    if (emailEl) emailEl.textContent = order.customer_email || "â€“";

    const dateEl = document.getElementById("od-date");
    if (dateEl) dateEl.textContent = formatDate(order.created_at);

    const paymentEl = document.getElementById("od-payment");
    if (paymentEl) {
      paymentEl.textContent = PAYMENT_LABELS[order.payment_method] || order.payment_method || "â€“";
    }

    const addressEl = document.getElementById("od-address");
    if (addressEl) {
      addressEl.textContent = addressText(order.address) || "â€“";
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const itemsTbody = document.getElementById("od-items");
    if (itemsTbody) {
      itemsTbody.replaceChildren(...items.map(renderItemRow));
    }

    const itemsSum = items.reduce(function sumLineTotal(sum, item) {
      return sum + toNumber(item.line_total);
    }, 0);
    const orderTotalAmount = toNumber(order.total);
    const deliveryFee = orderTotalAmount - itemsSum;

    const feeRowEl = document.getElementById("od-fee-row");
    const feeEl = document.getElementById("od-fee");
    if (feeRowEl && feeEl) {
      feeRowEl.hidden = deliveryFee < 0.005;
      feeEl.textContent = formatPrice(deliveryFee) || `â‚¹${deliveryFee}`;
    }

    const totalEl = document.getElementById("od-total");
    if (totalEl) {
      totalEl.textContent = formatPrice(orderTotalAmount) || `â‚¹${orderTotalAmount}`;
    }

    if (loadingEl) loadingEl.hidden = true;
    if (detailEl) detailEl.hidden = false;
  } catch (error) {
    if (currentSeq !== orderDetailSeq || error.redirecting) return;
    if (loadingEl) loadingEl.hidden = true;
    if (messageEl) {
      messageEl.className = "form-message error is-error";
      messageEl.textContent = `Could not load this order. ${error.message}`;
    }
  }
}

/**
 * Initialize event listeners for the Orders section.
 */
export function initOrders() {
  const statusFilterEl = document.getElementById("order-status-filter");
  if (statusFilterEl) {
    statusFilterEl.addEventListener("change", function handleFilterChange(event) {
      orderState.status = event.target.value;
      orderState.page = 1;
      loadOrders();
    });
  }

  const prevBtn = document.getElementById("order-prev");
  if (prevBtn) {
    prevBtn.addEventListener("click", function handlePrevClick() {
      orderState.page -= 1;
      loadOrders();
    });
  }

  const nextBtn = document.getElementById("order-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", function handleNextClick() {
      orderState.page += 1;
      loadOrders();
    });
  }

  // Handle status update dropdown inside the orders table
  const orderBodyEl = document.getElementById("order-body");
  if (orderBodyEl) {
    orderBodyEl.addEventListener("change", async function handleStatusDropdownChange(event) {
      const select = event.target.closest('select[data-f="next-status"]');
      if (!select || !select.value) return;

      const row = select.closest("tr");
      const orderId = row ? row.dataset.id : null;
      const nextStatus = select.value;
      if (!orderId) return;

      if (nextStatus === "cancelled" || nextStatus === "delivered") {
        const confirmed = await confirmAction({
          title: nextStatus === "cancelled" ? `Cancel order #${orderId}?` : `Mark order #${orderId} as delivered?`,
          text: nextStatus === "cancelled"
            ? "The items go back into stock. This cannot be undone."
            : "A delivered order cannot be changed again.",
          confirmLabel: nextStatus === "cancelled" ? "Cancel order" : "Mark delivered",
        });

        if (!confirmed) {
          select.value = "";
          return;
        }
      }

      select.disabled = true;
      try {
        await request("PATCH", `${DASHBOARD_PATHS.orders}/${orderId}/status`, {
          body: { status: nextStatus },
        });
        showToast(`Order #${orderId} is now ${nextStatus}`);
      } catch (error) {
        if (!error.redirecting) {
          showToast(error.message || "Failed to update order status.");
        }
      }

      await Promise.allSettled([loadOrders(), loadRecentOrders(), loadDashboardStats()]);
    });
  }

  // Handle order number clicks in Orders table and Recent Orders table
  for (const tableId of ["order-body", "recent-orders-body"]) {
    const tableEl = document.getElementById(tableId);
    if (tableEl) {
      tableEl.addEventListener("click", function handleOrderClick(event) {
        const viewBtn = event.target.closest('[data-action="view-order"]');
        if (viewBtn) {
          const row = viewBtn.closest("tr");
          if (row && row.dataset.id) {
            openOrderDetail(row.dataset.id);
          }
        }
      });
    }
  }
}
