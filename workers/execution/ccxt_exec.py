"""NOVA execution boundary: live orders are intentionally disabled.
The upstream Meta AI artifact contains direct CCXT order submission. That code is
quarantined in artifacts/ and must not be used for live trading without a reviewed
broker adapter, explicit authorization, and end-to-end risk tests.
"""
from typing import Any

LIVE_EXECUTION_ENABLED = False

class ExecutionDisabledError(RuntimeError):
    pass

class ExecutionWorker:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self.mode = "disabled"

    def execute(self, symbol: str, side: str, amount: float, price: float | None = None) -> dict[str, Any]:
        raise ExecutionDisabledError(
            "Live execution is disabled in VOOM_SYSTEM NOVA. No order was sent."
        )

if __name__ == "__main__":
    print({"service": "execution", "enabled": LIVE_EXECUTION_ENABLED, "mode": "disabled"})