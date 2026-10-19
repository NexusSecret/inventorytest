const state = { files: [], compiled: [], sourceItems: new Map(), sourceFile: "" };

const fieldAliases = {
  item: ["productcode", "code", "itemnumber", "itemno", "sku", "item", "productid", "partnumber"],
  description: ["description", "itemdescription", "productname", "name"],
  quantity: ["quantity", "qty", "units", "orderqty", "orderquantity", "unitcount"],
  carton: ["cartoncount", "cartonsize", "casepack", "unitspercarton", "unitspercase", "packsize", "casequantity", "caseqty"]
};

const elements = {
  fileInput: document.querySelector("#fileInput"), dropZone: document.querySelector("#dropZone"),
  fileList: document.querySelector("#fileList"), message: document.querySelector("#message"),
  clear: document.querySelector("#clearButton"), compile: document.querySelector("#compileButton"),
  results: document.querySelector("#results")
};

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).filter(line => line.trim()).slice(0, 5).join("\n");
  const counts = [[",", 0], [";", 0], ["\t", 0]]; let quoted = false;
  for (const char of sample) {
    if (char === '"') quoted = !quoted;
    else if (!quoted) counts.forEach(entry => { if (char === entry[0]) entry[1] += 1; });
  }
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] ? counts[0][0] : ",";
}

function parseCSV(rawText) {
  let text = rawText.replace(/^\uFEFF/, "");
  const separatorHint = text.match(/^sep=(.)\s*(?:\r?\n)/i);
  const delimiter = separatorHint?.[1] || detectDelimiter(text);
  if (separatorHint) text = text.slice(separatorHint[0].length);
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = "";
    } else value += char;
  }
  row.push(value); if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

const normalize = value => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const cleanNumber = value => {
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
};
const formatNumber = value => new Intl.NumberFormat().format(value);

function decodeCSV(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
  const zeroes = bytes.slice(0, 100).filter(byte => byte === 0).length;
  return new TextDecoder(zeroes > 10 ? "utf-16le" : "utf-8").decode(buffer);
}

function findHeader(rows, requiredFields) {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const columns = identifyColumns(rows[index]);
    if (requiredFields.every(field => columns[field] >= 0)) return { columns, dataRows:rows.slice(index + 1) };
  }
  return null;
}

function sourceRowsToMap(rows) {
  const header = findHeader(rows, ["item", "carton"]);
  if (!header) throw new Error("The source needs Product Code and Carton Size columns.");
  const { columns, dataRows } = header;
  const source = new Map();
  dataRows.forEach(row => {
    const productCode = (row[columns.item] || "").trim();
    const cartonValue = cleanNumber(row[columns.carton]);
    if (!productCode) return;
    source.set(productCode.toLowerCase(), {
      productCode,
      description:columns.description >= 0 ? (row[columns.description] || "").trim() : "",
      cartonCount:Number.isFinite(cartonValue) && cartonValue > 0 ? cartonValue : 0
    });
  });
  return source;
}

function jsonToRows(data) {
  const records = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(records)) throw new Error("source.json must be an array or contain an items array.");
  const headers = ["Product Code", "Description", "Carton", "Single", "Carton Size"];
  return [headers, ...records.map(record => {
    const normalizedRecord = Object.fromEntries(Object.entries(record).map(([key, value]) => [normalize(key), value]));
    return headers.map(header => record[header] ?? normalizedRecord[normalize(header)] ?? "");
  })];
}

function setSourceStatus(filename) {
  const status = document.querySelector("#sourceStatus");
  status.classList.remove("error"); status.querySelector(".source-icon").textContent = "✓";
  status.querySelector("strong").textContent = `${filename} connected`;
  status.querySelector("small").textContent = `${state.sourceItems.size} product${state.sourceItems.size === 1 ? "" : "s"} available for carton lookup`;
}

