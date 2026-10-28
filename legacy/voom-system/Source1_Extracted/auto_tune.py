"""Safe auto-tune entry point. No synthetic-data promotion."""
from main_bot_v62_best import BEST_CONFIG

def run_tuning(n_trials=120, *args, **kwargs):
    raise RuntimeError("Auto-tuning blocked: synthetic data/random outcomes are not valid evidence. BEST_CONFIG unchanged.")

def load_backtest_data(*args, **kwargs):
    raise RuntimeError("No synthetic fallback allowed; supply validated historical market data.")
