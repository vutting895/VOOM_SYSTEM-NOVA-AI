import unittest
from uploader import account_scope_hmac, canonical

class EventUploaderTests(unittest.TestCase):
    def test_hmac_is_stable_for_same_scope(self):
        self.assertEqual(account_scope_hmac("local-scope-a", "test-key"), account_scope_hmac("local-scope-a", "test-key"))
    def test_hmac_separates_scopes(self):
        self.assertNotEqual(account_scope_hmac("local-scope-a", "test-key"), account_scope_hmac("local-scope-b", "test-key"))
    def test_hmac_separates_keys(self):
        self.assertNotEqual(account_scope_hmac("local-scope-a", "test-key"), account_scope_hmac("local-scope-a", "other-key"))
    def test_canonical_json_orders_keys(self):
        self.assertEqual(canonical({"b": 2, "a": 1}), canonical({"a": 1, "b": 2}))
    def test_hmac_fails_closed_when_missing(self):
        with self.assertRaises(ValueError): account_scope_hmac("", "test-key")
        with self.assertRaises(ValueError): account_scope_hmac("local-scope-a", "")

if __name__ == "__main__":
    unittest.main()
