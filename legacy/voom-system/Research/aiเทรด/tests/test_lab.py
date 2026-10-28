"""Offline tests for VOOM AI Trading Lab; no broker or network access."""
import csv, json, math, subprocess, sys, tempfile, os, shutil
from datetime import datetime, timedelta
from pathlib import Path
LAB = Path(__file__).resolve().parents[1] / "lab.py"
def main():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td); data = root / "bars.csv"
        with data.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f); w.writerow(["timestamp","open","high","low","close","volume"])
            price = 100.0
            for i in range(700):
                price *= 1 + 0.00025 + 0.003 * math.sin(i / 11.0) / 11.0
                w.writerow([(datetime(2025, 1, 1) + timedelta(days=i)).isoformat(), price, price*1.002, price*.998, price, 100])
        copy = root / "lab"; copy.mkdir(); shutil.copy2(LAB, copy / "lab.py")
        env = dict(os.environ)
        r = subprocess.run([sys.executable, str(copy/"lab.py"), "generate", "--name", "test-candidate"],
                           capture_output=True, text=True, check=True, env=env)
        assert json.loads(r.stdout)["customer_visible"] is False
        r = subprocess.run([sys.executable, str(copy/"lab.py"), "train", "--csv", str(data), "--cost-bps", "1"],
                           capture_output=True, text=True, check=True, env=env)
        result = json.loads(r.stdout)
        assert result["ok"] and result["candidate_count"] > 0
        assert result["customer_visible"] is False and result["live_trading_enabled"] is False
        reports = list((copy/"reports").glob("training_report_*.json")); assert reports
        report = json.loads(reports[0].read_text(encoding="utf-8"))
        assert report["chronological_split"] is True and report["candidate_results"]
        r = subprocess.run([sys.executable, str(copy/"lab.py"), "list"],
                           capture_output=True, text=True, check=True, env=env)
        assert json.loads(r.stdout)["customer_selection_enabled"] is False
        print("candidate generation: PASS")
        print("chronological train/holdout parameter search: PASS")
        print("research candidates hidden from customers: PASS")
        print("live trading remains disabled: PASS")
        print("TOTAL: 4/4 passed")
if __name__ == "__main__": main()
