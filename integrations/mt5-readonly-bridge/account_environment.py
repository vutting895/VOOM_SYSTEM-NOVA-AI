def account_environment(trade_mode):
    """Map MT5 ACCOUNT_TRADE_MODE to a trusted environment label.

    MetaTrader 5 defines 0=DEMO, 1=CONTEST, 2=REAL. Unknown and contest
    values are intentionally rejected rather than guessed from the server name.
    """
    if isinstance(trade_mode, bool) or not isinstance(trade_mode, int):
        return None
    if trade_mode == 0:
        return "demo"
    if trade_mode == 2:
        return "live"
    return None