async function useSource(filename, text) {
  const rows = filename.toLowerCase().endsWith(".json") ? jsonToRows(JSON.parse(text)) : parseCSV(text);
  state.sourceItems = sourceRowsToMap(rows); state.sourceFile = filename;
  setSourceStatus(filename);
}

async function loadInventorySource() {
  const status = document.querySelector("#sourceStatus");
  if (window.location.protocol === "file:") {
    status.classList.add("error"); status.querySelector(".source-icon").textContent = "!";
    status.querySelector("strong").textContent = "Choose your inventory source";
    status.querySelector("small").textContent = "Browsers cannot auto-load nearby files when index.html is opened directly.";
    return;
  }
  const attempts = ["source.json", "source.csv"];
  for (const filename of attempts) {
    try {
      const response = await fetch(filename, { cache:"no-store" });
      if (!response.ok) continue;
      await useSource(filename, decodeCSV(await response.arrayBuffer()));
      return;
    } catch (error) {
      status.dataset.error = error.message;
    }
  }
  status.classList.add("error"); status.querySelector(".source-icon").textContent = "!";
  status.querySelector("strong").textContent = "Inventory source unavailable";
  status.querySelector("small").textContent = status.dataset.error || "Add source.json or source.csv beside index.html, then refresh.";
}

function identifyColumns(headers) {
  const normalized = headers.map(normalize); const found = {};
  Object.entries(fieldAliases).forEach(([field, aliases]) => {
    found[field] = aliases.map(alias => normalized.indexOf(alias)).find(index => index >= 0) ?? -1;
  });
  return found;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
}

async function inflateZipEntry(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error(`Unsupported ZIP compression method ${method}.`);
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress ZIP files. Upload the CSV files directly instead.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractZipCSVs(file) {
  const buffer = await file.arrayBuffer(); const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
  let eocd = -1;
  for (let index = Math.max(0, bytes.length - 65557); index <= bytes.length - 22; index += 1) {
    if (view.getUint32(index, true) === 0x06054b50) eocd = index;
  }
  if (eocd < 0) throw new Error(`${file.name} is not a valid ZIP archive.`);
  const entryCount = view.getUint16(eocd + 10, true); let offset = view.getUint32(eocd + 16, true);
  if (entryCount > 500) throw new Error(`${file.name} contains too many files.`);
  const csvs = [];
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error(`${file.name} has an invalid ZIP directory.`);
    const flags = view.getUint16(offset + 8, true); const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true); const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder((flags & 0x800) ? "utf-8" : "windows-1252").decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name.toLowerCase().endsWith(".csv") && !name.startsWith("__MACOSX/")) {
      if (flags & 1) throw new Error(`${name} is encrypted and cannot be read.`);
      if (uncompressedSize > 100 * 1024 * 1024) throw new Error(`${name} is too large to import.`);
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`${name} has an invalid ZIP entry.`);
      const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = await inflateZipEntry(bytes.slice(dataStart, dataStart + compressedSize), method);
      csvs.push({ name:`${file.name} / ${name}`, size:data.byteLength, arrayBuffer:async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!csvs.length) throw new Error(`${file.name} does not contain any CSV files.`);
  return csvs;
}

async function expandInputFiles(files) {
  const expanded = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) expanded.push(...await extractZipCSVs(file));
    else expanded.push(file);
  }
  return expanded;
}

function addFiles(files) {
  const incoming = [...files].filter(file => /\.(csv|zip)$/i.test(file.name));
  const existing = new Set(state.files.map(file => `${file.name}-${file.size}-${file.lastModified}`));
  incoming.forEach(file => { if (!existing.has(`${file.name}-${file.size}-${file.lastModified}`)) state.files.push(file); });
  if (incoming.length !== files.length) showMessage("Only CSV and ZIP files can be added."); else hideMessage();
  renderFiles();
}

