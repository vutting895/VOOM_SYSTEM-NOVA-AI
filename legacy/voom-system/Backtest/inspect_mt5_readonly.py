# Read-only MT5 snapshot; no order APIs are called.
import json
import MetaTrader5 as mt5
path = r"C:\MT5\Sounds\terminal64.exe"
out = {"initialized": False}
if mt5.initialize(path=path):
    out["initialized"] = True
    acc = mt5.account_info()
    if acc:
        out["account"] = {"server": acc.server, "currency": acc.currency, "balance": round(acc.balance,2), "equity": round(acc.equity,2), "profit": round(acc.profit,2)}
    positions = mt5.positions_get()
    out["positions"] = []
    if positions is not None:
        for p in positions:
            out["positions"].append({"symbol": p.symbol, "type": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL", "volume": p.volume, "sl": p.sl, "tp": p.tp, "profit": round(p.profit,2), "magic": p.magic, "ticket": p.ticket})
    out["last_error"] = str(mt5.last_error())
    mt5.shutdown()
else:
    out["last_error"] = str(mt5.last_error())
print(json.dumps(out, indent=2))
