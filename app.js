const MAX_X = 10;
const MAX_Y = 4;
const STORAGE_KEY = "inventory-grid-state-v1";

const grid = document.getElementById("inventory-grid");
const exportCsvButton = document.getElementById("export-csv");
const importCsvButton = document.getElementById("import-csv");
const csvFileInput = document.getElementById("csv-file-input");
const exportJsonButton = document.getElementById("export-json");
const importJsonButton = document.getElementById("import-json");
const jsonFileInput = document.getElementById("json-file-input");
const aisleSelect = document.getElementById("aisle-select");
const newAisleButton = document.getElementById("new-aisle");

const modalBackdrop = document.getElementById("modal-backdrop");
const editModal = document.getElementById("edit-modal");
const viewModal = document.getElementById("view-modal");
const editCoordinateLabel = document.getElementById("edit-coordinate");
const viewCoordinateLabel = document.getElementById("view-coordinate");
const editItemsList = document.getElementById("edit-items-list");
const viewItemsList = document.getElementById("view-items-list");
const editForm = document.getElementById("edit-form");
const saveItemButton = document.getElementById("save-item");
const cancelItemEditButton = document.getElementById("cancel-item-edit");
const clearCellButton = document.getElementById("clear-cell");
const closeEditButton = document.getElementById("close-edit");
const closeViewButton = document.getElementById("close-view");
const closeEditTopButton = document.getElementById("close-edit-top");
const closeViewTopButton = document.getElementById("close-view-top");

let currentEditCoordinate = null;
let editingItemIndex = null;
let currentAisleId = "default";
const aisles = [{ id: "default", name: "Inventory" }];
const cellModes = new Map();
const cellLabels = new Map();
const inventoryItems = [];

const numericFieldNames = ["carton", "single", "cartonSize"];

function coordinatePrefix() {
  const aisle = aisles.find((entry) => entry.id === currentAisleId);
  const source = aisle?.name?.trim() || "X";
  return source[0].toUpperCase();
}

function toCoordinate(x, y) {
  return `${coordinatePrefix()}${String(x).padStart(2, "0")}${String(y).padStart(2, "0")}`;
}

function cellKey(aisleId, x, y) {
  return `${aisleId}:${x}:${y}`;
}

function coordinateToXY(coordinate) {
  const body = coordinate.slice(1);
  return {
    x: Number(body.slice(0, 2)),
    y: Number(body.slice(2, 4)),
  };
}

function getCellMode(aisleId, x, y) {
  return cellModes.get(cellKey(aisleId, x, y)) || "active";
}

function setCellModeValue(aisleId, x, y, mode) {
  cellModes.set(cellKey(aisleId, x, y), mode);
}

function getCellLabel(aisleId, x, y) {
  return cellLabels.get(cellKey(aisleId, x, y)) || "";
}

