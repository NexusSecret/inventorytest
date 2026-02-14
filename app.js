const MAX_X = 11;
const MAX_Y = 5;
const PLACEHOLDER = "X";

const grid = document.getElementById("inventory-grid");
const exportCsvButton = document.getElementById("export-csv");
const importCsvButton = document.getElementById("import-csv");
const csvFileInput = document.getElementById("csv-file-input");

const modalBackdrop = document.getElementById("modal-backdrop");
const editModal = document.getElementById("edit-modal");
const viewModal = document.getElementById("view-modal");
const editCoordinateLabel = document.getElementById("edit-coordinate");
const viewCoordinateLabel = document.getElementById("view-coordinate");
const editItemsList = document.getElementById("edit-items-list");
const viewItemsList = document.getElementById("view-items-list");
const editForm = document.getElementById("edit-form");
const closeEditButton = document.getElementById("close-edit");
const closeViewButton = document.getElementById("close-view");

let currentEditCoordinate = null;
const inventoryItems = [];

function toCoordinate(x, y) {
  return `${PLACEHOLDER}${String(x).padStart(2, "0")}${String(y).padStart(2, "0")}`;
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

function getItemsByCoordinate(coordinate) {
  return inventoryItems.filter((item) => item.coordinate === coordinate);
}

function renderItemsList(target, coordinate) {
  const items = getItemsByCoordinate(coordinate);

  if (items.length === 0) {
    target.innerHTML = "<p>No items in this slot yet.</p>";
    return;
  }

  target.innerHTML = items
    .map(
      (item, idx) => `
      <div class="item-row">
        <strong>Item ${idx + 1}</strong><br />
        <strong>Code:</strong> ${item.code || "-"}<br />
        <strong>Carton:</strong> ${item.carton || "-"}<br />
        <strong>Single:</strong> ${item.single || "-"}<br />
        <strong>Date:</strong> ${item.date || "-"}<br />
        <strong>Notes:</strong> ${item.notes || "-"}
      </div>
    `,
    )
    .join("");
}

function openModal(modal) {
  modalBackdrop.classList.remove("hidden");
  modal.classList.remove("hidden");
}

function closeModals() {
  modalBackdrop.classList.add("hidden");
  editModal.classList.add("hidden");
  viewModal.classList.add("hidden");
}

function setCellMode(cell, lockButton, inactive) {
  const actionButtons = cell.querySelectorAll(".cell-action");

  cell.dataset.mode = inactive ? "inactive" : "active";
  cell.classList.toggle("inactive", inactive);
  cell.classList.toggle("is-selected", false);

  lockButton.classList.toggle("is-locked", inactive);
  lockButton.textContent = inactive ? "🔒" : "🔓";
  lockButton.title = inactive ? "Unlock cell" : "Lock cell";
  lockButton.setAttribute("aria-label", inactive ? "Unlock cell" : "Lock cell");

  actionButtons.forEach((button) => {
    button.disabled = inactive;
  });
}

function createCell(x, y) {
  const coordinate = toCoordinate(x, y);

  const cell = document.createElement("div");
  cell.className = "grid-cell";
  cell.dataset.coordinate = coordinate;
  cell.setAttribute("tabindex", "0");
  cell.setAttribute("aria-label", `Inventory slot ${coordinate}`);

  const label = document.createElement("span");
  label.className = "cell-coordinate";
  label.textContent = coordinate;

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

  viewButton.addEventListener("click", (event) => {
    event.stopPropagation();
    viewCoordinateLabel.textContent = coordinate;
    renderItemsList(viewItemsList, coordinate);
    openModal(viewModal);
  });

  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    currentEditCoordinate = coordinate;
    editCoordinateLabel.textContent = coordinate;
    renderItemsList(editItemsList, coordinate);
    openModal(editModal);
  });

  lockButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const currentlyInactive = cell.dataset.mode === "inactive";
    setCellMode(cell, lockButton, !currentlyInactive);
  });

  cell.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      return;
    }

    if (cell.dataset.mode === "inactive") {
      return;
    }

    cell.classList.toggle("is-selected");
  });

  buttonWrap.appendChild(viewButton);
  buttonWrap.appendChild(editButton);

  cell.appendChild(label);
  cell.appendChild(lockButton);
  cell.appendChild(buttonWrap);

  setCellMode(cell, lockButton, false);

  return cell;
}

editForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentEditCoordinate) {
    return;
  }

  const formData = new FormData(editForm);
  inventoryItems.push({
    coordinate: currentEditCoordinate,
    code: formData.get("code")?.toString().trim() || "",
    carton: formData.get("carton")?.toString().trim() || "",
    single: formData.get("single")?.toString().trim() || "",
    date: formData.get("date")?.toString().trim() || "",
    notes: formData.get("notes")?.toString().trim() || "",
  });

  editForm.reset();
  renderItemsList(editItemsList, currentEditCoordinate);
});

closeEditButton.addEventListener("click", closeModals);
closeViewButton.addEventListener("click", closeModals);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) {
    closeModals();
  }
});

exportCsvButton.addEventListener("click", () => {
  const header = ["Coordinate", "Code", "Carton", "Single", "Date", "Notes"];
  const lines = [header.join(",")];

  inventoryItems.forEach((item) => {
    lines.push([
      escapeCsv(item.coordinate),
      escapeCsv(item.code),
      escapeCsv(item.carton),
      escapeCsv(item.single),
      escapeCsv(item.date),
      escapeCsv(item.notes),
    ].join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "inventory-items.csv";
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
    const [coordinate = "", code = "", carton = "", single = "", date = "", notes = ""] = parseCsvLine(rows[index]);
    inventoryItems.push({ coordinate, code, carton, single, date, notes });
  }

  if (currentEditCoordinate) {
    renderItemsList(editItemsList, currentEditCoordinate);
  }

  csvFileInput.value = "";
});

for (let y = MAX_Y; y >= 0; y -= 1) {
  for (let x = 0; x <= MAX_X; x += 1) {
    grid.appendChild(createCell(x, y));
  }
}
