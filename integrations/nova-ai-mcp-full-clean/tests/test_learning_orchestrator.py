import unittest
from datetime import datetime, timedelta, timezone
import pandas as pd
from workers.learning_orchestrator import LearningGateError, chronological_split, dataset_fingerprint, validate_market_frame

def sample_frame(count=200):
    start=datetime(2024,1,1,tzinfo=timezone.utc)
    rows=[]
    for i in range(count):
        price=100.0+i*.1
        rows.append({"timestamp":start+timedelta(hours=i),"open":price,"high":price+1,
                     "low":price-1,"close":price+.2,"volume":10.0+i})
    return pd.DataFrame(rows)

class LearningOrchestratorTests(unittest.TestCase):
    def test_chronological_split_has_purged_gaps(self):
        split=chronological_split(200,horizon=5)
        self.assertEqual(split.validation_start-split.train_end,5)
        self.assertEqual(split.test_start-split.validation_end,5)
    def test_rejects_shuffled_rows(self):
        with self.assertRaisesRegex(LearningGateError,"timestamps_not_chronological"):
            validate_market_frame(sample_frame().iloc[::-1].reset_index(drop=True))
    def test_rejects_timezone_naive_timestamps(self):
        frame=sample_frame()
        frame["timestamp"]=frame["timestamp"].dt.tz_localize(None)
        with self.assertRaisesRegex(LearningGateError,"timezone_naive_timestamp"):
            validate_market_frame(frame)
    def test_rejects_duplicate_timestamps(self):
        frame=sample_frame()
        frame.loc[1,"timestamp"]=frame.loc[0,"timestamp"]
        with self.assertRaisesRegex(LearningGateError,"duplicate_timestamp"):
            validate_market_frame(frame)
    def test_fingerprint_is_deterministic_and_changes_with_data(self):
        frame=sample_frame()
        first=dataset_fingerprint(frame,"sample","verified_fixture")
        self.assertEqual(first,dataset_fingerprint(frame.copy(),"sample","verified_fixture"))
        frame.loc[10,"close"]+=.01
        self.assertNotEqual(first,dataset_fingerprint(frame,"sample","verified_fixture"))

    def test_fingerprint_includes_funding_and_provenance_columns(self):
        frame=sample_frame()
        frame["funding_rate"]=0.0001
        frame["funding_source"]="provider-a"
        first=dataset_fingerprint(frame,"sample","verified_fixture")
        frame.loc[10,"funding_rate"]=0.0002
        self.assertNotEqual(first,dataset_fingerprint(frame,"sample","verified_fixture"))
        frame.loc[10,"funding_rate"]=0.0001
        frame.loc[10,"funding_source"]="provider-b"
        self.assertNotEqual(first,dataset_fingerprint(frame,"sample","verified_fixture"))

    def test_rejects_string_timestamps_without_explicit_timezone(self):
        frame=sample_frame()
        frame["timestamp"]=frame["timestamp"].map(lambda value:value.isoformat().replace("+00:00",""))
        with self.assertRaisesRegex(LearningGateError,"timezone_aware_timestamp_required"):
            validate_market_frame(frame)

    def test_rejects_non_finite_ohlcv(self):
        frame=sample_frame()
        frame.loc[10,"close"]=float("inf")
        with self.assertRaisesRegex(LearningGateError,"non_finite_numeric:close"):
            validate_market_frame(frame)

    def test_rejects_non_integer_or_non_finite_split_parameters(self):
        for kwargs in ({"horizon":1.5},{"horizon":True},{"train_ratio":float("nan")},{"validation_ratio":float("inf")}):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(LearningGateError):
                    chronological_split(200,**kwargs)

if __name__=="__main__":
    unittest.main()
