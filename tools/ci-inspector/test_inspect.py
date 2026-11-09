import unittest

from inspect import SENSITIVE_PATTERNS, status_item


class InspectorUnitTests(unittest.TestCase):
    def test_detects_github_token_shape(self):
        self.assertIsNotNone(SENSITIVE_PATTERNS[0].search("ghp_" + "A" * 30))

    def test_detects_assignment_credential_shape(self):
        self.assertIsNotNone(SENSITIVE_PATTERNS[1].search('api_key = "this-looks-like-a-secret-value"'))

    def test_does_not_flag_plain_description(self):
        self.assertIsNone(SENSITIVE_PATTERNS[1].search("API key is read from environment variables"))

    def test_status_item_shape(self):
        item = status_item("CircleCI", "BLOCKED", "token missing")
        self.assertEqual(item["status"], "BLOCKED")
        self.assertIsNone(item["url"])


if __name__ == "__main__":
    unittest.main()
