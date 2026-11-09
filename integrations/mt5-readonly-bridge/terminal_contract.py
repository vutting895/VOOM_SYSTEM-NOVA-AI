"""Pure runtime gate for the tenant-bound MT5 terminal/account session."""


class TerminalUnavailable(ValueError):
    """The MT5 terminal or account session is not connected."""


class AccountNotExnessDemo(PermissionError):
    """The connected account is not an Exness demo account."""


def validate_exness_demo_terminal(terminal, account, demo_trade_mode):
    """Fail closed unless a connected terminal is logged into an Exness demo account.

    Broker identity is taken from the account's MT5 server field. Terminal company
    metadata alone is not sufficient: it can describe the terminal vendor rather
    than the broker and must never override a non-Exness account server.
    """
    if terminal is None:
        raise TerminalUnavailable("MT5 terminal status unavailable")
    if not bool(getattr(terminal, "connected", False)):
        raise TerminalUnavailable("MT5 terminal is not connected")
    if account is None:
        raise TerminalUnavailable("No MT5 account session detected")

    server_name = str(getattr(account, "server", "") or "")
    if (
        demo_trade_mode is None
        or getattr(account, "trade_mode", None) != demo_trade_mode
        or "exness" not in server_name.lower()
    ):
        raise AccountNotExnessDemo("Only an Exness Demo MT5 terminal is permitted.")
    return True
