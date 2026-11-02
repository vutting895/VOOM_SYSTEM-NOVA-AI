import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TestWave3DailyAutomationContract(unittest.TestCase):
    def test_hourly_calendar_exporter_is_read_only_atomic_and_utf8(self):
        source = (ROOT / "tools/mt5_wave3_daily_calendar_exporter.mq5").read_text(encoding="utf-8")
        for required in (
            "EventSetTimer",
            "void OnTimer()",
            "CalendarValueHistory",
            "TimeTradeServer()",
            "TimeGMT()",
            "FILE_COMMON",
            "FILE_REWRITE",
            "CP_UTF8",
            "NEWS_EXPORT_SUCCESS",
        ):
            self.assertIn(required, source)
        for forbidden in ("OrderSend(", "CTrade", "PositionOpen(", "PositionClose("):
            self.assertNotIn(forbidden, source)

    def test_windows_runner_is_pinned_to_pr66_and_candidate_only(self):
        source = (ROOT / "tools/windows/run-wave3-daily.ps1").read_text(encoding="utf-8")
        for required in (
            "feature/wave3-hybrid-backtest-20261029",
            "rev-list --left-right --count",
            "'--ff-only'",
            "VOOM_USD_High_Impact_Daily.csv",
            "--daily-candidate-only",
            "order_submission_enabled",
        ):
            self.assertIn(required, source)
        self.assertIn("merge", source)
        self.assertNotIn("git push", source.lower())
        self.assertNotIn("workflow_dispatch", source.lower())

    def test_installer_uses_bangkok_daily_interactive_task(self):
        source = (ROOT / "tools/windows/install-wave3-daily-task.ps1").read_text(encoding="utf-8")
        self.assertIn("SE Asia Standard Time", source)
        self.assertIn("New-ScheduledTaskTrigger -Daily", source)
        self.assertIn("-LogonType Interactive", source)
        self.assertIn("VOOM NOVA Wave3 Daily Candidate Training", source)

    def test_candidate_pipeline_cannot_promote_or_touch_frozen_oos(self):
        source = (ROOT / "workers/strategy/wave3_ml_pipeline.py").read_text(encoding="utf-8")
        start = source.index("def run_daily_candidate_experiment(")
        end = source.index("\ndef main()", start)
        candidate = source[start:end]
        self.assertIn('pd.Timestamp("2026-07-01T00:00:00Z")', candidate)
        self.assertIn('"used_for_fit": False', candidate)
        self.assertIn('"used_for_tuning_or_calibration": False', candidate)
        self.assertIn('"promotion_eligible": False', candidate)
        self.assertIn('"production_eligible": False', candidate)
        self.assertIn('"status": "not_evaluated"', candidate)
        self.assertIn("segment_ids=segment_ids", candidate)


if __name__ == "__main__":
    unittest.main()
