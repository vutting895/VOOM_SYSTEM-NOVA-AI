from datetime import datetime, timezone

import pytest

from nova_engine.data.sources import DatasetManifest


def _manifest(**overrides):
    values = dict(
        dataset_id="fixture-xauusd-m1",
        source_repository="NOVA",
        source_url="https://example.invalid/fixture.csv",
        source_file="fixture.csv",
        upstream_commit="local",
        provider="synthetic-test",
        instrument="XAUUSD",
        broker_symbol="XAUUSD",
        timeframe="M1",
        start_utc=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_utc=datetime(2026, 1, 2, tzinfo=timezone.utc),
        retrieved_at_utc=datetime(2026, 1, 3, tzinfo=timezone.utc),
        license="NOVA synthetic fixture",
        provider_terms_url="",
        file_format="csv",
        row_count=1440,
        sha256="0" * 64,
        validation_status="pending",
    )
    values.update(overrides)
    return DatasetManifest(**values)


def test_valid_xauusd_manifest():
    _manifest().validate()


def test_rejects_other_instrument():
    with pytest.raises(ValueError):
        _manifest(instrument="EURUSD").validate()


def test_rejects_non_utc_timestamp():
    with pytest.raises(ValueError):
        _manifest(start_utc=datetime(2026, 1, 1)).validate()


def test_rejects_unknown_timeframe():
    with pytest.raises(ValueError):
        _manifest(timeframe="D1").validate()
