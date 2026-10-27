"""Synthetic offline importer regressions; not real source verification."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location("chirps_import", Path(__file__).with_name("import-chirps-points.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceGridTests(unittest.TestCase):
    def test_float32_lattice_uses_exact_source_edges(self):
        lat = (-60 + .025 + np.arange(2400)*.05).astype(np.float32)
        index, center, south, north = module.source_index(lat, 41.20, -60)
        self.assertEqual(index, 2024)
        self.assertEqual((south, north), (41.2, 41.25))
        self.assertAlmostEqual(center, 41.225, places=4)

    def test_half_open_east_edge_selects_adjacent_source_cell(self):
        lon = (-180 + .025 + np.arange(7200)*.05).astype(np.float32)
        self.assertEqual(module.source_index(lon, 66.75, -180)[0], 4935)
        self.assertEqual(module.source_index(lon, 66.7438373174406, -180)[0], 4934)

    def test_rejects_wrong_grid(self):
        with self.assertRaises(ValueError):
            module.source_index(np.array([41.2, 41.3]), 41.2, -60)


if __name__ == "__main__":
    unittest.main()