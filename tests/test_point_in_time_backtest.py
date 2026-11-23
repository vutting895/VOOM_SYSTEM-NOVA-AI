import unittest
from workers.quant_engine.point_in_time import confirmed_pivots, next_bar_entry, resolve_barrier_hit, visible_zones

class PointInTimeBacktestTests(unittest.TestCase):
    def test_pivot_waits_for_right_confirmation_window(self):
        pivots = confirmed_pivots([1, 2, 5, 3, 2, 4, 3], [4, 3, 2, 3, 4, 2, 3], 1, 2)
        pivot = next(p for p in pivots if p["kind"] == "high" and p["index"] == 2)
        self.assertEqual(pivot["available_at_index"], 4)
        self.assertGreater(pivot["available_at_index"], pivot["index"])

    def test_equal_extrema_are_rejected(self):
        pivots = confirmed_pivots([1, 3, 3, 2, 1], [5, 4, 4, 5, 6], 1, 1)
        self.assertFalse(any(p["kind"] == "high" and p["index"] in (1, 2) for p in pivots))

    def test_future_zones_are_hidden(self):
        zones = [{"id": "old", "known_at_index": 4}, {"id": "new", "known_at_index": 8}]
        self.assertEqual([z["id"] for z in visible_zones(zones, 5)], ["old"])

    def test_zone_without_availability_metadata_is_rejected(self):
        with self.assertRaises(ValueError): visible_zones([{"id": "unsafe"}], 5)

    def test_entry_is_next_bar_open(self):
        self.assertEqual(next_bar_entry([10, 11, 12], 1), (2, 12))
        with self.assertRaises(IndexError): next_bar_entry([10, 11], 1)

    def test_same_bar_stop_and_target_uses_stop(self):
        self.assertEqual(resolve_barrier_hit("long", 112, 98, 99, 110), {"result": "stop", "price": 99, "ambiguous": True})

    def test_short_same_bar_ambiguity_uses_stop(self):
        result = resolve_barrier_hit("short", 102, 88, 101, 90)
        self.assertEqual(result["result"], "stop")
        self.assertTrue(result["ambiguous"])

    def test_barrier_validation(self):
        with self.assertRaises(ValueError): resolve_barrier_hit("buy", 10, 9, 8, 12)
        with self.assertRaises(ValueError): resolve_barrier_hit("long", 9, 10, 8, 12)

if __name__ == "__main__": unittest.main()