function setCellLabel(aisleId, x, y, label) {
  const key = cellKey(aisleId, x, y);
  const cleaned = label.trim();
  if (cleaned) {
    cellLabels.set(key, cleaned);
  } else {
    cellLabels.delete(key);
  }
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateItemTotal(item) {
  return toNumber(item.carton) * toNumber(item.cartonSize) + toNumber(item.single);
}

function escapeCsv(value) {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function normalizeNumericInput(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function attachNumericInputGuards() {
  numericFieldNames.forEach((fieldName) => {
    const input = editForm.elements[fieldName];
    if (!input) {
      return;
    }

    input.addEventListener("input", () => {
      input.value = normalizeNumericInput(input.value);
    });
  });
}

function ensureAisleByName(name) {
  const existing = aisles.find((aisle) => aisle.name === name);
  if (existing) {
    return existing;
  }

  const id = `aisle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next = { id, name };
  aisles.push(next);
  renderAisleSelect();
  return next;
}

function getItemsByCoordinate(coordinate) {
  return inventoryItems
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.aisleId === currentAisleId && item.coordinate === coordinate);
}

function renderItemsList(target, coordinate, forEdit = false) {
  const items = getItemsByCoordinate(coordinate);

  if (items.length === 0) {
    target.innerHTML = "<p>No items in this slot yet.</p>";
    return;
  }

  const slotTotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  target.innerHTML =
    items
      .map(
        (item, idx) => `
      <div class="item-row">
        <strong>Item ${idx + 1}</strong><br />
        <strong>Code:</strong> ${item.code || "-"}<br />
        <strong>Description:</strong> ${item.description || "-"}<br />
        <strong>Carton:</strong> ${item.carton || "-"}<br />
        <strong>Carton Size:</strong> ${item.cartonSize || "-"}<br />
        <strong>Single:</strong> ${item.single || "-"}<br />
        <strong>Total Units:</strong> ${calculateItemTotal(item)}<br />
        <strong>Date:</strong> ${item.date || "-"}<br />
        <strong>Notes:</strong> ${item.notes || "-"}
        ${forEdit ? `<div class="item-row-actions"><button type="button" class="edit-existing-item" data-item-index="${item.index}">Edit Item</button></div>` : ""}
      </div>
    `,
      )
      .join("") + `<p><strong>Slot Total Units:</strong> ${slotTotal}</p>`;
}

function resetEditState() {
  editingItemIndex = null;
  saveItemButton.textContent = "Add Item";
  cancelItemEditButton.classList.add("hidden");
  editForm.reset();
}

function startEditItem(itemIndex) {
  const item = inventoryItems[itemIndex];
  if (!item) {
    return;
  }

  editingItemIndex = itemIndex;
  saveItemButton.textContent = "Update Item";
  cancelItemEditButton.classList.remove("hidden");

  editForm.elements.code.value = item.code || "";
  editForm.elements.description.value = item.description || "";
  editForm.elements.carton.value = item.carton || "";
  editForm.elements.single.value = item.single || "";
  editForm.elements.cartonSize.value = item.cartonSize || "";
  editForm.elements.date.value = item.date || "";
  editForm.elements.notes.value = item.notes || "";
}

function openModal(modal) {
  modalBackdrop.classList.remove("hidden");
  modal.classList.remove("hidden");
}

function closeModals() {
  modalBackdrop.classList.add("hidden");
  editModal.classList.add("hidden");
  viewModal.classList.add("hidden");
  resetEditState();
}

function setCellVisualMode(cell, lockButton, inactive) {
  const actionButtons = cell.querySelectorAll(".cell-action");
  const labelInput = cell.querySelector(".cell-label-input");
  const labelSaveButton = cell.querySelector(".cell-label-save");

  cell.dataset.mode = inactive ? "inactive" : "active";
  cell.classList.toggle("inactive", inactive);
  cell.classList.toggle("is-selected", false);

  lockButton.classList.toggle("is-locked", inactive);
  lockButton.textContent = inactive ? "🔒" : "🔓";

  actionButtons.forEach((button) => {
    button.disabled = inactive;
  });

  if (labelInput) {
    labelInput.disabled = inactive;
  }
  if (labelSaveButton) {
    labelSaveButton.disabled = inactive;
  }
}

function createCell(x, y) {
  const coordinate = toCoordinate(x, y);

  const cell = document.createElement("div");
  cell.className = "grid-cell";
  cell.dataset.x = String(x);
  cell.dataset.y = String(y);
  cell.dataset.coordinate = coordinate;
  cell.setAttribute("tabindex", "0");
  cell.setAttribute("aria-label", `Inventory slot ${coordinate}`);

  const label = document.createElement("span");
  label.className = "cell-coordinate";
  label.textContent = coordinate;

  const cellTag = document.createElement("span");
  cellTag.className = "cell-tag";
  cellTag.textContent = getCellLabel(currentAisleId, x, y);

  const lockButton = document.createElement("button");
  lockButton.type = "button";
  lockButton.className = "lock-toggle";

  const labelPrompt = document.createElement("div");
  labelPrompt.className = "cell-label-prompt hidden";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "cell-label-input";
  labelInput.maxLength = 24;
  labelInput.placeholder = "Cell label";

  const labelSaveButton = document.createElement("button");
  labelSaveButton.type = "button";
  labelSaveButton.className = "cell-label-save";
  labelSaveButton.textContent = "Save";

  labelPrompt.appendChild(labelInput);
  labelPrompt.appendChild(labelSaveButton);

  const buttonWrap = document.createElement("div");
  buttonWrap.className = "cell-buttons";

  const labelButton = document.createElement("button");
  labelButton.type = "button";
  labelButton.className = "cell-action";
  labelButton.textContent = "Label";

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "cell-action";
  viewButton.textContent = "View";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "cell-action";
  editButton.textContent = "Edit";

  labelButton.addEventListener("click", (event) => {
    event.stopPropagation();
    labelInput.value = getCellLabel(currentAisleId, x, y);
    labelPrompt.classList.toggle("hidden");
    if (!labelPrompt.classList.contains("hidden")) {
      labelInput.focus();
      labelInput.select();
    }
  });

  labelSaveButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setCellLabel(currentAisleId, x, y, labelInput.value || "");
    cellTag.textContent = getCellLabel(currentAisleId, x, y);
    labelPrompt.classList.add("hidden");
    saveState();
  });

  labelInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      labelSaveButton.click();
    }
  });

  viewButton.addEventListener("click", (event) => {
    event.stopPropagation();
    viewCoordinateLabel.textContent = cell.dataset.coordinate;
    renderItemsList(viewItemsList, cell.dataset.coordinate);
    openModal(viewModal);
  });

  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    currentEditCoordinate = cell.dataset.coordinate;
    editCoordinateLabel.textContent = currentEditCoordinate;
    renderItemsList(editItemsList, currentEditCoordinate, true);
    resetEditState();
    openModal(editModal);
  });

  lockButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextInactive = cell.dataset.mode !== "inactive";
    setCellModeValue(currentAisleId, x, y, nextInactive ? "inactive" : "active");
    setCellVisualMode(cell, lockButton, nextInactive);
    saveState();
  });

  cell.addEventListener("click", (event) => {
    if (event.target.closest("button") || cell.dataset.mode === "inactive") {
      return;
    }
    cell.classList.toggle("is-selected");
  });

  buttonWrap.appendChild(labelButton);
  buttonWrap.appendChild(viewButton);
  buttonWrap.appendChild(editButton);

  cell.appendChild(label);
  cell.appendChild(cellTag);
  cell.appendChild(lockButton);
  cell.appendChild(labelPrompt);
  cell.appendChild(buttonWrap);

  setCellVisualMode(cell, lockButton, getCellMode(currentAisleId, x, y) === "inactive");
  return cell;
}

function renderGrid() {
  grid.innerHTML = "";
  closeModals();

  for (let y = MAX_Y; y >= 0; y -= 1) {
    for (let x = 0; x <= MAX_X; x += 1) {
      grid.appendChild(createCell(x, y));
    }
  }
}

function renderAisleSelect() {
  aisleSelect.innerHTML = aisles.map((aisle) => `<option value="${aisle.id}">${aisle.name}</option>`).join("");
  aisleSelect.value = currentAisleId;
}

function serializeState() {
  return {
    version: 1,
    currentAisleId,
    aisles: [...aisles],
    inventoryItems: [...inventoryItems],
    cellModes: Object.fromEntries(cellModes.entries()),
    cellLabels: Object.fromEntries(cellLabels.entries()),
  };
}

function applyState(state) {
  if (!state || !Array.isArray(state.aisles) || !Array.isArray(state.inventoryItems)) {
    return;
  }

  aisles.length = 0;
  state.aisles.forEach((aisle) => aisles.push(aisle));

  inventoryItems.length = 0;
  state.inventoryItems.forEach((item) => inventoryItems.push(item));

  cellModes.clear();
  Object.entries(state.cellModes || {}).forEach(([key, value]) => cellModes.set(key, value));

  cellLabels.clear();
  Object.entries(state.cellLabels || {}).forEach(([key, value]) => cellLabels.set(key, value));

  currentAisleId = aisles.some((aisle) => aisle.id === state.currentAisleId)
    ? state.currentAisleId
    : aisles[0]?.id || "default";

  renderAisleSelect();
  renderGrid();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    applyState(parsed);
  } catch {
    // ignore bad local state
  }
}

editItemsList.addEventListener("click", (event) => {
  const button = event.target.closest(".edit-existing-item");
  if (!button) {
    return;
  }

  startEditItem(Number(button.dataset.itemIndex));
});

cancelItemEditButton.addEventListener("click", () => {
  resetEditState();
  if (currentEditCoordinate) {
    const { x, y } = coordinateToXY(currentEditCoordinate);
  }
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentEditCoordinate) {
    return;
  }

  const formData = new FormData(editForm);
  const nextItem = {
    aisleId: currentAisleId,
    coordinate: currentEditCoordinate,
    code: formData.get("code")?.toString().trim() || "",
    description: formData.get("description")?.toString().trim() || "",
    carton: normalizeNumericInput(formData.get("carton")?.toString().trim() || ""),
    cartonSize: normalizeNumericInput(formData.get("cartonSize")?.toString().trim() || ""),
    single: normalizeNumericInput(formData.get("single")?.toString().trim() || ""),
    date: formData.get("date")?.toString().trim() || "",
    notes: formData.get("notes")?.toString().trim() || "",
  };

  if (editingItemIndex !== null && inventoryItems[editingItemIndex]) {
    inventoryItems[editingItemIndex] = nextItem;
  } else {
    inventoryItems.push(nextItem);
  }

  renderGrid();
  renderItemsList(editItemsList, currentEditCoordinate, true);
  resetEditState();
  saveState();
});

clearCellButton.addEventListener("click", () => {
  if (!currentEditCoordinate) {
    return;
  }

  const aisleName = aisles.find((entry) => entry.id === currentAisleId)?.name || "this aisle";
  const confirmed = window.confirm(`Clear all items in ${currentEditCoordinate} (${aisleName})?`);
  if (!confirmed) {
    return;
  }

  for (let index = inventoryItems.length - 1; index >= 0; index -= 1) {
    const item = inventoryItems[index];
    if (item.aisleId === currentAisleId && item.coordinate === currentEditCoordinate) {
      inventoryItems.splice(index, 1);
    }
  }

  renderItemsList(editItemsList, currentEditCoordinate, true);
  resetEditState();
  saveState();
});

closeEditButton.addEventListener("click", closeModals);
closeViewButton.addEventListener("click", closeModals);
closeEditTopButton.addEventListener("click", closeModals);
closeViewTopButton.addEventListener("click", closeModals);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) {
    closeModals();
  }
});

newAisleButton.addEventListener("click", () => {
  const name = window.prompt("Enter new aisle name:", "Aisle 2")?.trim();
  if (!name) {
    return;
  }

  const aisle = ensureAisleByName(name);
  currentAisleId = aisle.id;
  renderAisleSelect();
  renderGrid();
  saveState();
});

aisleSelect.addEventListener("change", () => {
  currentAisleId = aisleSelect.value;
  renderGrid();
  saveState();
});

exportCsvButton.addEventListener("click", () => {
  const header = ["Aisle", "Coordinate", "Code", "Description", "Carton", "Carton Size", "Single", "Total Units", "Date", "Notes"];
  const lines = [header.join(",")];

  inventoryItems.forEach((item) => {
    const aisleName = aisles.find((entry) => entry.id === item.aisleId)?.name || "";
    lines.push([
      escapeCsv(aisleName),
      escapeCsv(item.coordinate),
      escapeCsv(item.code),
      escapeCsv(item.description),
      escapeCsv(item.carton),
      escapeCsv(item.cartonSize),
      escapeCsv(item.single),
      escapeCsv(calculateItemTotal(item)),
      escapeCsv(item.date),
      escapeCsv(item.notes),
    ].join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "inventory-all-aisles.csv";
  link.click();
  URL.revokeObjectURL(url);
});

importCsvButton.addEventListener("click", () => {
  csvFileInput.click();
});

csvFileInput.addEventListener("change", async () => {
  const file = csvFileInput.files?.[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (rows.length < 2) {
    return;
  }

  inventoryItems.length = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const columns = parseCsvLine(rows[index]);
    const [aisleName = "Inventory", coordinate = "", code = "", description = "", carton = "", cartonSize = "", single = "", maybeTotalOrDate = "", maybeDateOrNotes = "", maybeNotes = ""] = columns;

    const aisle = ensureAisleByName(aisleName || "Inventory");
    const hasTotalColumn = columns.length >= 10;
    const date = hasTotalColumn ? maybeDateOrNotes : maybeTotalOrDate;
    const notes = hasTotalColumn ? maybeNotes : maybeDateOrNotes;

    inventoryItems.push({
      aisleId: aisle.id,
      coordinate,
      code,
      description,
      carton,
      cartonSize,
      single,
      date,
      notes,
    });
  }

  renderAisleSelect();
  renderGrid();
  csvFileInput.value = "";
  saveState();
});

exportJsonButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "inventory-state.json";
  link.click();
  URL.revokeObjectURL(url);
});

importJsonButton.addEventListener("click", () => {
  jsonFileInput.click();
});

jsonFileInput.addEventListener("change", async () => {
  const file = jsonFileInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    applyState(parsed);
    saveState();
  } catch {
    window.alert("Invalid JSON state file.");
  }

  jsonFileInput.value = "";
});

attachNumericInputGuards();
loadState();
renderAisleSelect();
renderGrid();
