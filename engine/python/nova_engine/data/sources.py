"""Source-neutral contracts for imported market data."""
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True, slots=True)
class DatasetManifest:
    dataset_id: str
    source_repository: str
    source_url: str
    source_file: str
    upstream_commit: str
    provider: str
    instrument: str
    broker_symbol: str
    timeframe: str
    start_utc: datetime
    end_utc: datetime
    retrieved_at_utc: datetime
    license: str
    provider_terms_url: str
    file_format: str
    row_count: int
    sha256: str
    validation_status: str

    def validate(self) -> None:
        if self.instrument != "XAUUSD":
            raise ValueError("NOVA v1.0 accepts XAUUSD only")
        if self.timeframe not in {"M1", "M5", "M15", "M30", "H1"}:
            raise ValueError("Unsupported timeframe")
        for value in (self.start_utc, self.end_utc, self.retrieved_at_utc):
            if value.tzinfo is None or value.utcoffset() is None or value.utcoffset().total_seconds() != 0:
                raise ValueError("Manifest timestamps must be UTC")
        if self.end_utc < self.start_utc:
            raise ValueError("Dataset end precedes start")
        if self.row_count < 0:
            raise ValueError("row_count cannot be negative")
        if self.validation_status not in {"pending", "passed", "rejected"}:
            raise ValueError("Invalid validation_status")


def discover_csv_files(root: Path) -> list[Path]:
    """List local CSV candidates; provenance must be validated before use."""
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*.csv") if path.is_file())
