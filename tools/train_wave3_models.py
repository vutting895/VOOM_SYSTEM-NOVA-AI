"""Train Wave3 + SMC models and run chronological validation; research-only."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers" / "strategy"))
from wave3_ml_pipeline import main

if __name__ == "__main__":
    main()
