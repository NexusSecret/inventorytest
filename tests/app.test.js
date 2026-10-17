const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element() {
  return {
    classList:{ add() {}, remove() {} }, dataset:{}, hidden:false, disabled:false,
    textContent:"", innerHTML:"", value:"", files:[],
    addEventListener() {}, querySelector() { return element(); }, scrollIntoView() {}
  };
}

const context = {
  console, Intl, Map, Blob, URL, TextDecoder, Uint8Array, DataView, Response,
  window:{ location:{ protocol:"file:" }, print() {} },
  document:{ querySelector:() => element(), createElement:() => element() },
  fetch:async () => ({ ok:false })
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);

const comma = context.parseCSV("Code,Name,Quantity\nA-1,Widget,25\n");
assert.deepEqual(Array.from(comma[1]), ["A-1", "Widget", "25"]);

const semicolon = context.parseCSV("sep=;\nCode;Name;Quantity\nA-1;Widget;25\n");
assert.deepEqual(Array.from(semicolon[1]), ["A-1", "Widget", "25"]);

const tabbed = context.parseCSV("Code\tName\tQuantity\nA-1\tWidget\t25\n");
assert.deepEqual(Array.from(tabbed[1]), ["A-1", "Widget", "25"]);

const rows = context.parseCSV("Inventory export\nGenerated today\nCode,Name,Quantity\nA-1,Widget,25\n");
const header = context.findHeader(rows, ["item", "quantity"]);
assert.equal(header.dataRows[0][0], "A-1");

const source = context.parseCSV("Aisle,Coordinate,Product Code,Barcode,Description,Carton,Carton Size,Single,Total Units\nA,1,A-1,123,Widget,0,12,0,25\n");
const sourceMap = context.sourceRowsToMap(source);
assert.equal(sourceMap.get("a-1").cartonCount, 12);
assert.equal(sourceMap.get("a-1").description, "Widget");

const wideUppercase = context.parseCSV("SHEET_TITLE,ORDER_ID,WEEK_BEGIN,NAME,CCC_NAME,CCC_TYPE,SIZE,UNITS,DAY,CODE,QUANTITY,Pantry,Opt In(true)/Extra(false)\nOrder,42,2026-08-25,Widget,CCC,A,Large,Each,Mon,A-1,25,true,false\n");
const wideHeader = context.findHeader(wideUppercase, ["item", "quantity"]);
assert.equal(wideHeader.columns.item, 9);
assert.equal(wideHeader.columns.description, 3);
assert.equal(wideHeader.columns.quantity, 10);
assert.deepEqual(Array.from(wideHeader.dataRows[0].slice(9, 11)), ["A-1", "25"]);

const utf16 = Buffer.from("Code,Name,Quantity\nA-1,Widget,25\n", "utf16le");
const bomBuffer = Buffer.concat([Buffer.from([0xff, 0xfe]), utf16]);
assert.match(context.decodeCSV(bomBuffer), /Code,Name,Quantity/);

assert.equal(context.itemGroup({ itemNumber:"LH100" }), "left");
assert.equal(context.itemGroup({ itemNumber:"BK4118" }), "left");
assert.equal(context.itemGroup({ itemNumber:"BK4119" }), "other");
assert.equal(context.itemGroup({ itemNumber:"SMP20" }), "topRight");
assert.equal(context.itemGroup({ itemNumber:"CHP20" }), "topRight");
assert.equal(context.itemGroup({ itemNumber:"SD20" }), "bottomRight");

function storedZip(name, contents) {
  const filename = Buffer.from(name); const data = Buffer.from(contents);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28);
  const directoryOffset = local.length + filename.length + data.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(directoryOffset, 16);
  return Buffer.concat([local, filename, data, central, filename, end]);
}

(async () => {
  const zip = storedZip("orders.csv", "Code,Name,Quantity\nLH100,Widget,25\n");
  const files = await context.extractZipCSVs({ name:"orders.zip", arrayBuffer:async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) });
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "orders.zip / orders.csv");
  assert.match(context.decodeCSV(await files[0].arrayBuffer()), /LH100,Widget,25/);
  console.log("CSV, ZIP, inventory mapping, and print grouping tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
