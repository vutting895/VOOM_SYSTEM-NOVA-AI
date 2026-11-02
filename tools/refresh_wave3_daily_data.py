"""Refresh the persistent Wave3 M15 dataset from the local authenticated MT5 bridge.

This script is intended for the Windows host that owns the logged-in Exness Demo
MT5 terminal. Credentials are read only from the existing private local secret
files used by the read-only bridge; nothing is sent to GitHub or printed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pandas as pd

EXPECTED_BASE_SHA256 = "0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266"
EXPECTED_SYMBOL = "XAUUSDm"
TIMEFRAME = "M15"
TIMEFRAME_MINUTES = 15
MAX_BARS = 500
BRIDGE_ORIGIN = "http://127.0.0.1:8787"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _private_credentials() -> tuple[str, str]:
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    secrets = local / "VOOM_SYSTEM" / "secrets"
    tenant_path = secrets / "mt5-tenant-id.txt"
    if not tenant_path.is_file():
        raise RuntimeError("Private MT5 tenant ID file is missing.")
    tenant_id = tenant_path.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", tenant_id):
        raise RuntimeError("Private MT5 tenant ID file is invalid.")
    token_path = secrets / f"mt5-bridge-{tenant_id}.token"
    if not token_path.is_file():
        raise RuntimeError("Private tenant-specific MT5 bridge token file is missing.")
    token = token_path.read_text(encoding="utf-8").strip()
    if len(token) < 32:
        raise RuntimeError("Private tenant-specific MT5 bridge token is invalid.")
    return tenant_id, token


def _bridge_get(path: str, tenant_id: str, token: str) -> dict:
    if not path.startswith("/") or "://" in path or "\r" in path or "\n" in path:
        raise ValueError("Only local bridge GET paths are allowed.")
    request = Request(
        BRIDGE_ORIGIN + path,
        headers={
            "Authorization": "Bearer " + token,
            "X-VOOM-TENANT-ID": tenant_id,
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=20) as response:
            if response.status != 200:
                raise RuntimeError(f"MT5 read-only bridge returned HTTP {response.status}.")
            raw = response.read(4 * 1024 * 1024 + 1)
    except HTTPError as exc:
        raise RuntimeError(f"MT5 read-only bridge returned HTTP {exc.code}.") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError("MT5 read-only bridge is unavailable on localhost.") from exc
    if len(raw) > 4 * 1024 * 1024:
        raise RuntimeError("MT5 bridge response exceeded the 4 MiB safety limit.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("MT5 bridge returned invalid JSON.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("MT5 bridge returned an invalid response shape.")
    return payload


def normalize_closed_quotes(payload: dict, *, now_utc: datetime | None = None) -> pd.DataFrame:
    """Validate the read-only quote response and retain completed M15 bars only."""
    if payload.get("mode") != "read-only" or payload.get("order_submission_enabled") is not False:
        raise ValueError("MT5 quote response did not prove read-only mode.")
    if payload.get("symbol") != EXPECTED_SYMBOL or str(payload.get("timeframe", "")).upper() != TIMEFRAME:
        raise ValueError("MT5 quote symbol/timeframe differs from the frozen XAUUSDm M15 contract.")
    digits = payload.get("digits")
    if not isinstance(digits, int) or digits != 3:
        raise ValueError("MT5 XAUUSDm digits differ from the verified 3-digit dataset contract.")
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("MT5 bridge returned no quote bars.")
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware.")
    now = now.astimezone(timezone.utc)
    rows: list[dict] = []
    for item in bars:
        if not isinstance(item, dict):
            raise ValueError("MT5 quote row has an invalid shape.")
        ts = pd.to_datetime(item.get("time"), utc=True, errors="raise")
        # copy_rates_from_pos includes the currently forming candle at position 0.
        # Never train on it; use only a bar whose full 15-minute interval has ended.
        if ts.to_pydatetime() + timedelta(minutes=TIMEFRAME_MINUTES) > now:
            continue
        values = [item.get(name) for name in ("open", "high", "low", "close", "tick_volume", "spread")]
        try:
            open_, high, low, close = (float(values[i]) for i in range(4))
            tick_volume, spread_points = int(values[4]), int(values[5])
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("MT5 quote row contains invalid OHLCV/spread values.") from exc
        if not all(math.isfinite(v) for v in (open_, high, low, close)):
            raise ValueError("MT5 quote row contains non-finite OHLC values.")
        if min(open_, high, low, close) <= 0 or low > high or not (low <= open_ <= high) or not (low <= close <= high):
            raise ValueError("MT5 quote row violates OHLC bounds.")
        if tick_volume < 0 or spread_points < 0:
            raise ValueError("MT5 quote row has negative volume/spread.")
        rows.append({
            "timestamp": ts.isoformat().replace("+00:00", "Z"),
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "tick_volume": tick_volume,
            "spread_price": spread_points / (10 ** digits),
            "spread": spread_points,
            "real_volume": int(item.get("real_volume", 0) or 0),
            "volume": tick_volume,
        })
    if not rows:
        raise ValueError("MT5 returned no fully closed M15 bars.")
    result = pd.DataFrame(rows)
    result["timestamp"] = pd.to_datetime(result["timestamp"], utc=True, errors="raise")
    result = result.sort_values("timestamp", kind="stable").drop_duplicates("timestamp", keep="last")
    if result["timestamp"].duplicated().any() or not result["timestamp"].is_monotonic_increasing:
        raise ValueError("MT5 quote timestamps are not unique and chronological.")
    return result


def _row_for_schema(row: dict, columns: list[str]) -> dict:
    mapped = dict(row)
    mapped["timestamp"] = str(row["timestamp"])
    output: dict = {}
    for column in columns:
        if column not in mapped:
            raise ValueError(f"Existing dataset has unsupported column '{column}'; refusing lossy append.")
        output[column] = mapped[column]
    return output


def refresh_dataset(base_data: Path, state_dir: Path, *, now_utc: datetime | None = None) -> dict:
    if not base_data.is_file():
        raise FileNotFoundError(f"Historical baseline dataset not found: {base_data}")
    actual_base_sha = sha256_file(base_data)
    if actual_base_sha != EXPECTED_BASE_SHA256:
        raise ValueError(
            f"Historical baseline SHA-256 mismatch: expected={EXPECTED_BASE_SHA256} actual={actual_base_sha}"
        )

    state_dir.mkdir(parents=True, exist_ok=True)
    state_csv = state_dir / "XAUUSDm_M15_daily.csv"
    state_manifest = state_dir / "daily_data_manifest.json"
    if state_csv.exists():
        if not state_manifest.is_file():
            raise ValueError("Persistent daily dataset exists without its manifest; refusing to trust it.")
        manifest = json.loads(state_manifest.read_text(encoding="utf-8"))
        if manifest.get("base_data_sha256") != EXPECTED_BASE_SHA256:
            raise ValueError("Persistent daily dataset was built from a different baseline SHA.")
        if manifest.get("data_sha256") != sha256_file(state_csv):
            raise ValueError("Persistent daily dataset SHA-256 does not match its manifest.")
        existing = pd.read_csv(state_csv)
    else:
        existing = pd.read_csv(base_data)
        # Preserve the original Git-tracked baseline file; the daily state is separate.
        temp = state_csv.with_suffix(".csv.tmp")
        existing.to_csv(temp, index=False, lineterminator="\n", float_format="%.12g")
        os.replace(temp, state_csv)

    required = {"timestamp", "open", "high", "low", "close", "spread_price"}
    if not required.issubset(existing.columns):
        raise ValueError(f"Historical dataset misses required columns: {sorted(required - set(existing.columns))}")
    existing["timestamp"] = pd.to_datetime(existing["timestamp"], utc=True, errors="raise")
    existing = existing.sort_values("timestamp", kind="stable").drop_duplicates("timestamp", keep="last")
    if existing["timestamp"].duplicated().any() or not existing["timestamp"].is_monotonic_increasing:
        raise ValueError("Persistent dataset timestamps must be unique and chronological.")
    previous_last = existing["timestamp"].max()

    tenant_id, token = _private_credentials()
    health = _bridge_get("/health", tenant_id, token)
    if (
        health.get("status") != "ok"
        or health.get("terminal_connected") is not True
        or health.get("mode") != "read-only"
        or health.get("order_submission_enabled") is not False
    ):
        raise RuntimeError("Protected MT5 bridge health did not pass the read-only terminal checks.")
    quote_payload = _bridge_get(
        f"/api/quotes?symbol={EXPECTED_SYMBOL}&timeframe={TIMEFRAME}&count={MAX_BARS}",
        tenant_id,
        token,
    )
    quotes = normalize_closed_quotes(quote_payload, now_utc=now_utc)
    new_quotes = quotes.loc[quotes["timestamp"] > previous_last].copy()
    if len(new_quotes) >= MAX_BARS - 10:
        raise ValueError("At least 490 new bars arrived since the previous sync; 500-bar bridge window may have truncated history.")

    if new_quotes.empty:
        latest = previous_last
        data_sha = sha256_file(state_csv)
        result = {
            "status": "no_new_closed_bars",
            "new_bars": 0,
            "total_bars": int(len(existing)),
            "last_closed_bar_utc": latest.isoformat(),
            "data_sha256": data_sha,
            "base_data_sha256": EXPECTED_BASE_SHA256,
            "mode": "read-only",
            "order_submission_enabled": False,
        }
        state_manifest.write_text(json.dumps({
            **result,
            "fetched_at_utc": (now_utc or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(),
            "provider": "Exness Demo MT5 local authenticated read-only bridge",
            "symbol": EXPECTED_SYMBOL,
            "timeframe": TIMEFRAME,
            "timezone": "UTC",
        }, indent=2), encoding="utf-8")
        return result

    rows = [_row_for_schema(row, list(existing.columns)) for row in new_quotes.to_dict("records")]
    append = pd.DataFrame(rows, columns=existing.columns)
    merged = pd.concat([existing, append], ignore_index=True)
    merged["timestamp"] = pd.to_datetime(merged["timestamp"], utc=True, errors="raise")
    merged = merged.sort_values("timestamp", kind="stable").drop_duplicates("timestamp", keep="last").reset_index(drop=True)
    if merged["timestamp"].duplicated().any() or not merged["timestamp"].is_monotonic_increasing:
        raise ValueError("Merged daily dataset failed chronological uniqueness checks.")
    latest = merged["timestamp"].max()
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware.")
    age_hours = (now.astimezone(timezone.utc) - latest.to_pydatetime()).total_seconds() / 3600
    if age_hours > 96:
        raise ValueError(f"Latest closed bar is stale ({age_hours:.1f} hours); refusing to train on old quotes.")
    temp = state_csv.with_suffix(".csv.tmp")
    merged.to_csv(temp, index=False, lineterminator="\n", float_format="%.12g", date_format="%Y-%m-%dT%H:%M:%SZ")
    os.replace(temp, state_csv)
    data_sha = sha256_file(state_csv)
    result = {
        "status": "updated",
        "new_bars": int(len(new_quotes)),
        "total_bars": int(len(merged)),
        "first_new_bar_utc": new_quotes["timestamp"].min().isoformat(),
        "last_closed_bar_utc": latest.isoformat(),
        "bridge_as_of_utc": quote_payload.get("as_of"),
        "data_sha256": data_sha,
        "base_data_sha256": EXPECTED_BASE_SHA256,
        "mode": "read-only",
        "order_submission_enabled": False,
    }
    state_manifest.write_text(json.dumps({
        **result,
        "fetched_at_utc": (now_utc or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat(),
        "provider": "Exness Demo MT5 local authenticated read-only bridge",
        "symbol": EXPECTED_SYMBOL,
        "timeframe": TIMEFRAME,
        "timezone": "UTC",
    }, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-data", type=Path, default=Path("datasets/exness-demo/XAUUSDm_M15_2022-2026.csv"))
    parser.add_argument("--state-dir", type=Path, default=None)
    args = parser.parse_args()
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    state_dir = args.state_dir or (local / "VOOM_SYSTEM" / "wave3")
    try:
        result = refresh_dataset(args.base_data, state_dir)
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception as exc:
        # Do not print exception details that could contain request headers or secrets.
        print(json.dumps({"status": "failed", "error": str(exc), "mode": "read-only", "order_submission_enabled": False}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
