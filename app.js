const MAX_X = 11;
const MAX_Y = 5;
const PLACEHOLDER = "X";

const grid = document.getElementById("inventory-grid");

function toCoordinate(x, y) {
  return `${PLACEHOLDER}${String(x).padStart(2, "0")}${String(y).padStart(2, "0")}`;
}

function setCellMode(cell, lockButton, inactive) {
  cell.dataset.mode = inactive ? "inactive" : "active";
  cell.classList.toggle("inactive", inactive);
  cell.classList.toggle("is-selected", false);

  lockButton.classList.toggle("is-locked", inactive);
  lockButton.textContent = inactive ? "🔒" : "🔓";
  lockButton.title = inactive ? "Unlock cell" : "Lock cell";
  lockButton.setAttribute("aria-label", inactive ? "Unlock cell" : "Lock cell");
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

  setCellMode(cell, lockButton, false);

  lockButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const currentlyInactive = cell.dataset.mode === "inactive";
    setCellMode(cell, lockButton, !currentlyInactive);
  });

  cell.addEventListener("click", () => {
    if (cell.dataset.mode === "inactive") {
      return;
    }

    cell.classList.toggle("is-selected");
  });

  cell.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    if (cell.dataset.mode === "active") {
      cell.classList.toggle("is-selected");
    }
  });

  cell.appendChild(label);
  cell.appendChild(lockButton);
  return cell;
}

for (let y = MAX_Y; y >= 0; y -= 1) {
  for (let x = 0; x <= MAX_X; x += 1) {
    grid.appendChild(createCell(x, y));
  }
}
