import csv
import tempfile
import unittest
from pathlib import Path

from inventory import InventorySystem


class InventorySystemTests(unittest.TestCase):
    def test_multiple_aisles_export_to_same_csv(self) -> None:
        system = InventorySystem()
        system.add_aisle("Widgets", "W")
        system.add_aisle("Gadgets", "G")

        system.set_cell("Widgets", "1", "Widget Screw", 12)
        system.set_cell("Gadgets", "2", "Gadget Spring", 8)

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "inventory.csv"
            system.export_csv(output)

            with output.open("r", encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(2, len(rows))
        by_aisle = {row["aisle"]: row for row in rows}
        self.assertEqual("W1", by_aisle["Widgets"]["coordinate"])
        self.assertEqual("G2", by_aisle["Gadgets"]["coordinate"])

    def test_import_restores_all_aisles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "inventory.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["aisle", "prefix", "coordinate", "item", "quantity"],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "aisle": "Widgets",
                        "prefix": "W",
                        "coordinate": "W3",
                        "item": "Widget Nut",
                        "quantity": 4,
                    }
                )
                writer.writerow(
                    {
                        "aisle": "Gadgets",
                        "prefix": "G",
                        "coordinate": "G7",
                        "item": "Gadget Wheel",
                        "quantity": 10,
                    }
                )

            system = InventorySystem()
            system.import_csv(path)

        self.assertCountEqual(["Widgets", "Gadgets"], system.aisles.keys())
        self.assertEqual("W", system.aisles["Widgets"].prefix)
        self.assertEqual("G", system.aisles["Gadgets"].prefix)
        self.assertEqual(4, system.aisles["Widgets"].cells["W3"].quantity)
        self.assertEqual(10, system.aisles["Gadgets"].cells["G7"].quantity)


if __name__ == "__main__":
    unittest.main()
