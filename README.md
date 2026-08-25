# Carton Compiler

A lightweight, browser-based inventory compiler. Upload one or more CSV exports and
the app combines matching item numbers, totals their quantities, and uses the carton
size stored in the source data to calculate the cartons required.

## Run locally

No build step or server-side dependencies are required:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Expected CSV columns

The compiler automatically recognizes common alternatives for these fields:

| Field | Examples |
| --- | --- |
| Product code | `Code`, `Product Code`, `Item Number`, `SKU`, `Item` |
| Description | `Description`, `Item Description`, `Product Name` |
| Quantity | `Quantity`, `Qty`, `Units`, `Order Qty` |
| Carton size | `Carton Size`, `Case Pack`, `Units Per Carton`, `Pack Size` |

The inventory reference must be named `source.json` or `source.csv` and live in the
same folder as `index.html`. The app automatically tries `source.json` first and then
`source.csv`. The source columns are `Product Code`, `Description`, `Carton`,
`Single`, and `Carton Size`; `Carton Size` (also accepted as `Carton Count`) is the
number of units in a full carton.
The included `source.csv` is a header template that can be replaced with inventory
data. For JSON, use an array of objects with the same property names (or an object
with that array under `items`).

When the page is opened directly from the filesystem (`file://`), browser security
prevents JavaScript from automatically reading another local file. In that case, use
the **Choose source** button shown in the app. Automatic loading works when the app
is served with the local server command above.

Uploaded quantity files must include `Code` and `Quantity`; `Name` is optional. The
compiler maps `Code` to the source `Product Code`, uses the source description and
carton count, and clearly flags product codes with no source match. CSV processing
is performed entirely in the browser and uploaded data is not sent anywhere.

CSV imports automatically detect comma, semicolon, or tab delimiters, Excel `sep=`
hints, UTF-8/UTF-16 encoding, and up to 14 informational rows before the actual
column header. Header matching is case-insensitive, and column positions do not
matter: `NAME`, `CODE`, and `QUANTITY` are recognized wherever they appear.

In the compiled output, `Code` becomes `Product Code` and `Name` becomes
`Description`. Quantity is divided by the stored carton size: complete cases are
written to `Carton`, while the remainder is written to `Single` (for example, a
quantity of 25 with a carton size of 12 produces 2 cartons and 1 single).
