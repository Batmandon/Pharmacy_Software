/**
 * Account Feature: Address Controller
 * Manages customer saved addresses, dialog modal lifecycle, and CRUD operations.
 */
import { showToast, confirmAction, showMessage, clearMessage } from "../../shared/utils.js";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setSavedDefaultAddressId,
  getDefaultAddress,
} from "./api.js";
import { validateInputs, setFieldError, renderAddressCard } from "./ui.js";

const MAX_ADDRESSES = 3;

// DOM Elements
const addressListEl = document.getElementById("address-list");
const addressEmptyEl = document.getElementById("address-empty");
const addAddressBtn = document.getElementById("add-address-btn");
const addressDialog = document.getElementById("address-dialog");
const addressDialogTitle = document.getElementById("address-dialog-title");
const addressForm = document.getElementById("address-form");
const addressMessage = document.getElementById("address-message");
const addressSaveBtn = document.getElementById("address-save");
const isDefaultCheckbox = document.getElementById("is_default");

let editingAddressId = null;
let currentAddresses = [];
let onAddressesChangedCallback = null;

function notifyAddressesChanged() {
  if (typeof onAddressesChangedCallback === "function") {
    onAddressesChangedCallback(currentAddresses);
  }
}

/**
 * Open the address dialog to add or edit an address.
 */
export function openAddressDialog(addressToEdit = null) {
  if (!addressDialog || !addressForm) return;

  if (!addressToEdit && currentAddresses.length >= MAX_ADDRESSES) {
    showToast(`You can save up to ${MAX_ADDRESSES} addresses. Delete one to add a new one.`);
    return;
  }

  editingAddressId = addressToEdit ? addressToEdit.id : null;
  if (addressDialogTitle) {
    addressDialogTitle.textContent = addressToEdit ? "Edit Address" : "Add New Address";
  }

  const inputs = addressForm.querySelectorAll('input:not([type="checkbox"])');
  inputs.forEach(function populateInput(input) {
    setFieldError(input, "");
    input.value = addressToEdit && addressToEdit[input.name] !== undefined
      ? addressToEdit[input.name]
      : "";
  });
  clearMessage(addressMessage);

  if (isDefaultCheckbox) {
    const defaultAddr = getDefaultAddress(currentAddresses);
    const mustBeDefault = addressToEdit
      ? (defaultAddr && defaultAddr.id === addressToEdit.id)
      : (currentAddresses.length === 0);
    isDefaultCheckbox.checked = mustBeDefault;
    isDefaultCheckbox.disabled = mustBeDefault;
  }

  addressDialog.showModal();
}

/**
 * Handle address form submission (create or update).
 */
async function handleAddressFormSubmit(event) {
  event.preventDefault();
  clearMessage(addressMessage);

  const inputs = [...addressForm.querySelectorAll('input:not([type="checkbox"])')];
  if (!validateInputs(inputs)) {
    showMessage(addressMessage, "Please fix the highlighted fields.", "error");
    return;
  }

  const payload = {};
  inputs.forEach(function gatherField(input) {
    payload[input.name] = input.value.trim();
  });

  const shouldMakeDefault = isDefaultCheckbox ? isDefaultCheckbox.checked : false;

  if (addressSaveBtn) {
    addressSaveBtn.disabled = true;
    addressSaveBtn.textContent = "Saving...";
  }

  try {
    let savedAddressId = editingAddressId;

    if (editingAddressId === null) {
      const savedAddress = await createAddress(payload);
      savedAddressId = savedAddress.id;
      currentAddresses.push(savedAddress);
    } else {
      const updatedAddress = await updateAddress(editingAddressId, payload);
      savedAddressId = updatedAddress.id;
      currentAddresses = currentAddresses.map(function replaceAddr(addr) {
        return addr.id === editingAddressId ? updatedAddress : addr;
      });
    }

    if (shouldMakeDefault) {
      setSavedDefaultAddressId(savedAddressId);
    }

    renderAddressesList(currentAddresses);
    addressDialog.close();
    showToast(editingAddressId === null ? "Address added successfully." : "Address updated successfully.");
    notifyAddressesChanged();
  } catch (error) {
    if (!error.unauthorized) {
      showMessage(addressMessage, error.message || "Could not save address.", "error");
    }
  } finally {
    if (addressSaveBtn) {
      addressSaveBtn.disabled = false;
      addressSaveBtn.textContent = "Save address";
    }
  }
}

