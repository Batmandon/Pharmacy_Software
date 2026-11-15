/**
 * Orders Feature: UI Layer
 * Reusable UI components for Order Status Badges, Cart Items, Order Cards, and Order Details Dialog.
 */
import { formatPrice, formatDate, addressText, getImageUrl } from "../../shared/utils.js";
import { getOrderNumber, getOrderTotal } from "./api.js";

/**
 * Render a styled order status badge element.
 */
export function renderStatusBadge(status) {
  const cleanStatus = (typeof status === "string" && status.trim())
    ? status.trim().toLowerCase()
    : "pending";

  const badge = document.createElement("span");
  badge.className = `status status-${cleanStatus}`;
  badge.textContent = cleanStatus;
  return badge;
}

/**
 * Render a cart item element for the checkout page.
 */
export function renderCartItem(item, callbacks = {}) {
  const row = document.createElement("div");
  row.className = "item";
  row.dataset.cartItem = "";

  // Image thumbnail or fallback pill
  const imageContainer = document.createElement("div");
  imageContainer.className = "pill";
  const validImageUrl = getImageUrl(item.img_url);

  if (validImageUrl) {
    const image = document.createElement("img");
    image.src = validImageUrl;
    image.alt = item.name || "Product";
    image.loading = "lazy";
    image.addEventListener("error", function handleImageFallback() {
      image.replaceWith(document.createTextNode("💊"));
    }, { once: true });
    imageContainer.append(image);
  } else {
    imageContainer.textContent = "💊";
  }

  // Product description and details
  const details = document.createElement("div");
  const name = document.createElement("b");
  name.textContent = item.name || "Medicine";

  const description = document.createElement("small");
  const unitPrice = formatPrice(item.price);
  const parts = [
    item.strength,
    item.pack_size,
    `${unitPrice} each`,
    `Qty ${item.quantity || 1}`,
  ].filter(Boolean);
  description.textContent = parts.join(" · ");
  details.append(name, description);

  // Line total
  const lineTotal = item.line_total !== undefined && item.line_total !== null
    ? item.line_total
    : (Number(item.price || 0) * Number(item.quantity || 1));
  const priceSpan = document.createElement("span");
  priceSpan.className = "price";
  priceSpan.textContent = formatPrice(lineTotal);

  // Remove button
  const removeButton = document.createElement("button");
  removeButton.className = "remove-item";
  removeButton.type = "button";
  removeButton.dataset.removeItem = "";
  removeButton.dataset.productId = String(item.product_id);
  removeButton.setAttribute("aria-label", `Remove ${item.name || "item"} from cart`);
  removeButton.title = "Remove item";

  const trashIcon = document.createElement("i");
  trashIcon.className = "fa-solid fa-trash-can";
  trashIcon.setAttribute("aria-hidden", "true");
  removeButton.append(trashIcon);

  if (callbacks.onRemove) {
    removeButton.addEventListener("click", function handleRemoveClick(event) {
      event.preventDefault();
      callbacks.onRemove(item.product_id, removeButton);
    });
  }

  row.append(imageContainer, details, priceSpan, removeButton);
  return row;
}

/**
 * Render a customer order card element for the account portal.
 */
