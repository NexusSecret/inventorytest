# Inventory Management system

This repository now includes a simple aisle-aware inventory data model that supports:

- Multiple aisles (for example `Widgets` with prefix `W`, and `Gadgets` with prefix `G`)
- Aisle-specific coordinates (`W1`, `W2`, `G1`, `G2`, ...)
- Exporting **all aisles to one CSV file**
- Importing that same CSV file back into the system

## Data model

- `InventorySystem` is the top-level container.
- `Aisle` is the container for cells and owns a coordinate prefix.
- `Cell` stores `coordinate`, `item`, and `quantity`.

## Example usage

```python
from inventory import InventorySystem

system = InventorySystem()
system.add_aisle("Widgets", "W")
system.add_aisle("Gadgets", "G")

system.set_cell("Widgets", "1", "Widget Screw", 12)   # stored as W1
system.set_cell("Gadgets", "G2", "Gadget Spring", 8)  # stored as G2

system.export_csv("inventory.csv")

loaded = InventorySystem()
loaded.import_csv("inventory.csv")
```

## CSV format

The export/import schema is:

- `aisle`
- `prefix`
- `coordinate`
- `item`
- `quantity`

All aisles are saved into the same CSV file.

## Tests

```bash
python3 -m unittest discover -s tests -p "test_*.py"
```
