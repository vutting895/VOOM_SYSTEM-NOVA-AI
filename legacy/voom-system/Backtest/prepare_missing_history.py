# -*- coding: utf-8 -*-
"""Prepare a documented mixed-source XAUUSD M15 research dataset. No MT5 access."""
from pathlib import Path
import gzip, json
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
EXT = DATA / "external_candidates"
BROKER_CSV = DATA / "XAUUSDc_M15_20211023_20261023.csv"
BROKER_META = DATA / "XAUUSDc_M15_20211023_20261023.meta.json"
OUT_GAP = DATA / "XAUUSD_M15_external_gap_20211023_20220726.csv"
OUT_MERGED = DATA / "XAUUSDc_M15_20211023_20261023_hybrid.csv"
OUT_META = DATA / "XAUUSDc_M15_20211023_20261023_hybrid.meta.json"

meta = json.loads(BROKER_META.read_text(encoding="utf-8-sig"))
point = float(meta.get("broker_spec", {}).get("point", 0.01))
start = pd.Timestamp(meta["requested_start_utc"])
broker = pd.read_csv(BROKER_CSV)
broker["time"] = pd.to_datetime(broker["time"], utc=True, errors="raise")
broker = broker.sort_values("time").drop_duplicates("time").reset_index(drop=True)
broker_start = broker["time"].iloc[0]
broker_end = broker["time"].iloc[-1]
fallback_spread = float(broker.loc[broker["spread"] > 0, "spread"].median())

frames = []
for year in (2021, 2022):
    path = EXT / f"XAUUSD_M15_EVTL_{year}.json.gz"
    with gzip.open(path, "rt", encoding="utf-8") as f:
        records = json.load(f)
    d = pd.DataFrame(records)
    d["time"] = pd.to_datetime(d["ts"], unit="s", utc=True)
    d = d.rename(columns={"o":"open","h":"high","l":"low","c":"close","v":"tick_volume"})
    d["spread"] = ((pd.to_numeric(d["ao"], errors="coerce") - pd.to_numeric(d["open"], errors="coerce")) / point).round().clip(lower=0)
    d["source"] = "EV_Trading_Labs_Dukascopy_aggregated_BID_ASK"
    frames.append(d[["time","open","high","low","close","spread","tick_volume","source"]])

external = pd.concat(frames, ignore_index=True)
external = external[(external["time"] >= start.floor("15min")) & (external["time"] < broker_start)].copy()
external = external.sort_values("time").drop_duplicates("time").reset_index(drop=True)
for c in ["open","high","low","close","spread"]:
    external[c] = pd.to_numeric(external[c], errors="coerce")
external = external.dropna(subset=["time","open","high","low","close","spread"])
external = external[(external[["open","high","low","close"]] > 0).all(axis=1)]
external["spread"] = external["spread"].fillna(fallback_spread)
external["spread"] = external["spread"].clip(lower=0)
external[["time","open","high","low","close","spread","tick_volume","source"]].to_csv(OUT_GAP, index=False, date_format="%Y-%m-%dT%H:%M:%S%z")

broker["source"] = "MT5_XAUUSDc_broker_history"
if "tick_volume" not in broker.columns:
    broker["tick_volume"] = None
cols = ["time","open","high","low","close","spread","tick_volume","source"]
combined = pd.concat([external[cols], broker[cols]], ignore_index=True, sort=False)
combined["time"] = pd.to_datetime(combined["time"], utc=True, errors="raise")
combined = combined.sort_values("time").drop_duplicates("time", keep="last").reset_index(drop=True)
combined.to_csv(OUT_MERGED, index=False, date_format="%Y-%m-%dT%H:%M:%S%z")

actual_days = (combined["time"].iloc[-1] - combined["time"].iloc[0]).total_seconds() / 86400
requested_days = float(meta.get("requested_coverage_days", 0))
source_counts = {str(k): int(v) for k, v in combined["source"].value_counts().items()}
deltas = combined["time"].diff().dropna().dt.total_seconds() / 60
transition_before = external["time"].iloc[-1] if len(external) else None
out_meta = dict(meta)
out_meta.update({
    "source": "mixed-source research dataset: external historical supplement + MT5 broker history",
    "symbol": "XAUUSDc (hybrid research series; external section is spot XAUUSD, not broker XAUUSDc)",
    "actual_start_utc": combined["time"].iloc[0].isoformat(),
    "actual_end_utc": combined["time"].iloc[-1].isoformat(),
    "bars": int(len(combined)),
    "actual_coverage_days": round(actual_days, 3),
    "coverage_ratio": round(actual_days / requested_days, 5) if requested_days else None,
    "sources": source_counts,
    "supplement": {
        "provider": "EV Trading Labs historical OHLCV catalogue; underlying described by provider as aggregated from Dukascopy bid/ask",
        "catalogue_url": "https://evtradelabs.com/data",
        "download_urls": [
            "https://evtradelabs.com/api/simulator/data/XAUUSD/M15/2021.json.gz",
            "https://evtradelabs.com/api/simulator/data/XAUUSD/M15/2022.json.gz"
        ],
        "gap_start_utc": external["time"].iloc[0].isoformat() if len(external) else None,
        "gap_end_utc": external["time"].iloc[-1].isoformat() if len(external) else None,
        "gap_bars": int(len(external)),
        "spread_estimation": "ask-open minus bid-open divided by broker point size; not MT5 XAUUSDc spread",
        "transition_to_broker_history_utc": broker_start.isoformat(),
        "price_feed_warning": "External XAUUSD spot candles are not the same instrument/feed as broker XAUUSDc. The combined file is suitable for exploratory research only and must not be represented as five years of broker-native history."
    },
    "merged_csv": str(OUT_MERGED.resolve()),
    "gap_csv": str(OUT_GAP.resolve()),
    "time_delta_minutes": {
        "median": float(deltas.median()) if len(deltas) else None,
        "max": float(deltas.max()) if len(deltas) else None,
        "note": "Large gaps include normal weekends/market closures; endpoint date coverage does not prove every expected trading bar exists."
    }
})
OUT_META.write_text(json.dumps(out_meta, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({
    "gap_csv": str(OUT_GAP),
    "merged_csv": str(OUT_MERGED),
    "meta": str(OUT_META),
    "supplement_bars": len(external),
    "supplement_start": external["time"].iloc[0].isoformat() if len(external) else None,
    "supplement_end": external["time"].iloc[-1].isoformat() if len(external) else None,
    "broker_start": broker_start.isoformat(),
    "combined_bars": len(combined),
    "combined_start": combined["time"].iloc[0].isoformat(),
    "combined_end": combined["time"].iloc[-1].isoformat(),
    "coverage_ratio": out_meta["coverage_ratio"],
    "source_counts": source_counts,
    "median_gap_minutes": out_meta["time_delta_minutes"]["median"],
    "max_gap_minutes": out_meta["time_delta_minutes"]["max"]
}, indent=2))
