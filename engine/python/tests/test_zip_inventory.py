from pathlib import Path
from zipfile import ZipFile

import pytest

from nova_engine.data.zip_inventory import inspect_zip


def test_inspect_zip_lists_members(tmp_path: Path):
    archive = tmp_path / "sample.zip"
    with ZipFile(archive, "w") as zf:
        zf.writestr("bars/XAUUSD_M1.csv", "timestamp,open,high,low,close,tick_volume\n")
    members = inspect_zip(archive)
    assert len(members) == 1
    assert members[0].name == "bars/XAUUSD_M1.csv"
    assert members[0].size_bytes > 0


def test_rejects_path_traversal_member(tmp_path: Path):
    archive = tmp_path / "unsafe.zip"
    with ZipFile(archive, "w") as zf:
        zf.writestr("../outside.csv", "unsafe")
    with pytest.raises(ValueError, match="Unsafe archive member"):
        inspect_zip(archive)
