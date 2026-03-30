const MAX_X = 10;
const MAX_Y = 4;
const STORAGE_KEY = "inventory-grid-state-v1";
const SOURCE_URL_KEY = "inventory-source-url";
const SOURCE_SAVE_URL_KEY = "inventory-source-save-url";

const grid = document.getElementById("inventory-grid");
const exportCsvButton = document.getElementById("export-csv");
const importCsvButton = document.getElementById("import-csv");
const openSourceMenuButton = document.getElementById("open-source-menu");
const openOutputMenuButton = document.getElementById("open-output-menu");
const loadSourceCsvButton = document.getElementById("load-source-csv");
const loadSourceUrlButton = document.getElementById("load-source-url");
const testSourceSaveUrlButton = document.getElementById("test-source-save-url");
const csvFileInput = document.getElementById("csv-file-input");
const sourceFileInput = document.getElementById("source-file-input");
const sourceUrlInput = document.getElementById("source-url-input");
const sourceSaveUrlInput = document.getElementById("source-save-url-input");
const exportJsonButton = document.getElementById("export-json");
const importJsonButton = document.getElementById("import-json");
const resetCellDataButton = document.getElementById("reset-cell-data");
const jsonFileInput = document.getElementById("json-file-input");
const sourceStatus = document.getElementById("source-status");
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
const barcodeLookupButton = document.getElementById("barcode-lookup");
const sourceMenuBackdrop = document.getElementById("source-menu-backdrop");
const closeSourceMenuButton = document.getElementById("close-source-menu");
const closeSourceMenuTopButton = document.getElementById("close-source-menu-top");
const outputMenuBackdrop = document.getElementById("output-menu-backdrop");
const closeOutputMenuButton = document.getElementById("close-output-menu");
const closeOutputMenuTopButton = document.getElementById("close-output-menu-top");

let currentEditCoordinate = null;
let editingItemIndex = null;
let currentAisleId = "default";
const aisles = [{ id: "default", name: "Inventory" }];
const cellModes = new Map();
const cellLabels = new Map();
const inventoryItems = [];
const sourceCatalogByBarcode = new Map();
const sourceCatalogByScanCode = new Map();

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

function calculateTotalCost(item) {
  return calculateItemTotal(item) * toNumber(item.avgCost);
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

function normalizeBarcode(value) {
  const raw = String(value ?? "").replace(/^"+|"+$/g, "").trim();
  if (!raw) {
    return "";
  }

  const compact = raw.replace(/[\s-]+/g, "");
  if (/^\d+(\.0+)?$/.test(compact)) {
    return compact.replace(/\.0+$/, "");
  }

  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(compact)) {
    const expanded = Number(compact);
    if (Number.isFinite(expanded) && Number.isInteger(expanded)) {
      return String(expanded);
    }
  }

  return compact;
}

function findColumnIndex(header, candidates) {
  const normalizedHeader = header.map((entry) => entry.trim().toLowerCase());
  return normalizedHeader.findIndex((entry) => candidates.includes(entry));
}

function parseSourceCatalogCsv(text) {
  sourceCatalogByBarcode.clear();
  sourceCatalogByScanCode.clear();
  const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (rows.length < 2) {
    return 0;
  }

  const header = parseCsvLine(rows[0]);
  const barcodeIndex = findColumnIndex(header, ["barcode"]);
  const outerBarcodeIndex = findColumnIndex(header, ["outerbarcode", "outer barcode", "outer_barcode"]);
  const codeIndex = findColumnIndex(header, ["product code", "code"]);
  const descriptionIndex = findColumnIndex(header, ["description"]);
  const cartonSizeIndex = findColumnIndex(header, ["carton size"]);
  const avgCostIndex = findColumnIndex(header, ["avg cost"]);

  if (barcodeIndex < 0) {
    return 0;
  }

  for (let index = 1; index < rows.length; index += 1) {
    const columns = parseCsvLine(rows[index]);
    const fromColumn = (columnIndex) => (columnIndex >= 0 ? columns[columnIndex] : "");
    const barcode = normalizeBarcode(fromColumn(barcodeIndex));
    const outerBarcode = normalizeBarcode(fromColumn(outerBarcodeIndex));
    const canonicalBarcode = barcode || outerBarcode;
    if (!canonicalBarcode) {
      continue;
    }

    const entry = {
      barcode: canonicalBarcode,
      outerBarcode: outerBarcode || "",
      code: String(fromColumn(codeIndex) || "").trim(),
      description: String(fromColumn(descriptionIndex) || "").trim(),
      cartonSize: String(fromColumn(cartonSizeIndex) || "").trim(),
      avgCost: String(fromColumn(avgCostIndex) || "").trim(),
    };

    sourceCatalogByBarcode.set(canonicalBarcode, entry);
    sourceCatalogByScanCode.set(canonicalBarcode, entry);
    if (outerBarcode) {
      sourceCatalogByScanCode.set(outerBarcode, entry);
    }
  }

  return sourceCatalogByBarcode.size;
}