export function renderOrderCard(order, callbacks = {}) {
  const article = document.createElement("article");
  article.className = "order-card";

  // Top header (Order Number, Date, Status Badge)
  const orderTop = document.createElement("div");
  orderTop.className = "order-top";

  const titleWrap = document.createElement("div");
  const orderNo = document.createElement("p");
  orderNo.className = "order-no";
  orderNo.textContent = `Order #${getOrderNumber(order)}`;

  const orderDate = document.createElement("p");
  orderDate.className = "order-date";
  orderDate.textContent = `Placed on ${formatDate(order.created_at)}`;
  titleWrap.append(orderNo, orderDate);

  const statusBadge = renderStatusBadge(order.status);
  orderTop.append(titleWrap, statusBadge);

  // Summary of items
  const items = Array.isArray(order.items) ? order.items : [];
  const summaryText = items.map(function formatItemSummary(item) {
    return `${item.name} × ${item.quantity}`;
  }).join(", ") || "No items listed";

  const orderSummary = document.createElement("p");
  orderSummary.className = "order-summary";
  orderSummary.textContent = summaryText;

  // Footer (Total and View Details button)
  const orderFoot = document.createElement("div");
  orderFoot.className = "order-foot";

  const totalLine = document.createElement("span");
  totalLine.className = "order-total-line";
  totalLine.append(document.createTextNode("Total "));
  const strongTotal = document.createElement("strong");
  strongTotal.textContent = formatPrice(getOrderTotal(order));
  totalLine.append(strongTotal);

  const viewDetailsButton = document.createElement("button");
  viewDetailsButton.type = "button";
  viewDetailsButton.className = "btn btn-outline btn-sm";
  viewDetailsButton.dataset.orderId = String(order.id);
  viewDetailsButton.textContent = "View details";

  if (callbacks.onViewDetails) {
    viewDetailsButton.addEventListener("click", function handleViewClick(event) {
      event.preventDefault();
      callbacks.onViewDetails(order);
    });
  }

  orderFoot.append(totalLine, viewDetailsButton);
  article.append(orderTop, orderSummary, orderFoot);
  return article;
}

/**
 * Populate an existing order details dialog element.
 */
export function populateOrderDialog(dialogElement, order) {
  if (!dialogElement || !order) return;

  const titleElement = dialogElement.querySelector("#order-dialog-title");
  if (titleElement) {
    titleElement.textContent = `Order #${getOrderNumber(order)}`;
  }

  // Populate Meta Details
  const metaContainer = dialogElement.querySelector("#order-meta");
  if (metaContainer) {
    metaContainer.replaceChildren();

    function createMetaRow(label, valueContent) {
      const row = document.createElement("div");
      row.className = "meta-row";
      const labelSpan = document.createElement("span");
      labelSpan.className = "meta-label";
      labelSpan.textContent = label;
      row.append(labelSpan);

      const isDomNode = typeof Node !== "undefined"
        ? (valueContent instanceof Node)
        : (valueContent && typeof valueContent === "object");

      if (isDomNode) {
        row.append(valueContent);
      } else {
        const valSpan = document.createElement("span");
        valSpan.className = "meta-value";
        valSpan.textContent = String(valueContent);
        row.append(valSpan);
      }
      return row;
    }

    metaContainer.append(createMetaRow("Placed on", formatDate(order.created_at)));
    metaContainer.append(createMetaRow("Status", renderStatusBadge(order.status)));

    const formattedAddress = addressText(order.address);
    if (formattedAddress) {
      metaContainer.append(createMetaRow("Delivery address", formattedAddress));
    }
  }

  // Populate Item Rows
  const itemsContainer = dialogElement.querySelector("#order-items");
  if (itemsContainer) {
    itemsContainer.replaceChildren();
    const items = Array.isArray(order.items) ? order.items : [];

    items.forEach(function renderItemRow(item) {
      const itemRow = document.createElement("div");
      itemRow.className = "item-row";

      const infoWrap = document.createElement("div");
      const itemName = document.createElement("p");
      itemName.className = "item-name";
      itemName.textContent = item.name || "Medicine";

      const itemSub = document.createElement("p");
      itemSub.className = "item-sub";
      itemSub.textContent = `${item.quantity} × ${formatPrice(item.price)}`;
      infoWrap.append(itemName, itemSub);

      const itemTotal = document.createElement("strong");
      const lineCost = Number(item.price || 0) * Number(item.quantity || 1);
      itemTotal.textContent = formatPrice(lineCost);

      itemRow.append(infoWrap, itemTotal);
      itemsContainer.append(itemRow);
    });
  }

  // Populate Total
  const totalElement = dialogElement.querySelector("#order-total");
  if (totalElement) {
    totalElement.textContent = formatPrice(getOrderTotal(order));
  }
}
