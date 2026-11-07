"""Verify the pinned, canonical Exness USD high-impact calendar bytes.

The digest is for the Git-tracked LF-normalized CSV, not the original MT5
terminal file's platform-specific line endings.
"""
from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path
from typing import NamedTuple

EXPECTED_CALENDAR_SHA256 = "317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37"


class CalendarDigest(NamedTuple):
    sha256: str
    size_bytes: int


def verify_calendar_sha256(
    path: str | Path,
    expected_sha256: str = EXPECTED_CALENDAR_SHA256,
) -> CalendarDigest:
    expected = str(expected_sha256).strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("expected calendar SHA-256 must be exactly 64 hexadecimal characters")

    payload = Path(path).read_bytes()
    actual = hashlib.sha256(payload).hexdigest()
    if actual != expected:
        raise ValueError(
            "historical news calendar SHA-256 mismatch: "
            f"expected={expected} actual={actual} size_bytes={len(payload)}"
        )
    return CalendarDigest(sha256=actual, size_bytes=len(payload))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("calendar_csv", type=Path)
    args = parser.parse_args()
    digest = verify_calendar_sha256(args.calendar_csv)
    print(
        "NEWS_CALENDAR_SHA256_VERIFIED "
        f"sha256={digest.sha256} size_bytes={digest.size_bytes}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