function parseSourceCatalogJson(text) {
  sourceCatalogByBarcode.clear();
  sourceCatalogByScanCode.clear();
  const parsed = JSON.parse(text);
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Object.values(parsed || {});

  const readField = (entry, names) => {
    for (const name of names) {
      if (entry?.[name] !== undefined && entry?.[name] !== null) {
        return String(entry[name]).trim();
      }
    }
    return "";
  };

  entries.forEach((entry) => {
    const barcode = normalizeBarcode(readField(entry, ["barcode", "Barcode", "BARCODE"]));
    const outerBarcode = normalizeBarcode(readField(entry, ["outerBarcode", "OuterBarcode", "outer_barcode", "Outer Barcode"]));
    const canonicalBarcode = barcode || outerBarcode;
    if (!canonicalBarcode) {
      return;
    }
    const parsedEntry = {
      barcode: canonicalBarcode,
      outerBarcode: outerBarcode || "",
      code: readField(entry, ["code", "productCode", "Code", "Product Code"]),
      description: readField(entry, ["description", "Description"]),
      cartonSize: readField(entry, ["cartonSize", "carton_size", "Carton Size"]),
      avgCost: readField(entry, ["avgCost", "avg_cost", "Avg Cost"]),
    };
    sourceCatalogByBarcode.set(canonicalBarcode, parsedEntry);
    sourceCatalogByScanCode.set(canonicalBarcode, parsedEntry);
    if (outerBarcode) {
      sourceCatalogByScanCode.set(outerBarcode, parsedEntry);
    }
  });

  return sourceCatalogByBarcode.size;
}

function updateSourceStatus(loaded, format = "") {
  if (!sourceStatus) {
    return;
  }
  sourceStatus.textContent = loaded
    ? `Source entries: ${sourceCatalogByBarcode.size}${format ? ` (${format})` : ""}`
    : "Source entries: 0 (not loaded)";
}

function buildSourceCatalogCsvText() {
  const header = ["Aisle", "Coordinate", "Product Code", "Barcode", "OuterBarcode", "Description", "Carton", "Carton Size", "Single", "Total Units", "Avg Cost", "Total Cost", "Date", "Notes"];
  const lines = [header.join(",")];

  Array.from(sourceCatalogByBarcode.entries())
    .sort(([barcodeA], [barcodeB]) => barcodeA.localeCompare(barcodeB, undefined, { numeric: true }))
    .forEach(([barcode, entry]) => {
      lines.push([
        "",
        "",
        escapeCsv(entry.code || ""),
        escapeCsv(entry.barcode || barcode),
        escapeCsv(entry.outerBarcode || ""),
        escapeCsv(entry.description || ""),
        "",
        escapeCsv(entry.cartonSize || ""),
        "",
        "",
        escapeCsv(entry.avgCost || ""),
        "",
        "",
        "Added from app lookup prompt",
      ].join(","));
    });

  return lines.join("\n");
}

function buildSourceCatalogJsonText() {
  const items = Array.from(sourceCatalogByBarcode.entries())
    .sort(([barcodeA], [barcodeB]) => barcodeA.localeCompare(barcodeB, undefined, { numeric: true }))
    .map(([barcode, entry]) => ({
      barcode: entry.barcode || barcode,
      outerBarcode: entry.outerBarcode || "",
      code: entry.code || "",
      description: entry.description || "",
      cartonSize: entry.cartonSize || "",
      avgCost: entry.avgCost || "",
    }));

  return JSON.stringify({ items }, null, 2);
}

