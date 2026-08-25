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
  console, Intl, Map, Blob, URL, TextDecoder, Uint8Array,
  window:{ location:{ protocol:"file:" } },
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

const utf16 = Buffer.from("Code,Name,Quantity\nA-1,Widget,25\n", "utf16le");
const bomBuffer = Buffer.concat([Buffer.from([0xff, 0xfe]), utf16]);
assert.match(context.decodeCSV(bomBuffer), /Code,Name,Quantity/);

console.log("CSV parser and inventory mappings passed");
