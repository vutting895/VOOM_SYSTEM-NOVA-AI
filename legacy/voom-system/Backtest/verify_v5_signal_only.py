from pathlib import Path
import re, json, hashlib
root = Path(r"C:\Users\Administrator\Documents\Voom_system")
src = root / "EA" / "VoomProgressiveDailyUSD_v5_SignalOnly.mq5"
log = root / "EA" / "VoomProgressiveDailyUSD_v5_SignalOnly_compile.log"
ex5 = root / "EA" / "VoomProgressiveDailyUSD_v5_SignalOnly.ex5"
code = src.read_text(encoding="utf-8")
compile_log = log.read_text(encoding="utf-8", errors="replace")
clean = re.sub(r"/\*.*?\*/", " ", code, flags=re.S)
clean = re.sub(r"//[^\n]*", " ", clean)
clean = re.sub(r'"(?:\\.|[^"\\])*"', '""', clean)
patterns = [r"\bCTrade\b", r"\bOrderSend\s*\(", r"\bOrderSendAsync\s*\(", r"\bPositionOpen\s*\(", r"\bPositionClose\s*\(", r"\.\s*Buy\s*\(", r"\.\s*Sell\s*\(", r"\bOrderCheck\s*\("]
matches = {pattern: bool(re.search(pattern, clean, flags=re.I)) for pattern in patterns}
compile_log_normalized = compile_log.replace("\x00", "")
compile_ok = bool(re.search(r"0\s+errors,\s*0\s+warnings", compile_log_normalized, flags=re.I))
passed = src.exists() and ex5.exists() and compile_ok and not any(matches.values())
result = {"source_exists":src.exists(),"compiled_binary_exists":ex5.exists(),"compile_zero_errors_and_warnings":compile_ok,"forbidden_trade_api_matches":matches,"source_sha256":hashlib.sha256(src.read_bytes()).hexdigest(),"binary_bytes":ex5.stat().st_size if ex5.exists() else 0,"signal_only_static_check_passed":passed,"live_orders_sent":False}
print(json.dumps(result, indent=2))
raise SystemExit(0 if passed else 1)