function renderFiles() {
  elements.fileList.innerHTML = state.files.map((file, index) => `<div class="file-card"><span class="file-type">${file.name.toLowerCase().endsWith(".zip") ? "ZIP" : "CSV"}</span><div class="file-details"><strong>${escapeHTML(file.name)}</strong><span>${(file.size / 1024).toFixed(1)} KB</span></div><button class="remove-file" data-index="${index}" aria-label="Remove ${escapeHTML(file.name)}">×</button></div>`).join("");
  elements.clear.disabled = !state.files.length; elements.compile.disabled = !state.files.length;
}

function showMessage(message) { elements.message.textContent = message; elements.message.hidden = false; }
function hideMessage() { elements.message.hidden = true; }

async function compileFiles() {
  const items = new Map(); const cartonLookup = new Map(); const errors = []; const warnings = []; const parsedFiles = []; const diagnostics = [];
  state.sourceItems.forEach((item, code) => cartonLookup.set(code, item.cartonCount));
  let inputFiles;
  try { inputFiles = await expandInputFiles(state.files); }
  catch (error) { showMessage(error.message); return; }
  for (const file of inputFiles) {
    const rows = parseCSV(decodeCSV(await file.arrayBuffer()));
    if (rows.length < 2) { errors.push(`${file.name} has no inventory rows.`); continue; }
    const header = findHeader(rows, ["item"]);
    const columns = header?.columns;
    if (!columns || (columns.quantity < 0 && columns.carton < 0)) {
      errors.push(`${file.name} needs a product code and either a quantity or carton size column.`); continue;
    }
    diagnostics.push({ file:file.name, rows:header.dataRows.length, codeColumn:rows[rows.length - header.dataRows.length - 1][columns.item], quantityColumn:columns.quantity >= 0 ? rows[rows.length - header.dataRows.length - 1][columns.quantity] : "" });
    parsedFiles.push({ file, rows:header.dataRows, columns });
    if (columns.carton >= 0) header.dataRows.forEach(row => {
      const itemNumber = (row[columns.item] || "").trim();
      if (!itemNumber) return;
      const cartonValue = cleanNumber(row[columns.carton]);
      if (Number.isFinite(cartonValue) && cartonValue > 0) cartonLookup.set(itemNumber.toLowerCase(), cartonValue);
    });
  }
  if (errors.length) { showMessage(errors.join(" ")); return; }
  let rowsWithCodes = 0; let rowsWithQuantities = 0;
  parsedFiles.forEach(({ file, rows, columns }) => {
    if (columns.quantity < 0) return;
    rows.forEach((row, rowIndex) => {
      const itemNumber = (row[columns.item] || "").trim();
      if (!itemNumber) return;
      rowsWithCodes += 1;
      const quantity = cleanNumber(row[columns.quantity]);
      if (!Number.isFinite(quantity)) { warnings.push(`${file.name}, row ${rowIndex + 2}: invalid quantity.`); return; }
      rowsWithQuantities += 1;
      const cartonValue = columns.carton >= 0 ? cleanNumber(row[columns.carton]) : 0;
      const cartonSize = Number.isFinite(cartonValue) && cartonValue > 0 ? cartonValue : (cartonLookup.get(itemNumber.toLowerCase()) || 0);
      const sourceItem = state.sourceItems.get(itemNumber.toLowerCase());
      const uploadedDescription = columns.description >= 0 ? (row[columns.description] || "").trim() : "";
      const description = sourceItem?.description || uploadedDescription;
      const key = itemNumber.toLowerCase(); const existing = items.get(key);
      if (existing) {
        existing.quantity += quantity;
        if (!existing.description && description) existing.description = description;
        if (!existing.cartonSize && cartonSize) existing.cartonSize = cartonSize;
        else if (cartonSize && existing.cartonSize !== cartonSize) existing.conflict = true;
      } else items.set(key, { itemNumber, description, quantity, cartonSize, conflict:false });
    });
  });
  state.compiled = [...items.values()].sort((a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric:true }));
  if (!state.compiled.length) {
    const detected = diagnostics.map(file => `${file.file}: detected ${file.codeColumn || "no code"}/${file.quantityColumn || "no quantity"} headers and ${file.rows} data rows`).join("; ");
    showMessage(`No items could be compiled. ${detected}. Rows containing a product code: ${rowsWithCodes}; rows containing a valid quantity: ${rowsWithQuantities}.`);
    return;
  }
  renderResults();
  showMessage(warnings.length ? `${warnings.length} row(s) with invalid quantities were skipped.` : "");
  if (!warnings.length) hideMessage();
}