function getSourceSavePayload(saveUrl) {
  const normalizedUrl = saveUrl.trim().toLowerCase();
  const isJson = !normalizedUrl || normalizedUrl.endsWith(".json");
  return isJson
    ? { body: buildSourceCatalogJsonText(), contentType: "application/json", extension: "json" }
    : { body: buildSourceCatalogCsvText(), contentType: "text/csv;charset=utf-8", extension: "csv" };
}

function downloadSourceCatalog(payload) {
  const mimeType = payload.extension === "json" ? "application/json" : "text/csv;charset=utf-8;";
  const fileName = payload.extension === "json" ? "source.json" : "source.csv";
  const blob = new Blob([payload.body], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function persistUpdatedSourceCatalog() {
  const saveUrl = sourceSaveUrlInput?.value?.trim() || "";
  const payload = getSourceSavePayload(saveUrl);

  if (!saveUrl) {
    downloadSourceCatalog(payload);
    return { mode: "downloaded", reason: "No Source Save URL configured." };
  }

  const saveAttempt = await attemptRemoteSourceSave(saveUrl, payload);
  if (saveAttempt.ok) {
    localStorage.setItem(SOURCE_SAVE_URL_KEY, saveUrl);
    return { mode: "remote-saved", method: saveAttempt.method };
  }

  downloadSourceCatalog(payload);
  return {
    mode: "downloaded-fallback",
    reason: saveAttempt.reason,
  };
}

async function attemptRemoteSourceSave(saveUrl, payload) {
  const attemptErrors = [];
  try {
    for (const method of ["PUT", "POST"]) {
      const response = await fetch(saveUrl, {
        method,
        headers: { "Content-Type": payload.contentType },
        body: payload.body,
      });

      if (response.ok) {
        return { ok: true, method };
      }

      const responseText = await response.text().catch(() => "");
      attemptErrors.push(`${method} ${response.status}${responseText ? `: ${responseText.slice(0, 120)}` : ""}`);
    }
  } catch {
    attemptErrors.push("Network/CORS error");
  }

  return {
    ok: false,
    reason: attemptErrors.join(" | "),
  };
}

async function loadSourceCatalog() {
  const configuredSourceUrl = sourceUrlInput?.value?.trim() || "";
  const sourcePaths = configuredSourceUrl
    ? [configuredSourceUrl]
    : ["source.json", "./source.json", "/source.json", "source.csv", "./source.csv", "/source.csv"];
  try {
    for (const sourcePath of sourcePaths) {
      const response = await fetch(sourcePath, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }
      const text = await response.text();
      const contentType = response.headers.get("content-type") || "";
      const looksJson = sourcePath.toLowerCase().endsWith(".json") || contentType.includes("application/json");
      const parsedCount = looksJson
        ? parseSourceCatalogJson(text)
        : parseSourceCatalogCsv(text);
      if (!parsedCount) {
        continue;
      }
      if (looksJson) {
        updateSourceStatus(true, "JSON");
      } else {
        updateSourceStatus(true, "CSV");
      }
      if (sourceUrlInput && sourcePath === configuredSourceUrl && configuredSourceUrl) {
        localStorage.setItem(SOURCE_URL_KEY, configuredSourceUrl);
      }
      return {
        loaded: true,
        count: sourceCatalogByBarcode.size,
        sourcePath,
        format: looksJson ? "JSON" : "CSV",
      };
    }
    updateSourceStatus(false);
    return { loaded: false, count: 0 };
  } catch {
    // source catalog is optional; ignore load errors
    updateSourceStatus(false);
    return { loaded: false, count: 0 };
  }
}

async function notifySourceCatalogStatusOnStartup() {
  const result = await loadSourceCatalog();
  if (result.loaded) {
    window.alert(`Source catalog loaded from ${result.sourcePath} (${result.format}) with ${result.count} entries.`);
  }
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
        <strong>Product Code:</strong> ${item.code || "-"}<br />
        <strong>Barcode:</strong> ${item.barcode || "-"}<br />
        <strong>Avg Cost:</strong> ${item.avgCost || "-"}<br />
        <strong>Description:</strong> ${item.description || "-"}<br />
        <strong>Carton:</strong> ${item.carton || "-"}<br />
        <strong>Carton Size:</strong> ${item.cartonSize || "-"}<br />
        <strong>Single:</strong> ${item.single || "-"}<br />
        <strong>Total Units:</strong> ${calculateItemTotal(item)}<br />
        <strong>Total Cost:</strong> ${calculateTotalCost(item).toFixed(2)}<br />
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
  editForm.elements.barcode.value = item.barcode || "";
  editForm.elements.avgCost.value = item.avgCost || "";
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

function openSourceMenu() {
  sourceMenuBackdrop.classList.remove("hidden");
}

function closeSourceMenu() {
  sourceMenuBackdrop.classList.add("hidden");
}

function openOutputMenu() {
  outputMenuBackdrop.classList.remove("hidden");
}

function closeOutputMenu() {
  outputMenuBackdrop.classList.add("hidden");
}

function setCellVisualMode(cell, lockButton, inactive) {
  const actionButtons = cell.querySelectorAll(".cell-action");
  const tagInput = cell.querySelector(".cell-tag-input");

  cell.dataset.mode = inactive ? "inactive" : "active";
  cell.classList.toggle("inactive", inactive);
  cell.classList.toggle("is-selected", false);

  lockButton.classList.toggle("is-locked", inactive);
  lockButton.textContent = inactive ? "🔒" : "🔓";

  actionButtons.forEach((button) => {
    button.disabled = inactive;
  });

  if (tagInput) {
    tagInput.disabled = inactive;
  }
}

function createCell(x, y) {
  const coordinate = toCoordinate(x, y);
  const existingItems = getItemsByCoordinate(coordinate);

  const cell = document.createElement("div");
  cell.className = "grid-cell";
  if (existingItems.length > 0) {
    cell.classList.add("has-data");
  }
  cell.dataset.x = String(x);
  cell.dataset.y = String(y);
  cell.dataset.coordinate = coordinate;
  cell.setAttribute("tabindex", "0");
  cell.setAttribute("aria-label", `Inventory slot ${coordinate}`);

  const label = document.createElement("span");
  label.className = "cell-coordinate";
  label.textContent = coordinate;

  const cellTagInput = document.createElement("input");
  cellTagInput.type = "text";
  cellTagInput.className = "cell-tag-input";
  cellTagInput.maxLength = 24;
  cellTagInput.value = getCellLabel(currentAisleId, x, y) || "Label";

  const lockButton = document.createElement("button");
  lockButton.type = "button";
  lockButton.className = "lock-toggle";

  const buttonWrap = document.createElement("div");
  buttonWrap.className = "cell-buttons";

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "cell-action";
  viewButton.textContent = "View";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "cell-action";
  editButton.textContent = "Edit";

  const saveTag = () => {
    const nextValue = cellTagInput.value.trim() || "Label";
    cellTagInput.value = nextValue;
    if (nextValue.toLowerCase() === "label") {
      setCellLabel(currentAisleId, x, y, "");
    } else {
      setCellLabel(currentAisleId, x, y, nextValue);
    }
    saveState();
  };

  cellTagInput.addEventListener("click", (event) => {
    event.stopPropagation();
    cellTagInput.select();
  });

  cellTagInput.addEventListener("blur", saveTag);
  cellTagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      cellTagInput.blur();
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
    if (event.target.closest("button") || event.target.closest("input") || cell.dataset.mode === "inactive") {
      return;
    }
    cell.classList.toggle("is-selected");
  });

  buttonWrap.appendChild(viewButton);
  buttonWrap.appendChild(editButton);

  cell.appendChild(label);
  cell.appendChild(cellTagInput);
  cell.appendChild(lockButton);
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
    barcode: formData.get("barcode")?.toString().trim() || "",
    avgCost: formData.get("avgCost")?.toString().trim() || "",
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
openSourceMenuButton.addEventListener("click", openSourceMenu);
closeSourceMenuButton.addEventListener("click", closeSourceMenu);
closeSourceMenuTopButton.addEventListener("click", closeSourceMenu);
openOutputMenuButton.addEventListener("click", openOutputMenu);
closeOutputMenuButton.addEventListener("click", closeOutputMenu);
closeOutputMenuTopButton.addEventListener("click", closeOutputMenu);
barcodeLookupButton.addEventListener("click", async () => {
  const barcode = normalizeBarcode(editForm.elements.barcode.value);
  if (!barcode) {
    window.alert("Enter a barcode first.");
    return;
  }

  let match = sourceCatalogByScanCode.get(barcode);
  if (!match) {
    await loadSourceCatalog();
    match = sourceCatalogByScanCode.get(barcode);
  }
  if (!match) {
    const shouldAdd = window.confirm("Barcode doesn't exist, add it to the source?");
    if (!shouldAdd) {
      window.alert("Barcode not found in source catalog.");
      return;
    }

    const code = editForm.elements.code.value?.trim() || "";
    const description = editForm.elements.description.value?.trim() || "";
    const cartonSize = editForm.elements.cartonSize.value?.trim() || "";
    const avgCost = editForm.elements.avgCost.value?.trim() || "";

    if (!code || !description || !cartonSize) {
      window.alert("To add a missing barcode, fill Product Code, Description, and Carton Size first.");
      return;
    }

    const newEntry = { barcode, outerBarcode: "", code, description, cartonSize, avgCost };
    sourceCatalogByBarcode.set(barcode, newEntry);
    sourceCatalogByScanCode.set(barcode, newEntry);
    updateSourceStatus(true);
    const saveResult = await persistUpdatedSourceCatalog();
    if (saveResult.mode === "remote-saved") {
      window.alert(`Barcode added and source catalog saved to Source Save URL using ${saveResult.method}.`);
      return;
    }
    if (saveResult.mode === "downloaded-fallback") {
      window.alert(`Barcode added. Could not save to Source Save URL (${saveResult.reason || "unknown error"}). Downloaded updated source file instead.`);
      return;
    }
    window.alert("Barcode added. Downloaded updated source file.");
    return;
  }

  editForm.elements.code.value = match.code || editForm.elements.code.value;
  editForm.elements.description.value = match.description || editForm.elements.description.value;
  editForm.elements.cartonSize.value = match.cartonSize || editForm.elements.cartonSize.value;
  editForm.elements.avgCost.value = match.avgCost || editForm.elements.avgCost.value;
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
  const header = ["Aisle", "Coordinate", "Product Code", "Barcode", "Description", "Carton", "Carton Size", "Single", "Total Units", "Avg Cost", "Total Cost", "Date", "Notes"];
  const lines = [header.join(",")];

  inventoryItems.forEach((item) => {
    const aisleName = aisles.find((entry) => entry.id === item.aisleId)?.name || "";
    lines.push([
      escapeCsv(aisleName),
      escapeCsv(item.coordinate),
      escapeCsv(item.code),
      escapeCsv(item.barcode),
      escapeCsv(item.description),
      escapeCsv(item.carton),
      escapeCsv(item.cartonSize),
      escapeCsv(item.single),
      escapeCsv(calculateItemTotal(item)),
      escapeCsv(item.avgCost),
      escapeCsv(calculateTotalCost(item).toFixed(2)),
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

loadSourceCsvButton.addEventListener("click", () => {
  sourceFileInput.click();
});

loadSourceUrlButton.addEventListener("click", async () => {
  const sourceUrl = sourceUrlInput?.value?.trim() || "";
  if (!sourceUrl) {
    window.alert("Enter a source URL first.");
    return;
  }

  const result = await loadSourceCatalog();
  if (result.loaded) {
    window.alert(`Source URL loaded (${result.format}): ${result.count} entries.`);
    return;
  }

  window.alert("Could not load source URL. Check URL and CORS settings.");
});

testSourceSaveUrlButton.addEventListener("click", async () => {
  const saveUrl = sourceSaveUrlInput?.value?.trim() || "";
  if (!saveUrl) {
    window.alert("Enter a Source Save URL first.");
    return;
  }

  const payload = getSourceSavePayload(saveUrl);
  const result = await attemptRemoteSourceSave(saveUrl, payload);
  if (result.ok) {
    window.alert(`Save URL test succeeded using ${result.method}.`);
    localStorage.setItem(SOURCE_SAVE_URL_KEY, saveUrl);
    return;
  }

  window.alert(`Save URL test failed: ${result.reason || "Unknown error"}`);
});

sourceFileInput.addEventListener("change", async () => {
  const file = sourceFileInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const looksJson = file.name.toLowerCase().endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[");
    const parsedCount = looksJson
      ? parseSourceCatalogJson(text)
      : parseSourceCatalogCsv(text);
    if (!parsedCount) {
      updateSourceStatus(false);
      window.alert("Source file loaded but no valid barcode entries were found.");
      return;
    }
    if (looksJson) {
      updateSourceStatus(true, "JSON");
    } else {
      updateSourceStatus(true, "CSV");
    }
    window.alert(`Source file loaded: ${sourceCatalogByBarcode.size} entries.`);
  } catch {
    updateSourceStatus(false);
    window.alert("Invalid source file (CSV/JSON).");
  }

  sourceFileInput.value = "";
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
    const [aisleName = "Inventory", coordinate = "", code = "", maybeBarcodeOrDescription = "", maybeDescriptionOrCarton = "", maybeCartonOrCartonSize = "", maybeCartonSizeOrSingle = "", maybeSingleOrTotal = "", maybeTotalOrAvgCost = "", maybeAvgCostOrTotalCostOrDate = "", maybeTotalCostOrDateOrNotes = "", maybeDateOrNotes = "", maybeNotes = ""] = columns;

    const aisle = ensureAisleByName(aisleName || "Inventory");
    const hasCostColumns = columns.length >= 13;
    const hasBarcodeColumn = columns.length >= 11;
    const barcode = hasBarcodeColumn ? maybeBarcodeOrDescription : "";
    const description = hasBarcodeColumn ? maybeDescriptionOrCarton : maybeBarcodeOrDescription;
    const carton = hasBarcodeColumn ? maybeCartonOrCartonSize : maybeDescriptionOrCarton;
    const cartonSize = hasBarcodeColumn ? maybeCartonSizeOrSingle : maybeCartonOrCartonSize;
    const single = hasBarcodeColumn ? maybeSingleOrTotal : maybeCartonSizeOrSingle;
    const avgCost = hasCostColumns ? maybeAvgCostOrTotalCostOrDate : "";
    const date = hasCostColumns
      ? maybeDateOrNotes
      : hasBarcodeColumn
        ? maybeAvgCostOrTotalCostOrDate
        : maybeTotalOrAvgCost;
    const notes = hasCostColumns
      ? maybeNotes
      : hasBarcodeColumn
        ? maybeTotalCostOrDateOrNotes
        : maybeAvgCostOrTotalCostOrDate;

    inventoryItems.push({
      aisleId: aisle.id,
      coordinate,
      code,
      barcode,
      avgCost,
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

resetCellDataButton.addEventListener("click", () => {
  const confirmed = window.confirm("Reset all current cell data (items, labels, lock states) and keep aisles?");
  if (!confirmed) {
    return;
  }

  inventoryItems.length = 0;
  cellModes.clear();
  cellLabels.clear();

  renderGrid();
  saveState();
  window.alert("Cell data has been reset. Aisles were kept.");
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
const savedSourceUrl = localStorage.getItem(SOURCE_URL_KEY);
if (sourceUrlInput && savedSourceUrl) {
  sourceUrlInput.value = savedSourceUrl;
}
const savedSourceSaveUrl = localStorage.getItem(SOURCE_SAVE_URL_KEY);
if (sourceSaveUrlInput && savedSourceSaveUrl) {
  sourceSaveUrlInput.value = savedSourceSaveUrl;
}
notifySourceCatalogStatusOnStartup();
loadState();
renderAisleSelect();
renderGrid();
