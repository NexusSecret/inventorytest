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
| Item number | `Item Number`, `SKU`, `Item`, `Product Code` |
| Description | `Description`, `Item Description`, `Product Name` |
| Quantity | `Quantity`, `Qty`, `Units`, `Order Qty` |
| Carton size | `Carton Size`, `Case Pack`, `Units Per Carton`, `Pack Size` |

Every file must include an item number and quantity. Carton size may be blank; the
result will clearly flag those items instead of guessing a value. CSV processing is
performed entirely in the browser and uploaded data is not sent anywhere.
