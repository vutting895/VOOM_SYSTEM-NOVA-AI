import unittest
from types import SimpleNamespace

from terminal_contract import (
    AccountNotExnessDemo,
    TerminalUnavailable,
    validate_exness_demo_terminal,
)


DEMO = 0


class TerminalContractTests(unittest.TestCase):
    def test_accepts_connected_exness_demo(self):
        terminal = SimpleNamespace(connected=True, company="MetaQuotes")
        account = SimpleNamespace(trade_mode=DEMO, server="Exness-MT5Trial")
        self.assertTrue(validate_exness_demo_terminal(terminal, account, DEMO))

    def test_rejects_disconnected_terminal(self):
        terminal = SimpleNamespace(connected=False, company="Exness")
        account = SimpleNamespace(trade_mode=DEMO, server="Exness-MT5Trial")
        with self.assertRaises(TerminalUnavailable):
            validate_exness_demo_terminal(terminal, account, DEMO)

    def test_rejects_missing_terminal_or_account(self):
        with self.assertRaises(TerminalUnavailable):
            validate_exness_demo_terminal(None, object(), DEMO)
        with self.assertRaises(TerminalUnavailable):
            validate_exness_demo_terminal(SimpleNamespace(connected=True), None, DEMO)

    def test_rejects_real_account_even_on_exness_server(self):
        terminal = SimpleNamespace(connected=True, company="Exness")
        account = SimpleNamespace(trade_mode=2, server="Exness-MT5Real")
        with self.assertRaises(AccountNotExnessDemo):
            validate_exness_demo_terminal(terminal, account, DEMO)

    def test_rejects_demo_account_on_non_exness_server(self):
        terminal = SimpleNamespace(connected=True, company="MetaQuotes")
        account = SimpleNamespace(trade_mode=DEMO, server="Broker-Demo")
        with self.assertRaises(AccountNotExnessDemo):
            validate_exness_demo_terminal(terminal, account, DEMO)

    def test_terminal_company_cannot_override_non_exness_account_server(self):
        terminal = SimpleNamespace(connected=True, company="Exness Technologies Ltd")
        account = SimpleNamespace(trade_mode=DEMO, server="OtherBroker-Demo")
        with self.assertRaises(AccountNotExnessDemo):
            validate_exness_demo_terminal(terminal, account, DEMO)

    def test_fails_closed_if_demo_mode_constant_is_unavailable(self):
        terminal = SimpleNamespace(connected=True, company="Exness")
        account = SimpleNamespace(trade_mode=DEMO, server="Exness-Demo")
        with self.assertRaises(AccountNotExnessDemo):
            validate_exness_demo_terminal(terminal, account, None)


if __name__ == "__main__":
    unittest.main()
