import unittest
from datetime import datetime, timedelta, timezone
import pandas as pd
from workers.feature.supervised_xgboost import SupervisedWorker
from workers.learning_orchestrator import LearningGateError

def market_frame(count=180):
    start=datetime(2024,1,1,tzinfo=timezone.utc)
    rows=[]
    for i in range(count):
        close=100+(i%11)*.7+i*.015
        rows.append({"timestamp":start+timedelta(hours=i),"open":close-.1,"high":close+.5,
                     "low":close-.5,"close":close,"volume":100+i})
    return pd.DataFrame(rows)

def add_funding_provenance(frame):
    frame["funding_rate"]=0.0001
    frame["funding_source"]="binance_historical_funding_api"
    frame["funding_observed_at"]=frame["timestamp"]-pd.Timedelta(minutes=1)
    frame["funding_available_at"]=frame["timestamp"]
    return frame

class XGBoostFeatureTests(unittest.TestCase):
    def test_no_synthetic_funding_feature_is_created(self):
        worker=SupervisedWorker(horizon=5)
        prepared=worker.create_features(market_frame())
        self.assertNotIn("funding",prepared.columns)
        self.assertNotIn("funding_rate",worker.feature_columns)
    def test_unlabeled_future_horizon_rows_are_dropped(self):
        frame=market_frame()
        prepared=SupervisedWorker(horizon=5).create_features(frame)
        self.assertEqual(prepared["timestamp"].iloc[-1],frame["timestamp"].iloc[-6])
        self.assertEqual(len(prepared),len(frame)-25-5)
    def test_future_funding_observation_is_rejected(self):
        frame=add_funding_provenance(market_frame())
        frame["funding_available_at"]=frame["timestamp"]+pd.Timedelta(minutes=1)
        with self.assertRaisesRegex(LearningGateError,"funding_not_available_at_decision_time"):
            SupervisedWorker(horizon=5).create_features(frame)
    def test_funding_without_full_provenance_is_rejected(self):
        frame=market_frame()
        frame["funding_rate"]=0.0001
        with self.assertRaisesRegex(LearningGateError,"funding_requires_rate_source_observed_at_and_available_at"):
            SupervisedWorker(horizon=5).create_features(frame)
    def test_valid_funding_provenance_is_accepted(self):
        worker=SupervisedWorker(horizon=5)
        prepared=worker.create_features(add_funding_provenance(market_frame()))
        self.assertIn("funding_rate",worker.feature_columns)
        self.assertEqual(len(prepared),len(market_frame())-25-5)

    def test_non_finite_funding_rate_is_rejected(self):
        frame=add_funding_provenance(market_frame())
        frame.loc[40,"funding_rate"]=float("inf")
        with self.assertRaisesRegex(LearningGateError,"funding_rate_invalid"):
            SupervisedWorker(horizon=5).create_features(frame)

    def test_non_numeric_funding_rate_is_rejected(self):
        frame=add_funding_provenance(market_frame())
        frame["funding_rate"]=frame["funding_rate"].astype(object)
        frame.loc[40,"funding_rate"]="not-a-number"
        with self.assertRaisesRegex(LearningGateError,"funding_rate_invalid"):
            SupervisedWorker(horizon=5).create_features(frame)

    def test_naive_funding_timestamps_are_rejected(self):
        frame=add_funding_provenance(market_frame())
        frame["funding_available_at"]=frame["funding_available_at"].map(lambda value:value.isoformat().replace("+00:00",""))
        with self.assertRaisesRegex(LearningGateError,"funding_timestamps_must_be_timezone_aware"):
            SupervisedWorker(horizon=5).create_features(frame)

if __name__=="__main__":
    unittest.main()
