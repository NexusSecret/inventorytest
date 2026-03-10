from __future__ import annotations

from dataclasses import dataclass, field
import csv
from pathlib import Path


@dataclass
class Cell:
    coordinate: str
    item: str
    quantity: int


@dataclass
class Aisle:
    name: str
    prefix: str
    cells: dict[str, Cell] = field(default_factory=dict)

    def _normalize_coordinate(self, coordinate: str) -> str:
        value = coordinate.strip().upper()
        if not value:
            raise ValueError("Coordinate cannot be empty.")

        if value.startswith(self.prefix):
            return value

        if value.isdigit():
            return f"{self.prefix}{value}"

        raise ValueError(
            f"Coordinate '{coordinate}' must start with prefix '{self.prefix}' or be numeric."
        )

    def set_cell(self, coordinate: str, item: str, quantity: int) -> Cell:
        normalized = self._normalize_coordinate(coordinate)
        if quantity < 0:
            raise ValueError("Quantity must be >= 0.")

        cell = Cell(coordinate=normalized, item=item, quantity=quantity)
        self.cells[normalized] = cell
        return cell


class InventorySystem:
    """Tracks multiple aisles and persists them into one CSV file."""

    def __init__(self) -> None:
        self.aisles: dict[str, Aisle] = {}

    def add_aisle(self, name: str, prefix: str) -> Aisle:
        if not name.strip():
            raise ValueError("Aisle name cannot be empty.")

        normalized_name = name.strip()
        normalized_prefix = prefix.strip().upper()

        if not normalized_prefix or not normalized_prefix.isalpha():
            raise ValueError("Aisle prefix must contain letters only.")

        if normalized_name in self.aisles:
            raise ValueError(f"Aisle '{normalized_name}' already exists.")

        aisle = Aisle(name=normalized_name, prefix=normalized_prefix)
        self.aisles[normalized_name] = aisle
        return aisle

    def set_cell(self, aisle_name: str, coordinate: str, item: str, quantity: int) -> Cell:
        if aisle_name not in self.aisles:
            raise KeyError(f"Unknown aisle '{aisle_name}'.")
        return self.aisles[aisle_name].set_cell(coordinate=coordinate, item=item, quantity=quantity)

    def export_csv(self, path: str | Path) -> None:
        output = Path(path)
        with output.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=["aisle", "prefix", "coordinate", "item", "quantity"],
            )
            writer.writeheader()

            for aisle_name in sorted(self.aisles):
                aisle = self.aisles[aisle_name]
                for coordinate in sorted(aisle.cells):
                    cell = aisle.cells[coordinate]
                    writer.writerow(
                        {
                            "aisle": aisle.name,
                            "prefix": aisle.prefix,
                            "coordinate": cell.coordinate,
                            "item": cell.item,
                            "quantity": cell.quantity,
                        }
                    )

    def import_csv(self, path: str | Path) -> None:
        source = Path(path)
        self.aisles.clear()

        with source.open("r", newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            required = {"aisle", "prefix", "coordinate", "item", "quantity"}
            missing = required.difference(reader.fieldnames or [])
            if missing:
                raise ValueError(f"Missing required CSV columns: {', '.join(sorted(missing))}")

            for row in reader:
                aisle_name = row["aisle"].strip()
                prefix = row["prefix"].strip().upper()
                coordinate = row["coordinate"].strip().upper()
                item = row["item"]
                quantity = int(row["quantity"])

                if aisle_name not in self.aisles:
                    self.add_aisle(aisle_name, prefix)

                aisle = self.aisles[aisle_name]
                if aisle.prefix != prefix:
                    raise ValueError(
                        f"Aisle '{aisle_name}' has conflicting prefixes: '{aisle.prefix}' vs '{prefix}'."
                    )

                aisle.set_cell(coordinate=coordinate, item=item, quantity=quantity)