function itemGroup(item) {
  const code = item.itemNumber.trim().toUpperCase();
  if (["SMP", "CHP"].some(prefix => code.startsWith(prefix))) return "topRight";
  if (code.startsWith("SD")) return "bottomRight";
  if (code !== "BK4119" && ["LH", "LA", "BK", "BR"].some(prefix => code.startsWith(prefix))) return "left";
  return "other";
}

function cartonBreakdown(item) {
  if (!item.cartonSize) return { cartons:0, singles:item.quantity };
  return {
    cartons:Math.floor(item.quantity / item.cartonSize),
    singles:item.quantity % item.cartonSize
  };
}

function itemRows(items) {
  if (!items.length) return '<p class="empty-group">No items</p>';
  return `<table><thead><tr><th>Code</th><th>Description</th><th class="numeric">Carton</th><th class="numeric">Single</th></tr></thead><tbody>${items.map(item => {
    const { cartons, singles } = cartonBreakdown(item);
    return `<tr><td><strong>${escapeHTML(item.itemNumber)}</strong></td><td>${escapeHTML(item.description || "—")}</td><td class="numeric">${formatNumber(cartons)}</td><td class="numeric">${formatNumber(singles)}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function renderResults() {
  const groups = { left:[], topRight:[], bottomRight:[], other:[] };
  state.compiled.forEach(item => groups[itemGroup(item)].push(item));
  document.querySelector("#leftItems").innerHTML = itemRows(groups.left);
  document.querySelector("#topRightItems").innerHTML = itemRows(groups.topRight);
  document.querySelector("#bottomRightItems").innerHTML = itemRows(groups.bottomRight);
  document.querySelector("#otherItems").innerHTML = itemRows(groups.other);
  document.querySelector("#otherGroup").hidden = !groups.other.length;
  const totalUnits = state.compiled.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartons = state.compiled.reduce((sum, item) => sum + (item.cartonSize ? Math.floor(item.quantity / item.cartonSize) : 0), 0);
  document.querySelector("#itemCount").textContent = formatNumber(state.compiled.length);
  document.querySelector("#unitCount").textContent = formatNumber(totalUnits);
  document.querySelector("#cartonCount").textContent = formatNumber(totalCartons);
  document.querySelector("#resultsSubtitle").textContent = `${state.files.length} file${state.files.length === 1 ? "" : "s"} combined successfully.`;
  elements.results.hidden = false; elements.results.scrollIntoView({ behavior:"smooth", block:"start" });
}

function downloadResults() {
  const quote = value => `"${String(value).replace(/"/g, '""')}"`;
  const header = ["Product Code", "Description", "Quantity", "Carton Size", "Carton", "Single"];
  const lines = state.compiled.map(item => {
    const { cartons, singles } = cartonBreakdown(item);
    return [item.itemNumber, item.description, item.quantity, item.cartonSize || "", cartons, singles].map(quote).join(",");
  });
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
document.querySelector("#printButton").addEventListener("click", () => window.print());
document.querySelector("#sourceInput").addEventListener("change", async event => {
  const [file] = event.target.files;
  if (!file) return;
  try { await useSource(file.name, decodeCSV(await file.arrayBuffer())); hideMessage(); }
  catch (error) { showMessage(`Could not read ${file.name}: ${error.message}`); }
  event.target.value = "";
});
loadInventorySource();