/**
 * Handle making an address default.
 */
function handleSetDefaultAddress(address) {
  setSavedDefaultAddressId(address.id);
  renderAddressesList(currentAddresses);
  showToast("Default address updated.");
  notifyAddressesChanged();
}

/**
 * Handle deleting an address with confirmation dialog.
 */
async function handleDeleteAddress(address) {
  const defaultAddr = getDefaultAddress(currentAddresses);
  if (defaultAddr && defaultAddr.id === address.id && currentAddresses.length > 1) {
    showToast("Set another address as default before deleting this one.");
    return;
  }

  const confirmed = await confirmAction({
    title: "Delete this address?",
    text: "It will be removed from your account and won't be available at checkout.",
    confirmLabel: "Delete",
  });
  if (!confirmed) return;

  try {
    await deleteAddress(address.id);
    currentAddresses = currentAddresses.filter(function removeAddr(addr) {
      return addr.id !== address.id;
    });
    renderAddressesList(currentAddresses);
    showToast("Address deleted successfully.");
    notifyAddressesChanged();
  } catch (error) {
    if (!error.unauthorized) {
      showToast(error.message || "Could not delete address.");
    }
  }
}

/**
 * Render the saved addresses cards and add button.
 */
export function renderAddressesList(addresses) {
  if (!addressListEl) return;
  currentAddresses = Array.isArray(addresses) ? [...addresses] : [];

  const defaultAddr = getDefaultAddress(currentAddresses);
  const defaultId = defaultAddr ? defaultAddr.id : null;

  // Default address sorted first
  const sortedAddresses = [...currentAddresses].sort(function sortDefaultFirst(a, b) {
    const aIsDefault = a.id === defaultId ? 1 : 0;
    const bIsDefault = b.id === defaultId ? 1 : 0;
    return bIsDefault - aIsDefault;
  });

  const canAddMore = sortedAddresses.length < MAX_ADDRESSES;

  const renderedCards = sortedAddresses.map(function mapCard(addr) {
    return renderAddressCard(addr, {
      isDefault: addr.id === defaultId,
      onEdit: openAddressDialog,
      onSetDefault: handleSetDefaultAddress,
      onDelete: handleDeleteAddress,
    });
  });

  if (sortedAddresses.length > 0 && canAddMore) {
    const addTileBtn = document.createElement("button");
    addTileBtn.type = "button";
    addTileBtn.className = "address-add";
    const addIcon = document.createElement("i");
    addIcon.className = "fa-solid fa-plus";
    const addSpan = document.createElement("span");
    addSpan.textContent = "Add new address";
    addTileBtn.append(addIcon, addSpan);
    addTileBtn.addEventListener("click", function handleAddTileClick() {
      openAddressDialog(null);
    });
    renderedCards.push(addTileBtn);
  }

  addressListEl.replaceChildren(...renderedCards);

  if (addAddressBtn) {
    addAddressBtn.hidden = !canAddMore;
  }
  if (addressEmptyEl) {
    addressEmptyEl.hidden = sortedAddresses.length > 0;
  }
}

/**
 * Initialize address controller event listeners.
 */
export function initAddressController(options = {}) {
  onAddressesChangedCallback = options.onAddressesChanged || null;

  if (addAddressBtn) {
    addAddressBtn.addEventListener("click", function handleAddClick() {
      openAddressDialog(null);
    });
  }

  if (addressForm) {
    addressForm.addEventListener("submit", handleAddressFormSubmit);
  }
}
