import unittest
import pandas as pd
from smc_wave import BacktestConfig, add_indicators, confirmed_swings, run_backtest, validate_ohlcv


def sample_data(n=180):
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    # Deterministic smooth trend with small oscillations to exercise indicators.
    close = [100 + i * 0.08 + ((-1) ** i) * 0.35 for i in range(n)]
    open_ = [close[0]] + close[:-1]
    high = [max(o, c) + 0.2 for o, c in zip(open_, close)]
    low = [min(o, c) - 0.2 for o, c in zip(open_, close)]
    return pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": 1}, index=idx)


class TestSMCWaveBacktest(unittest.TestCase):
    def test_indicators_add_expected_columns(self):
        result = add_indicators(sample_data())
        self.assertTrue({"ema_fast", "ema_slow", "rsi"} <= set(result.columns))
        self.assertFalse(result["ema_fast"].isna().all())

    def test_swings_confirm_on_later_bar(self):
        df = sample_data()
        swings = confirmed_swings(df, left_bars=2, right_bars=2)
        self.assertTrue({"swing_high", "swing_low"} <= set(swings.columns))
        self.assertEqual(len(swings), len(df))

    def test_bad_ohlc_rejected(self):
        df = sample_data()
        df.loc[df.index[5], "high"] = 1
        with self.assertRaises(ValueError):
            validate_ohlcv(df)

    def test_backtest_never_enables_live_trading(self):
        result = run_backtest(sample_data(), BacktestConfig())
        self.assertFalse(result["live_trading"])
        self.assertEqual(result["mode"], "BACKTEST_ONLY")
        self.assertGreaterEqual(result["total_trades"], 0)

    def test_duplicate_timestamps_rejected(self):
        df = sample_data()
        df.index = list(df.index[:-1]) + [df.index[-2]]
        with self.assertRaises(ValueError):
            validate_ohlcv(df)


if __name__ == "__main__":
    unittest.main()
