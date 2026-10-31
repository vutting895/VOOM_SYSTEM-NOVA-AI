import unittest

from account_environment import account_environment


class AccountEnvironmentTests(unittest.TestCase):
    def test_demo_mode(self):
        self.assertEqual(account_environment(0), "demo")

    def test_real_mode(self):
        self.assertEqual(account_environment(2), "live")

    def test_contest_and_unknown_modes_fail_closed(self):
        self.assertIsNone(account_environment(1))
        self.assertIsNone(account_environment(3))
        self.assertIsNone(account_environment(None))
        self.assertIsNone(account_environment(True))
        self.assertIsNone(account_environment("2"))


if __name__ == "__main__":
    unittest.main()
