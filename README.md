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

Quantity files must include a product code and quantity. A separate reference CSV
containing product codes and carton sizes is also supported; the compiler uses the
product code to look up the correct carton size. Missing matches are clearly flagged
instead of being guessed. CSV processing is performed entirely in the browser and
uploaded data is not sent anywhere.

In the compiled output, `Code` becomes `Product Code` and `Name` becomes
`Description`. Quantity is divided by the stored carton size: complete cases are
written to `Carton`, while the remainder is written to `Single` (for example, a
quantity of 25 with a carton size of 12 produces 2 cartons and 1 single).
