const state = { files: [], compiled: [] };

const fieldAliases = {
  item: ["itemnumber", "itemno", "sku", "item", "productcode", "productid", "partnumber"],
  description: ["description", "itemdescription", "productname", "name"],
  quantity: ["quantity", "qty", "units", "orderqty", "orderquantity", "unitcount"],
  carton: ["cartonsize", "casepack", "unitspercarton", "unitspercase", "packsize", "casequantity", "caseqty"]
};

const elements = {
  fileInput: document.querySelector("#fileInput"), dropZone: document.querySelector("#dropZone"),
  fileList: document.querySelector("#fileList"), message: document.querySelector("#message"),
  clear: document.querySelector("#clearButton"), compile: document.querySelector("#compileButton"),
  results: document.querySelector("#results"), body: document.querySelector("#resultsBody")
};

function parseCSV(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = "";
    } else value += char;
  }
  row.push(value); if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

const normalize = value => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const cleanNumber = value => Number(String(value || "").replace(/[$,\s]/g, ""));
const formatNumber = value => new Intl.NumberFormat().format(value);

function identifyColumns(headers) {
  const normalized = headers.map(normalize); const found = {};
  Object.entries(fieldAliases).forEach(([field, aliases]) => { found[field] = normalized.findIndex(header => aliases.includes(header)); });
  return found;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
}

function addFiles(files) {
  const incoming = [...files].filter(file => file.name.toLowerCase().endsWith(".csv"));
  const existing = new Set(state.files.map(file => `${file.name}-${file.size}-${file.lastModified}`));
  incoming.forEach(file => { if (!existing.has(`${file.name}-${file.size}-${file.lastModified}`)) state.files.push(file); });
  if (incoming.length !== files.length) showMessage("Only CSV files can be added."); else hideMessage();
  renderFiles();
}

function renderFiles() {
  elements.fileList.innerHTML = state.files.map((file, index) => `<div class="file-card"><span class="file-type">CSV</span><div class="file-details"><strong>${escapeHTML(file.name)}</strong><span>${(file.size / 1024).toFixed(1)} KB</span></div><button class="remove-file" data-index="${index}" aria-label="Remove ${escapeHTML(file.name)}">×</button></div>`).join("");
  elements.clear.disabled = !state.files.length; elements.compile.disabled = !state.files.length;
}

function showMessage(message) { elements.message.textContent = message; elements.message.hidden = false; }
function hideMessage() { elements.message.hidden = true; }

async function compileFiles() {
  const items = new Map(); const errors = []; const warnings = [];
  for (const file of state.files) {
    const rows = parseCSV(await file.text());
    if (rows.length < 2) { errors.push(`${file.name} has no inventory rows.`); continue; }
    const columns = identifyColumns(rows[0]);
    if (columns.item < 0 || columns.quantity < 0) { errors.push(`${file.name} needs item number and quantity columns.`); continue; }
    rows.slice(1).forEach((row, rowIndex) => {
      const itemNumber = (row[columns.item] || "").trim();
      if (!itemNumber) return;
      const quantity = cleanNumber(row[columns.quantity]);
      if (!Number.isFinite(quantity)) { warnings.push(`${file.name}, row ${rowIndex + 2}: invalid quantity.`); return; }
      const cartonValue = columns.carton >= 0 ? cleanNumber(row[columns.carton]) : 0;
      const cartonSize = Number.isFinite(cartonValue) && cartonValue > 0 ? cartonValue : 0;
      const description = columns.description >= 0 ? (row[columns.description] || "").trim() : "";
      const key = itemNumber.toLowerCase(); const existing = items.get(key);
      if (existing) {
        existing.quantity += quantity;
        if (!existing.description && description) existing.description = description;
        if (!existing.cartonSize && cartonSize) existing.cartonSize = cartonSize;
        else if (cartonSize && existing.cartonSize !== cartonSize) existing.conflict = true;
      } else items.set(key, { itemNumber, description, quantity, cartonSize, conflict:false });
    });
  }
  if (errors.length) { showMessage(errors.join(" ")); return; }
  state.compiled = [...items.values()].sort((a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric:true }));
  if (!state.compiled.length) { showMessage("No valid inventory items were found in these files."); return; }
  renderResults();
  showMessage(warnings.length ? `${warnings.length} row(s) with invalid quantities were skipped.` : "");
  if (!warnings.length) hideMessage();
}

function renderResults() {
  elements.body.innerHTML = state.compiled.map(item => {
    const cartons = item.cartonSize ? Math.ceil(item.quantity / item.cartonSize) : null;
    const loose = item.cartonSize ? item.quantity % item.cartonSize : null;
    const cartonTitle = item.conflict ? ' title="Conflicting carton sizes found; the first stored value was used"' : "";
    return `<tr><td><strong>${escapeHTML(item.itemNumber)}</strong></td><td>${escapeHTML(item.description || "—")}</td><td class="numeric">${formatNumber(item.quantity)}</td><td class="numeric${item.cartonSize ? "" : " missing"}"${cartonTitle}>${item.cartonSize ? formatNumber(item.cartonSize) + (item.conflict ? " ⚠" : "") : "Missing"}</td><td class="numeric${cartons === null ? " missing" : ""}">${cartons === null ? "—" : formatNumber(cartons)}</td><td class="numeric">${loose === null ? "—" : formatNumber(loose)}</td></tr>`;
  }).join("");
  const totalUnits = state.compiled.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartons = state.compiled.reduce((sum, item) => sum + (item.cartonSize ? Math.ceil(item.quantity / item.cartonSize) : 0), 0);
  document.querySelector("#itemCount").textContent = formatNumber(state.compiled.length);
  document.querySelector("#unitCount").textContent = formatNumber(totalUnits);
  document.querySelector("#cartonCount").textContent = formatNumber(totalCartons);
  document.querySelector("#resultsSubtitle").textContent = `${state.files.length} file${state.files.length === 1 ? "" : "s"} combined successfully.`;
  elements.results.hidden = false; elements.results.scrollIntoView({ behavior:"smooth", block:"start" });
}

function downloadResults() {
  const quote = value => `"${String(value).replace(/"/g, '""')}"`;
  const header = ["Item Number", "Description", "Total Units", "Carton Size", "Cartons Needed", "Loose Units"];
  const lines = state.compiled.map(item => [item.itemNumber, item.description, item.quantity, item.cartonSize || "", item.cartonSize ? Math.ceil(item.quantity / item.cartonSize) : "", item.cartonSize ? item.quantity % item.cartonSize : ""].map(quote).join(","));
  const url = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\r\n")], { type:"text/csv" }));
  const link = document.createElement("a"); link.href = url; link.download = `compiled-inventory-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
}

elements.fileInput.addEventListener("change", event => { addFiles(event.target.files); event.target.value = ""; });
["dragenter", "dragover"].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove("dragging"); }));
elements.dropZone.addEventListener("drop", event => addFiles(event.dataTransfer.files));
elements.fileList.addEventListener("click", event => { const button = event.target.closest(".remove-file"); if (button) { state.files.splice(Number(button.dataset.index), 1); renderFiles(); } });
elements.clear.addEventListener("click", () => { state.files = []; state.compiled = []; elements.results.hidden = true; hideMessage(); renderFiles(); });
elements.compile.addEventListener("click", compileFiles);
document.querySelector("#downloadButton").addEventListener("click", downloadResults);
